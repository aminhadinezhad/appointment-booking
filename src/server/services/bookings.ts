/**
 * Booking engine. Every write re-validates the slot on the server inside a
 * transaction; the partial unique indexes are the final guard against races.
 */
import type { Booking, BookingStatus } from "@prisma/client";
import { dateKeyToDb, dbToDateKey, type DateKey } from "@/lib/dates";
import { checkSlotBookable, computeDaySlots, type SlotView } from "@/lib/slots";
import { isSlotEnded, isSlotStarted, tehranParts } from "@/lib/time";
import { audit } from "../audit";
import { acquireScheduleLock, db, isUniqueViolation, TX_OPTIONS, type Tx } from "../db";
import { AppError } from "../errors";
import { activeBookingsForDate, activeLocksForDate } from "./schedule-data";
import { getSettings } from "./settings";

export type Clock = { now?: Date };

export type BookingDisplayStatus = "UPCOMING" | "IN_PROGRESS" | "HELD" | "CANCELLED";

export interface BookingDTO {
  id: string;
  dateKey: DateKey;
  hour: number;
  status: BookingStatus;
  displayStatus: BookingDisplayStatus;
  createdAt: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelledByAdmin: boolean;
  canModify: boolean;
}

type BookingRow = Booking & { cancelledBy?: { role: string } | null };

export function displayStatusOf(
  booking: Pick<Booking, "status" | "date" | "hour">,
  now: Date = new Date(),
): BookingDisplayStatus {
  if (booking.status === "CANCELLED") return "CANCELLED";
  const t = tehranParts(now);
  const key = dbToDateKey(booking.date);
  if (isSlotEnded(key, booking.hour, t)) return "HELD";
  if (isSlotStarted(key, booking.hour, t)) return "IN_PROGRESS";
  return "UPCOMING";
}

export function toBookingDTO(row: BookingRow, now: Date = new Date()): BookingDTO {
  const displayStatus = displayStatusOf(row, now);
  return {
    id: row.id,
    dateKey: dbToDateKey(row.date),
    hour: row.hour,
    status: row.status,
    displayStatus,
    createdAt: row.createdAt.toISOString(),
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancelReason: row.cancelReason,
    cancelledByAdmin: row.cancelledBy?.role === "ADMIN",
    canModify: displayStatus === "UPCOMING",
  };
}

async function assertActiveUser(tx: Tx, userId: string): Promise<void> {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { isActive: true, role: true } });
  if (!user || user.role !== "USER") throw new AppError("FORBIDDEN");
  if (!user.isActive) throw new AppError("ACCOUNT_DISABLED");
}

/** Validates the slot against settings, time, locks and existing bookings, then inserts. */
async function insertBooking(
  tx: Tx,
  params: { userId: string; dateKey: DateKey; hour: number; now: Date; rescheduledFromId?: string },
): Promise<Booking> {
  const { userId, dateKey, hour } = params;
  const settings = await getSettings(tx);
  const locks = await activeLocksForDate(tx, dateKey);
  const bookings = await activeBookingsForDate(tx, dateKey);

  const check = checkSlotBookable(
    { dateKey, now: tehranParts(params.now), ...settings, locks, bookings, viewerId: userId },
    hour,
  );
  if (!check.ok) throw new AppError(check.reason);
  if (bookings.some((b) => b.userId === userId)) throw new AppError("ONE_BOOKING_PER_DAY");

  try {
    return await tx.booking.create({
      data: { userId, date: dateKeyToDb(dateKey), hour, rescheduledFromId: params.rescheduledFromId },
    });
  } catch (error) {
    throw mapBookingUniqueViolation(error);
  }
}

/** Translates a violation of one of the partial unique indexes into a domain error. */
function mapBookingUniqueViolation(error: unknown): unknown {
  if (!isUniqueViolation(error)) return error;
  // meta.target lists the index columns: ["userId","date"] or ["date","hour"].
  const target = error.meta?.target;
  const columns = Array.isArray(target) ? target.map(String) : [String(target ?? "")];
  const isUserDay = columns.some((c) => c === "userId" || c.includes("user_day"));
  return new AppError(isUserDay ? "ONE_BOOKING_PER_DAY" : "SLOT_TAKEN");
}

/** Wraps transaction errors that Postgres raises outside the callback (e.g. at commit). */
async function runBookingTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await db.$transaction(fn, TX_OPTIONS);
  } catch (error) {
    throw mapBookingUniqueViolation(error);
  }
}

export async function createBooking(
  input: { userId: string; dateKey: DateKey; hour: number },
  clock: Clock = {},
): Promise<Booking> {
  const now = clock.now ?? new Date();
  return runBookingTx(async (tx) => {
    await acquireScheduleLock(tx, "shared");
    await assertActiveUser(tx, input.userId);
    const booking = await insertBooking(tx, { userId: input.userId, dateKey: input.dateKey, hour: input.hour, now });
    await audit(tx, {
      actorId: input.userId,
      action: "BOOKING_CREATED",
      entity: "Booking",
      entityId: booking.id,
      details: { date: input.dateKey, hour: input.hour },
    });
    return booking;
  });
}

/**
 * Cancels an active booking that has not started yet. Users can cancel only
 * their own bookings; admins can cancel any. The record is kept for history.
 */
export async function cancelBooking(
  input: { bookingId: string; actor: { id: string; role: "USER" | "ADMIN" }; reason?: string | null },
  clock: Clock = {},
): Promise<Booking> {
  const now = clock.now ?? new Date();
  return runBookingTx(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: input.bookingId } });
    if (!booking || (input.actor.role !== "ADMIN" && booking.userId !== input.actor.id)) throw new AppError("NOT_FOUND");
    if (booking.status !== "ACTIVE") throw new AppError("BOOKING_NOT_ACTIVE");
    if (isSlotStarted(dbToDateKey(booking.date), booking.hour, tehranParts(now))) throw new AppError("BOOKING_ALREADY_STARTED");

    const reason = input.reason?.trim() || (input.actor.role === "ADMIN" ? "لغو توسط مدیر" : "لغو توسط کاربر");
    const updated = await tx.booking.updateMany({
      where: { id: booking.id, status: "ACTIVE" },
      data: { status: "CANCELLED", cancelledAt: now, cancelledById: input.actor.id, cancelReason: reason },
    });
    if (updated.count === 0) throw new AppError("BOOKING_NOT_ACTIVE");

    await audit(tx, {
      actorId: input.actor.id,
      action: "BOOKING_CANCELLED",
      entity: "Booking",
      entityId: booking.id,
      details: { date: dbToDateKey(booking.date), hour: booking.hour, reason, byAdmin: input.actor.role === "ADMIN" },
    });
    return tx.booking.findUniqueOrThrow({ where: { id: booking.id } });
  });
}

/**
 * Atomically moves a booking to another slot: the old booking is cancelled and
 * the new one created in the same transaction. If the new slot is rejected for
 * any reason, nothing changes.
 */
export async function rescheduleBooking(
  input: { userId: string; bookingId: string; dateKey: DateKey; hour: number },
  clock: Clock = {},
): Promise<Booking> {
  const now = clock.now ?? new Date();
  return runBookingTx(async (tx) => {
    await acquireScheduleLock(tx, "shared");
    await assertActiveUser(tx, input.userId);

    const old = await tx.booking.findUnique({ where: { id: input.bookingId } });
    if (!old || old.userId !== input.userId) throw new AppError("NOT_FOUND");
    if (old.status !== "ACTIVE") throw new AppError("BOOKING_NOT_ACTIVE");
    if (isSlotStarted(dbToDateKey(old.date), old.hour, tehranParts(now))) throw new AppError("BOOKING_ALREADY_STARTED");
    if (dbToDateKey(old.date) === input.dateKey && old.hour === input.hour) throw new AppError("SAME_SLOT");

    const cancelled = await tx.booking.updateMany({
      where: { id: old.id, status: "ACTIVE" },
      data: { status: "CANCELLED", cancelledAt: now, cancelledById: input.userId, cancelReason: "تغییر ساعت توسط کاربر" },
    });
    if (cancelled.count === 0) throw new AppError("BOOKING_NOT_ACTIVE");

    const booking = await insertBooking(tx, {
      userId: input.userId,
      dateKey: input.dateKey,
      hour: input.hour,
      now,
      rescheduledFromId: old.id,
    });
    await audit(tx, {
      actorId: input.userId,
      action: "BOOKING_RESCHEDULED",
      entity: "Booking",
      entityId: booking.id,
      details: {
        from: { id: old.id, date: dbToDateKey(old.date), hour: old.hour },
        to: { date: input.dateKey, hour: input.hour },
      },
    });
    return booking;
  });
}

export async function getDaySlots(dateKey: DateKey, viewerId: string | null, clock: Clock = {}): Promise<SlotView[]> {
  const now = clock.now ?? new Date();
  const [settings, locks, bookings] = await Promise.all([
    getSettings(),
    activeLocksForDate(db, dateKey),
    activeBookingsForDate(db, dateKey),
  ]);
  return computeDaySlots({ dateKey, now: tehranParts(now), ...settings, locks, bookings, viewerId });
}

export async function listUserBookings(userId: string, clock: Clock = {}): Promise<BookingDTO[]> {
  const rows = await db.booking.findMany({
    where: { userId },
    include: { cancelledBy: { select: { role: true } } },
    orderBy: [{ date: "desc" }, { hour: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  return rows.map((row) => toBookingDTO(row, clock.now));
}

export async function getUserBooking(userId: string, bookingId: string, clock: Clock = {}): Promise<BookingDTO> {
  const row = await db.booking.findUnique({
    where: { id: bookingId },
    include: { cancelledBy: { select: { role: true } } },
  });
  if (!row || row.userId !== userId) throw new AppError("NOT_FOUND");
  return toBookingDTO(row, clock.now);
}
