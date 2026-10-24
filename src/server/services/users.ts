import type { Gender, Prisma } from "@prisma/client";
import { toEnDigits } from "@/lib/digits";
import { audit } from "../audit";
import { deleteUserSessions } from "../auth/sessions";
import { db } from "../db";
import { AppError } from "../errors";
import { toBookingDTO, type BookingDTO, type Clock } from "./bookings";

export interface UserListItem {
  id: string;
  fullName: string;
  phone: string | null;
  gender: Gender | null;
  isActive: boolean;
  createdAt: string;
  bookingsCount: number;
  activeBookingsCount: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listUsers(params: {
  q?: string;
  status?: "ALL" | "ACTIVE" | "INACTIVE";
  page?: number;
  pageSize?: number;
}): Promise<Page<UserListItem>> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
  const q = params.q?.trim();
  const where: Prisma.UserWhereInput = {
    role: "USER",
    ...(params.status === "ACTIVE" ? { isActive: true } : params.status === "INACTIVE" ? { isActive: false } : {}),
    ...(q
      ? {
          OR: [
            { fullName: { contains: q, mode: "insensitive" } },
            { phone: { contains: toEnDigits(q).replace(/\D/g, "") || q } },
          ],
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        fullName: true,
        phone: true,
        gender: true,
        isActive: true,
        createdAt: true,
        _count: { select: { bookings: true } },
      },
    }),
  ]);
  const activeCounts = await db.booking.groupBy({
    by: ["userId"],
    where: { status: "ACTIVE", userId: { in: rows.map((r) => r.id) } },
    _count: { _all: true },
  });
  const activeByUser = new Map(activeCounts.map((c) => [c.userId, c._count._all]));
  return {
    items: rows.map((r) => ({
      id: r.id,
      fullName: r.fullName,
      phone: r.phone,
      gender: r.gender,
      isActive: r.isActive,
      createdAt: r.createdAt.toISOString(),
      bookingsCount: r._count.bookings,
      activeBookingsCount: activeByUser.get(r.id) ?? 0,
    })),
    total,
    page,
    pageSize,
  };
}

export interface UserDetail {
  id: string;
  fullName: string;
  phone: string | null;
  gender: Gender | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  bookings: BookingDTO[];
  consents: { id: string; context: string; document: string; version: number; acceptedAt: string; ip: string | null }[];
}

export async function getUserDetail(id: string, clock: Clock = {}): Promise<UserDetail> {
  const user = await db.user.findUnique({
    where: { id },
    include: {
      bookings: {
        include: { cancelledBy: { select: { role: true } } },
        orderBy: [{ date: "desc" }, { hour: "desc" }],
        take: 200,
      },
      consents: { orderBy: { acceptedAt: "desc" }, take: 200 },
    },
  });
  if (!user || user.role !== "USER") throw new AppError("NOT_FOUND");
  return {
    id: user.id,
    fullName: user.fullName,
    phone: user.phone,
    gender: user.gender,
    isActive: user.isActive,
    notes: user.notes,
    createdAt: user.createdAt.toISOString(),
    bookings: user.bookings.map((b) => toBookingDTO(b, clock.now)),
    consents: user.consents.map((c) => ({
      id: c.id,
      context: c.context,
      document: c.document,
      version: c.version,
      acceptedAt: c.acceptedAt.toISOString(),
      ip: c.ip,
    })),
  };
}

/** Admin changes to a user. Deactivating signs the user out everywhere. */
export async function updateUserByAdmin(
  id: string,
  input: { isActive?: boolean; notes?: string | null },
  actorId: string,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id } });
    if (!user || user.role !== "USER") throw new AppError("NOT_FOUND");
    await tx.user.update({ where: { id }, data: input });
    if (input.isActive !== undefined && input.isActive !== user.isActive) {
      await audit(tx, { actorId, action: input.isActive ? "USER_ACTIVATED" : "USER_DEACTIVATED", entity: "User", entityId: id });
    }
    if (input.notes !== undefined && input.notes !== user.notes) {
      await audit(tx, { actorId, action: "USER_UPDATED", entity: "User", entityId: id, details: { field: "notes" } });
    }
  });
  if (input.isActive === false) await deleteUserSessions(id);
}

export async function updateOwnProfile(userId: string, input: { fullName: string; gender: Gender }): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: input });
    await audit(tx, { actorId: userId, action: "USER_UPDATED", entity: "User", entityId: userId, details: { fields: ["fullName", "gender"] } });
  });
}
