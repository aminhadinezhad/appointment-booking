import { dateKeyToDb, jalaliMonthDays, type DateKey } from "@/lib/dates";
import {
  HOURS,
  isWholeDayLock,
  lockAppliesToDate,
  lockHours,
  locksCoveringSlot,
  summarizeDay,
  type DaySummary,
  type LockRule,
} from "@/lib/slots";
import { isSlotStarted, tehranParts } from "@/lib/time";
import { db } from "../db";
import { activeBookingsForRange, activeLocksForRange } from "./schedule-data";
import { getSettings } from "./settings";
import type { Clock } from "./bookings";

/** Day summaries of a Jalali month for the user calendar. */
export async function getUserMonth(jy: number, jm: number, viewerId: string | null, clock: Clock = {}): Promise<DaySummary[]> {
  const days = jalaliMonthDays(jy, jm);
  const from = days[0]!;
  const to = days.at(-1)!;
  const now = tehranParts(clock.now ?? new Date());
  const [settings, locks, bookings] = await Promise.all([
    getSettings(),
    activeLocksForRange(db, from, to),
    activeBookingsForRange(db, from, to),
  ]);
  return days.map((dateKey) =>
    summarizeDay({
      dateKey,
      now,
      ...settings,
      locks,
      bookings: bookings.filter((b) => b.dateKey === dateKey),
      viewerId,
    }),
  );
}

export interface AdminDayOverview {
  dateKey: DateKey;
  fullyClosed: boolean;
  lockedHours: number[];
  lockIds: string[];
  bookingsCount: number;
  bookingsInLockedRange: number;
}

/** Lock and booking overview of a Jalali month for the admin schedule calendar. */
export async function getAdminMonth(jy: number, jm: number): Promise<AdminDayOverview[]> {
  const days = jalaliMonthDays(jy, jm);
  const [locks, bookings] = await Promise.all([
    activeLocksForRange(db, days[0]!, days.at(-1)!),
    activeBookingsForRange(db, days[0]!, days.at(-1)!),
  ]);
  return days.map((dateKey) => {
    const dayLocks = locks.filter((l) => lockAppliesToDate(l, dateKey));
    const lockedHours = [...new Set(dayLocks.flatMap(lockHours))].sort((a, b) => a - b);
    const dayBookings = bookings.filter((b) => b.dateKey === dateKey);
    return {
      dateKey,
      fullyClosed: dayLocks.some(isWholeDayLock) || lockedHours.length === 24,
      lockedHours,
      lockIds: dayLocks.map((l) => l.id),
      bookingsCount: dayBookings.length,
      bookingsInLockedRange: dayBookings.filter((b) => lockedHours.includes(b.hour)).length,
    };
  });
}

export interface AdminSlot {
  hour: number;
  isBookableHour: boolean;
  isPast: boolean;
  locks: { id: string; type: LockRule["type"]; reason: string | null }[];
  booking: { id: string; user: { id: string; fullName: string; phone: string | null } } | null;
}

/** Hour-by-hour view of one date for admins. */
export async function getAdminDay(dateKey: DateKey, clock: Clock = {}): Promise<AdminSlot[]> {
  const now = tehranParts(clock.now ?? new Date());
  const [settings, locks, bookings] = await Promise.all([
    getSettings(),
    activeLocksForRange(db, dateKey, dateKey),
    db.booking.findMany({
      where: { date: dateKeyToDb(dateKey), status: "ACTIVE" },
      select: { id: true, hour: true, user: { select: { id: true, fullName: true, phone: true } } },
    }),
  ]);
  return HOURS.map((hour) => {
    const booking = bookings.find((b) => b.hour === hour);
    return {
      hour,
      isBookableHour: settings.bookableHours.includes(hour),
      isPast: isSlotStarted(dateKey, hour, now),
      locks: locksCoveringSlot(locks, dateKey, hour).map((l) => ({ id: l.id, type: l.type, reason: l.reason ?? null })),
      booking: booking ? { id: booking.id, user: booking.user } : null,
    };
  });
}
