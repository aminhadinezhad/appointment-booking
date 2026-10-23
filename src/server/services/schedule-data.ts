/** Database reads shared by the booking engine, calendars and lock management. */
import type { ScheduleLock } from "@prisma/client";
import { dateKeyToDb, dbToDateKey, weekdayOf, type DateKey } from "@/lib/dates";
import type { ActiveBookingRef, LockRule } from "@/lib/slots";
import type { Tx } from "../db";

export function toLockRule(row: ScheduleLock): LockRule {
  return {
    id: row.id,
    type: row.type,
    date: row.date ? dbToDateKey(row.date) : null,
    weekday: row.weekday,
    startHour: row.startHour,
    endHour: row.endHour,
    isActive: row.isActive,
    reason: row.reason,
    isReasonPublic: row.isReasonPublic,
  };
}

/** Active locks that can affect the given date (dated locks of that day + weekly locks of its weekday). */
export async function activeLocksForDate(client: Tx, dateKey: DateKey): Promise<LockRule[]> {
  const rows = await client.scheduleLock.findMany({
    where: {
      isActive: true,
      OR: [{ date: dateKeyToDb(dateKey) }, { type: "WEEKLY", weekday: weekdayOf(dateKey) }],
    },
  });
  return rows.map(toLockRule);
}

/** Active locks that can affect any date in [from, to]. */
export async function activeLocksForRange(client: Tx, from: DateKey, to: DateKey): Promise<LockRule[]> {
  const rows = await client.scheduleLock.findMany({
    where: {
      isActive: true,
      OR: [{ date: { gte: dateKeyToDb(from), lte: dateKeyToDb(to) } }, { type: "WEEKLY" }],
    },
  });
  return rows.map(toLockRule);
}

export async function activeBookingsForDate(client: Tx, dateKey: DateKey): Promise<ActiveBookingRef[]> {
  return client.booking.findMany({
    where: { date: dateKeyToDb(dateKey), status: "ACTIVE" },
    select: { id: true, hour: true, userId: true },
  });
}

export async function activeBookingsForRange(
  client: Tx,
  from: DateKey,
  to: DateKey,
): Promise<(ActiveBookingRef & { dateKey: DateKey })[]> {
  const rows = await client.booking.findMany({
    where: { date: { gte: dateKeyToDb(from), lte: dateKeyToDb(to) }, status: "ACTIVE" },
    select: { id: true, hour: true, userId: true, date: true },
  });
  return rows.map(({ date, ...rest }) => ({ ...rest, dateKey: dbToDateKey(date) }));
}
