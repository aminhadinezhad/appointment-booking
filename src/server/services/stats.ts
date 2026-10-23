import { addDays, dateKeyToDb, dbToDateKey, jalaliMonthDays, toJalali, type DateKey } from "@/lib/dates";
import { isSlotEnded, tehranParts, tehranStartOfDay } from "@/lib/time";
import { db } from "../db";
import type { Clock } from "./bookings";

export interface MonthlyStats {
  jy: number;
  jm: number;
  users: { total: number; active: number; newThisMonth: number };
  bookings: { total: number; held: number; pending: number; cancelled: number };
  gender: { male: number; female: number; unknown: number };
  daily: { dateKey: DateKey; day: number; held: number; pending: number; cancelled: number }[];
  hourly: { hour: number; count: number }[];
}

export async function getMonthlyStats(jy: number, jm: number, clock: Clock = {}): Promise<MonthlyStats> {
  const now = tehranParts(clock.now ?? new Date());
  const days = jalaliMonthDays(jy, jm);
  const from = days[0]!;
  const to = days.at(-1)!;
  const monthStart = tehranStartOfDay(from);
  const monthEnd = tehranStartOfDay(addDays(to, 1));

  const [totalUsers, activeUsers, newUsers, genderGroups, bookings] = await Promise.all([
    db.user.count({ where: { role: "USER" } }),
    db.user.count({ where: { role: "USER", isActive: true } }),
    db.user.count({ where: { role: "USER", createdAt: { gte: monthStart, lt: monthEnd } } }),
    db.user.groupBy({ by: ["gender"], where: { role: "USER" }, _count: { _all: true } }),
    db.booking.findMany({
      where: { date: { gte: dateKeyToDb(from), lte: dateKeyToDb(to) } },
      select: { date: true, hour: true, status: true },
    }),
  ]);

  const daily = new Map(days.map((dateKey) => [dateKey, { dateKey, day: toJalali(dateKey).jd, held: 0, pending: 0, cancelled: 0 }]));
  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  const totals = { total: bookings.length, held: 0, pending: 0, cancelled: 0 };

  for (const b of bookings) {
    const dateKey = dbToDateKey(b.date);
    const bucket = daily.get(dateKey)!;
    if (b.status === "CANCELLED") {
      totals.cancelled++;
      bucket.cancelled++;
      continue;
    }
    hourly[b.hour]!.count++;
    if (isSlotEnded(dateKey, b.hour, now)) {
      totals.held++;
      bucket.held++;
    } else {
      totals.pending++;
      bucket.pending++;
    }
  }

  const genderCount = (g: "MALE" | "FEMALE" | null) => genderGroups.find((x) => x.gender === g)?._count._all ?? 0;

  return {
    jy,
    jm,
    users: { total: totalUsers, active: activeUsers, newThisMonth: newUsers },
    bookings: totals,
    gender: { male: genderCount("MALE"), female: genderCount("FEMALE"), unknown: genderCount(null) },
    daily: [...daily.values()],
    hourly,
  };
}

export function currentJalaliMonth(clock: Clock = {}): { jy: number; jm: number } {
  const { jy, jm } = toJalali(tehranParts(clock.now ?? new Date()).dateKey);
  return { jy, jm };
}
