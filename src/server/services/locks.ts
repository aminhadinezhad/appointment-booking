/**
 * Schedule locks (closures). Creating/editing/reactivating a lock never
 * silently removes bookings: by default existing bookings are kept and only
 * new bookings are blocked; cancelling them is an explicit admin choice.
 */
import type { Prisma, ScheduleLock } from "@prisma/client";
import { addDays, dateKeyToDb, dbToDateKey, diffDays, weekdayOf, type DateKey } from "@/lib/dates";
import { describeLockScope } from "@/lib/locks";
import { lockCoversHour, type LockRule } from "@/lib/slots";
import { isSlotStarted, tehranParts } from "@/lib/time";
import type { NormalizedLock } from "@/lib/validation";
import { audit } from "../audit";
import { acquireScheduleLock, db, TX_OPTIONS, type Tx } from "../db";
import { AppError } from "../errors";
import { toLockRule } from "./schedule-data";

export type ConflictMode = "KEEP_BOOKINGS" | "CANCEL_BOOKINGS";

export interface AffectedBooking {
  id: string;
  dateKey: DateKey;
  hour: number;
  user: { id: string; fullName: string; phone: string | null };
}

export interface LockImpact {
  scope: string;
  affectedBookings: AffectedBooking[];
  affectedUsers: number;
  overlappingLocks: { id: string; scope: string }[];
}

type PersonRef = { id: string; fullName: string } | null;

export interface LockDTO {
  id: string;
  type: ScheduleLock["type"];
  dateKey: DateKey | null;
  weekday: number | null;
  startHour: number;
  endHour: number;
  reason: string | null;
  isReasonPublic: boolean;
  isActive: boolean;
  scope: string;
  createdAt: string;
  updatedAt: string;
  unlockedAt: string | null;
  unlockReason: string | null;
  createdBy: PersonRef;
  updatedBy: PersonRef;
  unlockedBy: PersonRef;
  /** Active, not-yet-started bookings that were kept inside this lock's range. */
  keptBookingsCount: number;
}

const LOCK_INCLUDE = {
  createdBy: { select: { id: true, fullName: true } },
  updatedBy: { select: { id: true, fullName: true } },
  unlockedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.ScheduleLockInclude;

type LockRow = Prisma.ScheduleLockGetPayload<{ include: typeof LOCK_INCLUDE }>;

function toLockDTO(row: LockRow, keptBookingsCount = 0): LockDTO {
  const rule = toLockRule(row);
  return {
    id: row.id,
    type: row.type,
    dateKey: rule.date,
    weekday: row.weekday,
    startHour: row.startHour,
    endHour: row.endHour,
    reason: row.reason,
    isReasonPublic: row.isReasonPublic,
    isActive: row.isActive,
    scope: describeLockScope(rule),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    unlockedAt: row.unlockedAt?.toISOString() ?? null,
    unlockReason: row.unlockReason,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    unlockedBy: row.unlockedBy,
    keptBookingsCount,
  };
}

function asRule(lock: NormalizedLock, id = "candidate"): LockRule {
  return { id, ...lock };
}

/** Active, not-yet-started bookings inside the range of the given lock. */
async function findAffectedBookings(client: Tx, lock: NormalizedLock, now: Date): Promise<AffectedBooking[]> {
  if (!lock.isActive) return [];
  const t = tehranParts(now);
  const rows = await client.booking.findMany({
    where: {
      status: "ACTIVE",
      hour: { gte: lock.startHour, lt: lock.endHour },
      date: lock.date ? dateKeyToDb(lock.date) : { gte: dateKeyToDb(t.dateKey) },
    },
    select: { id: true, date: true, hour: true, user: { select: { id: true, fullName: true, phone: true } } },
    orderBy: [{ date: "asc" }, { hour: "asc" }],
  });
  const rule = asRule(lock);
  return rows
    .map((r) => ({ id: r.id, dateKey: dbToDateKey(r.date), hour: r.hour, user: r.user }))
    .filter((b) => !isSlotStarted(b.dateKey, b.hour, t) && lockCoversHour(rule, b.dateKey, b.hour));
}

/** Other active locks whose range intersects the given one (informational). */
async function findOverlappingLocks(client: Tx, lock: NormalizedLock, now: Date, excludeId?: string): Promise<LockRule[]> {
  const rows = await client.scheduleLock.findMany({
    where: {
      isActive: true,
      startHour: { lt: lock.endHour },
      endHour: { gt: lock.startHour },
      ...(excludeId ? { id: { not: excludeId } } : {}),
      OR: lock.date
        ? [{ date: dateKeyToDb(lock.date) }, { type: "WEEKLY", weekday: weekdayOf(lock.date) }]
        : [{ type: "WEEKLY", weekday: lock.weekday }, { type: { not: "WEEKLY" }, date: { gte: dateKeyToDb(tehranParts(now).dateKey) } }],
    },
  });
  return rows
    .map(toLockRule)
    .filter((other) => lock.date !== null || other.type === "WEEKLY" || (other.date !== null && weekdayOf(other.date) === lock.weekday));
}

export async function previewLockImpact(
  lock: NormalizedLock,
  opts: { now?: Date; excludeLockId?: string } = {},
): Promise<LockImpact> {
  const now = opts.now ?? new Date();
  const [affectedBookings, overlapping] = await Promise.all([
    findAffectedBookings(db, lock, now),
    findOverlappingLocks(db, lock, now, opts.excludeLockId),
  ]);
  return {
    scope: describeLockScope(lock),
    affectedBookings,
    affectedUsers: new Set(affectedBookings.map((b) => b.user.id)).size,
    overlappingLocks: overlapping.map((l) => ({ id: l.id, scope: describeLockScope(l) })),
  };
}

async function cancelAffectedBookings(
  tx: Tx,
  bookings: AffectedBooking[],
  params: { actorId: string; lockId: string; reason?: string; now: Date },
): Promise<number> {
  if (bookings.length === 0) return 0;
  const reason = params.reason?.trim() || "لغو به دلیل بسته‌شدن زمان توسط مدیر";
  const result = await tx.booking.updateMany({
    where: { id: { in: bookings.map((b) => b.id) }, status: "ACTIVE" },
    data: { status: "CANCELLED", cancelledAt: params.now, cancelledById: params.actorId, cancelReason: reason },
  });
  await tx.auditLog.createMany({
    data: bookings.map((b) => ({
      actorId: params.actorId,
      action: "BOOKING_CANCELLED",
      entity: "Booking",
      entityId: b.id,
      details: { date: b.dateKey, hour: b.hour, reason, byAdmin: true, lockId: params.lockId },
    })),
  });
  return result.count;
}

function lockData(lock: NormalizedLock) {
  return {
    type: lock.type,
    date: lock.date ? dateKeyToDb(lock.date) : null,
    weekday: lock.weekday,
    startHour: lock.startHour,
    endHour: lock.endHour,
    reason: lock.reason,
    isReasonPublic: lock.isReasonPublic,
  };
}

function snapshot(lock: NormalizedLock | LockRule): Prisma.InputJsonValue {
  return {
    type: lock.type,
    date: lock.date,
    weekday: lock.weekday,
    startHour: lock.startHour,
    endHour: lock.endHour,
    reason: lock.reason ?? null,
    isReasonPublic: lock.isReasonPublic ?? false,
    isActive: lock.isActive,
  };
}

export interface LockWriteResult {
  lock: LockDTO;
  affectedCount: number;
  cancelledCount: number;
}

interface WriteOptions {
  actorId: string;
  conflictMode?: ConflictMode;
  cancelReason?: string;
  now?: Date;
}

export async function createLock(lock: NormalizedLock, opts: WriteOptions): Promise<LockWriteResult> {
  const now = opts.now ?? new Date();
  return db.$transaction(async (tx) => {
    await acquireScheduleLock(tx, "exclusive");
    const affected = await findAffectedBookings(tx, lock, now);
    const row = await tx.scheduleLock.create({
      data: { ...lockData(lock), isActive: lock.isActive, createdById: opts.actorId },
    });
    const cancelledCount =
      opts.conflictMode === "CANCEL_BOOKINGS"
        ? await cancelAffectedBookings(tx, affected, { actorId: opts.actorId, lockId: row.id, reason: opts.cancelReason, now })
        : 0;
    await audit(tx, {
      actorId: opts.actorId,
      action: "LOCK_CREATED",
      entity: "ScheduleLock",
      entityId: row.id,
      details: { lock: snapshot(lock), conflictMode: opts.conflictMode ?? "KEEP_BOOKINGS", affectedCount: affected.length, cancelledCount },
    });
    const full = await tx.scheduleLock.findUniqueOrThrow({ where: { id: row.id }, include: LOCK_INCLUDE });
    return { lock: toLockDTO(full, affected.length - cancelledCount), affectedCount: affected.length, cancelledCount };
  }, TX_OPTIONS);
}

export async function updateLock(id: string, lock: NormalizedLock, opts: WriteOptions): Promise<LockWriteResult> {
  const now = opts.now ?? new Date();
  return db.$transaction(async (tx) => {
    await acquireScheduleLock(tx, "exclusive");
    const before = await tx.scheduleLock.findUnique({ where: { id } });
    if (!before) throw new AppError("NOT_FOUND");
    const affected = await findAffectedBookings(tx, lock, now);
    const reactivating = lock.isActive && !before.isActive;
    const deactivating = !lock.isActive && before.isActive;
    await tx.scheduleLock.update({
      where: { id },
      data: {
        ...lockData(lock),
        isActive: lock.isActive,
        updatedById: opts.actorId,
        ...(reactivating ? { unlockedAt: null, unlockedById: null, unlockReason: null } : {}),
        ...(deactivating ? { unlockedAt: now, unlockedById: opts.actorId, unlockReason: "غیرفعال‌سازی هنگام ویرایش" } : {}),
      },
    });
    const cancelledCount =
      opts.conflictMode === "CANCEL_BOOKINGS"
        ? await cancelAffectedBookings(tx, affected, { actorId: opts.actorId, lockId: id, reason: opts.cancelReason, now })
        : 0;
    await audit(tx, {
      actorId: opts.actorId,
      action: "LOCK_UPDATED",
      entity: "ScheduleLock",
      entityId: id,
      details: {
        before: snapshot(toLockRule(before)),
        after: snapshot(lock),
        conflictMode: opts.conflictMode ?? "KEEP_BOOKINGS",
        affectedCount: affected.length,
        cancelledCount,
      },
    });
    const full = await tx.scheduleLock.findUniqueOrThrow({ where: { id }, include: LOCK_INCLUDE });
    return { lock: toLockDTO(full, affected.length - cancelledCount), affectedCount: affected.length, cancelledCount };
  }, TX_OPTIONS);
}

/** Deactivates (opens) a lock. Other locks are untouched, so overlapping ranges stay closed. */
export async function unlockLock(id: string, opts: { actorId: string; reason: string; now?: Date }): Promise<LockDTO> {
  const now = opts.now ?? new Date();
  return db.$transaction(async (tx) => {
    await acquireScheduleLock(tx, "exclusive");
    const updated = await tx.scheduleLock.updateMany({
      where: { id, isActive: true },
      data: { isActive: false, unlockedAt: now, unlockedById: opts.actorId, unlockReason: opts.reason, updatedById: opts.actorId },
    });
    if (updated.count === 0) {
      const exists = await tx.scheduleLock.count({ where: { id } });
      throw new AppError(exists ? "LOCK_ALREADY_INACTIVE" : "NOT_FOUND");
    }
    await audit(tx, { actorId: opts.actorId, action: "LOCK_UNLOCKED", entity: "ScheduleLock", entityId: id, details: { reason: opts.reason } });
    return toLockDTO(await tx.scheduleLock.findUniqueOrThrow({ where: { id }, include: LOCK_INCLUDE }));
  }, TX_OPTIONS);
}

export async function reactivateLock(id: string, opts: WriteOptions): Promise<LockWriteResult> {
  const now = opts.now ?? new Date();
  return db.$transaction(async (tx) => {
    await acquireScheduleLock(tx, "exclusive");
    const row = await tx.scheduleLock.findUnique({ where: { id } });
    if (!row) throw new AppError("NOT_FOUND");
    if (row.isActive) throw new AppError("LOCK_ALREADY_ACTIVE");
    const rule = { ...toLockRule(row), isActive: true };
    const affected = await findAffectedBookings(tx, { ...rule, reason: rule.reason ?? null, isReasonPublic: rule.isReasonPublic ?? false }, now);
    await tx.scheduleLock.update({
      where: { id },
      data: { isActive: true, unlockedAt: null, unlockedById: null, unlockReason: null, updatedById: opts.actorId },
    });
    const cancelledCount =
      opts.conflictMode === "CANCEL_BOOKINGS"
        ? await cancelAffectedBookings(tx, affected, { actorId: opts.actorId, lockId: id, reason: opts.cancelReason, now })
        : 0;
    await audit(tx, {
      actorId: opts.actorId,
      action: "LOCK_REACTIVATED",
      entity: "ScheduleLock",
      entityId: id,
      details: { conflictMode: opts.conflictMode ?? "KEEP_BOOKINGS", affectedCount: affected.length, cancelledCount },
    });
    const full = await tx.scheduleLock.findUniqueOrThrow({ where: { id }, include: LOCK_INCLUDE });
    return { lock: toLockDTO(full, affected.length - cancelledCount), affectedCount: affected.length, cancelledCount };
  }, TX_OPTIONS);
}

export interface LockFilter {
  status?: "ACTIVE" | "INACTIVE" | "ALL";
  type?: ScheduleLock["type"];
  from?: DateKey;
  to?: DateKey;
}

export async function listLocks(filter: LockFilter = {}, opts: { now?: Date } = {}): Promise<LockDTO[]> {
  const now = opts.now ?? new Date();
  const status = filter.status ?? "ACTIVE";
  const where: Prisma.ScheduleLockWhereInput = {
    ...(status === "ALL" ? {} : { isActive: status === "ACTIVE" }),
    ...(filter.type ? { type: filter.type } : {}),
  };
  if (filter.from || filter.to) {
    const dateRange: Prisma.DateTimeNullableFilter = {};
    if (filter.from) dateRange.gte = dateKeyToDb(filter.from);
    if (filter.to) dateRange.lte = dateKeyToDb(filter.to);
    where.OR = [{ date: dateRange }, { type: "WEEKLY" }];
  }
  const rows = await db.scheduleLock.findMany({
    where,
    include: LOCK_INCLUDE,
    orderBy: [{ isActive: "desc" }, { date: "asc" }, { weekday: "asc" }, { startHour: "asc" }, { createdAt: "desc" }],
    take: 500,
  });

  // A weekly lock matches a date filter only if its weekday occurs in the range.
  const weekdaysInRange = weekdaysBetween(filter.from, filter.to);
  const filtered = rows.filter((r) => r.type !== "WEEKLY" || !weekdaysInRange || weekdaysInRange.has(r.weekday!));

  const t = tehranParts(now);
  const future = await db.booking.findMany({
    where: { status: "ACTIVE", date: { gte: dateKeyToDb(t.dateKey) } },
    select: { date: true, hour: true },
  });
  const futureKeys = future
    .map((b) => ({ dateKey: dbToDateKey(b.date), hour: b.hour }))
    .filter((b) => !isSlotStarted(b.dateKey, b.hour, t));

  return filtered.map((row) => {
    const rule = toLockRule(row);
    const kept = rule.isActive ? futureKeys.filter((b) => lockCoversHour(rule, b.dateKey, b.hour)).length : 0;
    return toLockDTO(row, kept);
  });
}

function weekdaysBetween(from?: DateKey, to?: DateKey): Set<number> | null {
  if (!from || !to) return null;
  const span = diffDays(from, to);
  if (span < 0) return new Set();
  if (span >= 6) return null;
  return new Set(Array.from({ length: span + 1 }, (_, i) => weekdayOf(addDays(from, i))));
}

export interface LockHistoryEntry {
  id: string;
  action: string;
  createdAt: string;
  actor: PersonRef;
  details: Prisma.JsonValue;
}

export interface LockDetail extends LockDTO {
  keptBookings: AffectedBooking[];
  history: LockHistoryEntry[];
}

export async function getLockDetail(id: string, opts: { now?: Date } = {}): Promise<LockDetail> {
  const row = await db.scheduleLock.findUnique({ where: { id }, include: LOCK_INCLUDE });
  if (!row) throw new AppError("NOT_FOUND");
  const rule = toLockRule(row);
  const keptBookings = await findAffectedBookings(
    db,
    { ...rule, reason: rule.reason ?? null, isReasonPublic: rule.isReasonPublic ?? false },
    opts.now ?? new Date(),
  );
  const logs = await db.auditLog.findMany({
    where: { entity: "ScheduleLock", entityId: id },
    include: { actor: { select: { id: true, fullName: true } } },
    orderBy: { createdAt: "desc" },
  });
  return {
    ...toLockDTO(row, keptBookings.length),
    keptBookings,
    history: logs.map((l) => ({ id: l.id, action: l.action, createdAt: l.createdAt.toISOString(), actor: l.actor, details: l.details })),
  };
}
