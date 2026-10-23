import type { Prisma } from "@prisma/client";
import { dateKeyToDb, dbToDateKey, type DateKey } from "@/lib/dates";
import { toEnDigits } from "@/lib/digits";
import { locksCoveringSlot } from "@/lib/slots";
import { tehranParts } from "@/lib/time";
import { db } from "../db";
import { toBookingDTO, type BookingDTO, type Clock } from "./bookings";
import { activeLocksForRange } from "./schedule-data";
import type { Page } from "./users";

export type AdminBookingStatusFilter = "ALL" | "ACTIVE" | "PENDING" | "HELD" | "CANCELLED";

export interface AdminBookingItem extends BookingDTO {
  user: { id: string; fullName: string; phone: string | null };
  /** Kept booking that now lies inside an active lock ("رزرو موجود در محدوده قفل‌شده"). */
  inLockedRange: boolean;
}

export interface AdminBookingFilter {
  from?: DateKey;
  to?: DateKey;
  status?: AdminBookingStatusFilter;
  q?: string;
  userId?: string;
  inLockedRangeOnly?: boolean;
  page?: number;
  pageSize?: number;
}

/** Prisma filter for "slot has ended" / "slot has not ended" relative to Tehran now. */
export function endedWhere(now: Date, ended: boolean): Prisma.BookingWhereInput {
  const t = tehranParts(now);
  const today = dateKeyToDb(t.dateKey);
  return ended
    ? { OR: [{ date: { lt: today } }, { date: today, hour: { lt: t.hour } }] }
    : { OR: [{ date: { gt: today } }, { date: today, hour: { gte: t.hour } }] };
}

export async function listAdminBookings(filter: AdminBookingFilter, clock: Clock = {}): Promise<Page<AdminBookingItem>> {
  const now = clock.now ?? new Date();
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, filter.pageSize ?? 30));
  const and: Prisma.BookingWhereInput[] = [];

  if (filter.from || filter.to) {
    and.push({
      date: {
        ...(filter.from ? { gte: dateKeyToDb(filter.from) } : {}),
        ...(filter.to ? { lte: dateKeyToDb(filter.to) } : {}),
      },
    });
  }
  switch (filter.status ?? "ALL") {
    case "ACTIVE":
      and.push({ status: "ACTIVE" });
      break;
    case "PENDING":
      and.push({ status: "ACTIVE" }, endedWhere(now, false));
      break;
    case "HELD":
      and.push({ status: "ACTIVE" }, endedWhere(now, true));
      break;
    case "CANCELLED":
      and.push({ status: "CANCELLED" });
      break;
  }
  if (filter.userId) and.push({ userId: filter.userId });
  const q = filter.q?.trim();
  if (q) {
    const digits = toEnDigits(q).replace(/\D/g, "");
    and.push({
      user: {
        OR: [{ fullName: { contains: q, mode: "insensitive" } }, ...(digits ? [{ phone: { contains: digits } }] : [])],
      },
    });
  }

  const where: Prisma.BookingWhereInput = { AND: and };
  const include = {
    user: { select: { id: true, fullName: true, phone: true } },
    cancelledBy: { select: { role: true } },
  } as const;
  const orderBy: Prisma.BookingOrderByWithRelationInput[] = [{ date: "desc" }, { hour: "desc" }, { createdAt: "desc" }];

  const toItems = async (rows: Prisma.BookingGetPayload<{ include: typeof include }>[]) => {
    if (rows.length === 0) return [];
    const keys = rows.map((r) => dbToDateKey(r.date)).sort();
    const locks = await activeLocksForRange(db, keys[0]!, keys.at(-1)!);
    return rows.map((r) => {
      const dto = toBookingDTO(r, now);
      return {
        ...dto,
        user: r.user,
        inLockedRange: r.status === "ACTIVE" && locksCoveringSlot(locks, dto.dateKey, r.hour).length > 0,
      };
    });
  };

  if (filter.inLockedRangeOnly) {
    // Lock coverage is computed in memory, so filter the full (active) set first.
    const rows = await db.booking.findMany({ where: { AND: [...and, { status: "ACTIVE" }] }, include, orderBy, take: 2000 });
    const items = (await toItems(rows)).filter((i) => i.inLockedRange);
    return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize };
  }

  const [total, rows] = await Promise.all([
    db.booking.count({ where }),
    db.booking.findMany({ where, include, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { items: await toItems(rows), total, page, pageSize };
}
