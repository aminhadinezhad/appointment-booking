/**
 * Pure slot/lock engine shared by the server (authoritative checks) and the
 * UI (display). No I/O here so that every rule is unit-testable.
 */
import { diffDays, weekdayOf, type DateKey } from "./dates";
import { isSlotStarted, type TehranNow } from "./time";

export const HOURS = Array.from({ length: 24 }, (_, h) => h);

export type LockTypeName = "FULL_DAY" | "TIME_RANGE" | "WEEKLY";

export interface LockRule {
  id: string;
  type: LockTypeName;
  date: DateKey | null;
  weekday: number | null;
  startHour: number;
  endHour: number; // exclusive
  isActive: boolean;
  reason?: string | null;
  isReasonPublic?: boolean;
}

export function isWholeDayLock(lock: Pick<LockRule, "startHour" | "endHour">): boolean {
  return lock.startHour === 0 && lock.endHour === 24;
}

/** Whether an active lock applies to the given calendar date (ignoring hours). */
export function lockAppliesToDate(lock: LockRule, dateKey: DateKey): boolean {
  if (!lock.isActive) return false;
  if (lock.type === "WEEKLY") return lock.weekday === weekdayOf(dateKey);
  return lock.date === dateKey;
}

export function lockCoversHour(lock: LockRule, dateKey: DateKey, hour: number): boolean {
  return lockAppliesToDate(lock, dateKey) && hour >= lock.startHour && hour < lock.endHour;
}

export function locksCoveringSlot(locks: LockRule[], dateKey: DateKey, hour: number): LockRule[] {
  return locks.filter((lock) => lockCoversHour(lock, dateKey, hour));
}

export function lockHours(lock: Pick<LockRule, "startHour" | "endHour">): number[] {
  return HOURS.filter((h) => h >= lock.startHour && h < lock.endHour);
}

/** First public reason among the given locks, if any. */
export function publicReasonOf(locks: LockRule[]): string | null {
  const lock = locks.find((l) => l.isReasonPublic && l.reason?.trim());
  return lock?.reason?.trim() ?? null;
}

export type SlotState =
  | "AVAILABLE"
  | "MINE" // the viewer's own active booking
  | "BOOKED" // someone else's active booking
  | "LOCKED" // covered by at least one active lock
  | "CLOSED_HOURS" // outside the general bookable hours
  | "PAST" // already started
  | "OUT_OF_RANGE"; // beyond the booking window (maxAdvanceDays)

export interface SlotView {
  hour: number;
  state: SlotState;
  bookingId?: string;
  publicReason?: string | null;
}

export interface ActiveBookingRef {
  id: string;
  hour: number;
  userId: string;
}

export interface DayContext {
  dateKey: DateKey;
  now: TehranNow;
  bookableHours: number[];
  maxAdvanceDays: number;
  /** Active locks; inactive ones are ignored anyway. */
  locks: LockRule[];
  /** Active bookings of this date. */
  bookings: ActiveBookingRef[];
  viewerId?: string | null;
}

export function isBeyondWindow(dateKey: DateKey, now: TehranNow, maxAdvanceDays: number): boolean {
  return diffDays(now.dateKey, dateKey) > maxAdvanceDays;
}

/**
 * State of every hour of a day, by precedence:
 * MINE > PAST > LOCKED > BOOKED > CLOSED_HOURS > OUT_OF_RANGE > AVAILABLE.
 */
export function computeDaySlots(ctx: DayContext): SlotView[] {
  const bookable = new Set(ctx.bookableHours);
  const beyond = isBeyondWindow(ctx.dateKey, ctx.now, ctx.maxAdvanceDays);
  const dayLocks = ctx.locks.filter((l) => lockAppliesToDate(l, ctx.dateKey));

  return HOURS.map((hour): SlotView => {
    const booking = ctx.bookings.find((b) => b.hour === hour);
    if (booking && ctx.viewerId && booking.userId === ctx.viewerId) {
      return { hour, state: "MINE", bookingId: booking.id };
    }
    if (isSlotStarted(ctx.dateKey, hour, ctx.now)) return { hour, state: "PAST" };
    const covering = dayLocks.filter((l) => hour >= l.startHour && hour < l.endHour);
    if (covering.length > 0) return { hour, state: "LOCKED", publicReason: publicReasonOf(covering) };
    if (booking) return { hour, state: "BOOKED" };
    if (!bookable.has(hour)) return { hour, state: "CLOSED_HOURS" };
    if (beyond) return { hour, state: "OUT_OF_RANGE" };
    return { hour, state: "AVAILABLE" };
  });
}

export type DayStatus =
  | "PAST" // the whole date is in the past
  | "CLOSED" // fully locked ("بسته است")
  | "AVAILABLE" // at least one free slot
  | "FULL" // every remaining open slot is booked
  | "UNAVAILABLE"; // nothing bookable for another reason (window, hours over, ...)

export interface DaySummary {
  dateKey: DateKey;
  status: DayStatus;
  /** Some (but not all) of the bookable hours are locked. */
  hasPartialLock: boolean;
  availableCount: number;
  hasMyBooking: boolean;
  publicReason: string | null;
}

export function summarizeDay(ctx: DayContext, slots: SlotView[] = computeDaySlots(ctx)): DaySummary {
  const dayLocks = ctx.locks.filter((l) => lockAppliesToDate(l, ctx.dateKey));
  const coveredHours = new Set(dayLocks.flatMap(lockHours));
  const wholeDayLocks = dayLocks.filter(isWholeDayLock);
  const fullyLocked =
    wholeDayLocks.length > 0 ||
    (ctx.bookableHours.length > 0 && ctx.bookableHours.every((h) => coveredHours.has(h)));
  const hasPartialLock = !fullyLocked && ctx.bookableHours.some((h) => coveredHours.has(h));
  const availableCount = slots.filter((s) => s.state === "AVAILABLE").length;
  const hasMyBooking = slots.some((s) => s.state === "MINE");
  const publicReason = publicReasonOf(wholeDayLocks.length ? wholeDayLocks : dayLocks);

  let status: DayStatus;
  if (ctx.dateKey < ctx.now.dateKey) status = "PAST";
  else if (fullyLocked) status = "CLOSED";
  else if (availableCount > 0) status = "AVAILABLE";
  else if (slots.some((s) => s.state === "BOOKED" && ctx.bookableHours.includes(s.hour))) status = "FULL";
  else status = "UNAVAILABLE";

  return { dateKey: ctx.dateKey, status, hasPartialLock, availableCount, hasMyBooking, publicReason };
}

export type SlotRejection =
  | "SLOT_IN_PAST"
  | "SLOT_LOCKED"
  | "SLOT_TAKEN"
  | "SLOT_NOT_BOOKABLE"
  | "BEYOND_BOOKING_WINDOW";

const REJECTION_BY_STATE: Record<Exclude<SlotState, "AVAILABLE">, SlotRejection> = {
  MINE: "SLOT_TAKEN",
  BOOKED: "SLOT_TAKEN",
  PAST: "SLOT_IN_PAST",
  LOCKED: "SLOT_LOCKED",
  CLOSED_HOURS: "SLOT_NOT_BOOKABLE",
  OUT_OF_RANGE: "BEYOND_BOOKING_WINDOW",
};

/** Authoritative check used by the booking engine. */
export function checkSlotBookable(ctx: DayContext, hour: number): { ok: true } | { ok: false; reason: SlotRejection } {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return { ok: false, reason: "SLOT_NOT_BOOKABLE" };
  const slot = computeDaySlots(ctx)[hour]!;
  return slot.state === "AVAILABLE" ? { ok: true } : { ok: false, reason: REJECTION_BY_STATE[slot.state] };
}
