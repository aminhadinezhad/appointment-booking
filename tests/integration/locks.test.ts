import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { listAdminBookings } from "@/server/services/admin-bookings";
import { createBooking, getDaySlots } from "@/server/services/bookings";
import { getAdminDay, getAdminMonth, getUserMonth } from "@/server/services/calendar";
import {
  createLock,
  getLockDetail,
  listLocks,
  previewLockImpact,
  reactivateLock,
  unlockLock,
  updateLock,
} from "@/server/services/locks";
import { clock, createAdmin, createUser, expectAppError, FRIDAY, lockOf, NOW, setSettings, TOMORROW, TUESDAY } from "./helpers";

let adminId: string;

beforeEach(async () => {
  await setSettings();
  adminId = (await createAdmin()).id;
});

const opts = () => ({ actorId: adminId, now: NOW });

describe("lock types", () => {
  it("full-day lock closes every hour of that date only", async () => {
    await createLock(lockOf({ type: "FULL_DAY", date: TUESDAY, reason: "تعطیل رسمی", isReasonPublic: true }), opts());
    const slots = await getDaySlots(TUESDAY, null, clock);
    expect(slots.every((s) => s.state === "LOCKED" || s.state === "PAST")).toBe(true);
    expect(slots[9]!.publicReason).toBe("تعطیل رسمی");
    expect((await getDaySlots("2026-10-28", null, clock))[9]!.state).toBe("AVAILABLE");
  });

  it("time-range lock closes [start, end) only", async () => {
    await createLock(lockOf({ type: "TIME_RANGE", date: TUESDAY, startHour: 8, endHour: 12 }), opts());
    const states = (await getDaySlots(TUESDAY, null, clock)).map((s) => s.state);
    expect(states.slice(8, 13)).toEqual(["LOCKED", "LOCKED", "LOCKED", "LOCKED", "AVAILABLE"]);
  });

  it("weekly lock applies to all future matching weekdays without per-date rows", async () => {
    await createLock(lockOf({ type: "WEEKLY", weekday: 5 }), opts()); // all Fridays
    await createLock(lockOf({ type: "WEEKLY", weekday: 2, startHour: 8, endHour: 12 }), opts()); // Tuesday mornings
    expect(await db.scheduleLock.count()).toBe(2);
    expect((await getDaySlots(FRIDAY, null, clock))[14]!.state).toBe("LOCKED");
    expect((await getDaySlots("2026-12-18", null, clock))[9]!.state).toBe("LOCKED"); // a Friday 8 weeks later
    const tuesday = await getDaySlots("2026-11-03", null, clock);
    expect(tuesday[9]!.state).toBe("LOCKED");
    expect(tuesday[12]!.state).toBe("AVAILABLE");
  });

  it("inactive locks are stored but not enforced", async () => {
    await createLock(lockOf({ type: "FULL_DAY", date: TUESDAY, isActive: false }), opts());
    expect((await getDaySlots(TUESDAY, null, clock))[9]!.state).toBe("AVAILABLE");
  });

  it("rejects invalid lock shapes at the database level", async () => {
    await expect(
      db.scheduleLock.create({ data: { type: "FULL_DAY", date: new Date("2026-10-27"), startHour: 8, endHour: 12, createdById: adminId } }),
    ).rejects.toThrow();
    await expect(
      db.scheduleLock.create({ data: { type: "WEEKLY", weekday: 9, startHour: 0, endHour: 24, createdById: adminId } }),
    ).rejects.toThrow();
    await expect(
      db.scheduleLock.create({ data: { type: "TIME_RANGE", date: new Date("2026-10-27"), startHour: 12, endHour: 10, createdById: adminId } }),
    ).rejects.toThrow();
  });
});

describe("locks and existing bookings (6.5)", () => {
  it("previews affected bookings and users before locking", async () => {
    const [a, b] = await Promise.all([createUser({ fullName: "علی محمدی" }), createUser()]);
    await createBooking({ userId: a.id, dateKey: TUESDAY, hour: 9 }, clock);
    await createBooking({ userId: b.id, dateKey: TUESDAY, hour: 11 }, clock);
    await createBooking({ userId: b.id, dateKey: TOMORROW, hour: 9 }, clock);

    const impact = await previewLockImpact(lockOf({ type: "TIME_RANGE", date: TUESDAY, startHour: 8, endHour: 12 }), { now: NOW });
    expect(impact.affectedBookings.map((x) => x.hour)).toEqual([9, 11]);
    expect(impact.affectedUsers).toBe(2);
    expect(impact.affectedBookings[0]!.user.fullName).toBe("علی محمدی");
    expect(impact.scope).toBe("۱۴۰۵/۰۸/۰۵، ۰۸:۰۰ تا ۱۲:۰۰");

    const weekly = await previewLockImpact(lockOf({ type: "WEEKLY", weekday: 0 }), { now: NOW }); // Sundays
    expect(weekly.affectedBookings.map((x) => x.dateKey)).toEqual([TOMORROW]);
  });

  it("default: keeps existing bookings but blocks new ones, and flags them for admins", async () => {
    const [a, b] = await Promise.all([createUser(), createUser()]);
    const kept = await createBooking({ userId: a.id, dateKey: TUESDAY, hour: 9 }, clock);
    const result = await createLock(lockOf({ type: "FULL_DAY", date: TUESDAY }), opts());
    expect(result).toMatchObject({ affectedCount: 1, cancelledCount: 0 });
    expect(result.lock.keptBookingsCount).toBe(1);

    expect(await db.booking.findUnique({ where: { id: kept.id } })).toMatchObject({ status: "ACTIVE" });
    await expectAppError(createBooking({ userId: b.id, dateKey: TUESDAY, hour: 10 }, clock), "SLOT_LOCKED");

    const list = await listAdminBookings({ inLockedRangeOnly: true }, clock);
    expect(list.items.map((i) => i.id)).toEqual([kept.id]);
    expect(list.items[0]!.inLockedRange).toBe(true);
    const day = await getAdminDay(TUESDAY, clock);
    expect(day[9]!.booking?.id).toBe(kept.id);
    expect(day[9]!.locks).toHaveLength(1);
    const detail = await getLockDetail(result.lock.id, { now: NOW });
    expect(detail.keptBookings.map((k) => k.id)).toEqual([kept.id]);
  });

  it("explicit choice: cancels affected bookings in the same transaction, keeping their records", async () => {
    const a = await createUser();
    const booking = await createBooking({ userId: a.id, dateKey: TUESDAY, hour: 9 }, clock);
    const result = await createLock(lockOf({ type: "TIME_RANGE", date: TUESDAY, startHour: 9, endHour: 10 }), {
      ...opts(),
      conflictMode: "CANCEL_BOOKINGS",
      cancelReason: "جلسه اضطراری",
    });
    expect(result).toMatchObject({ affectedCount: 1, cancelledCount: 1 });
    expect(await db.booking.findUnique({ where: { id: booking.id } })).toMatchObject({
      status: "CANCELLED",
      cancelledById: adminId,
      cancelReason: "جلسه اضطراری",
    });
    expect(await db.auditLog.count({ where: { action: "BOOKING_CANCELLED", entityId: booking.id } })).toBe(1);
  });

  it("never touches past bookings", async () => {
    const a = await createUser();
    await db.booking.create({ data: { userId: a.id, date: new Date("2026-10-20T00:00:00Z"), hour: 9 } }); // a past Tuesday
    const result = await createLock(lockOf({ type: "WEEKLY", weekday: 2 }), { ...opts(), conflictMode: "CANCEL_BOOKINGS" });
    expect(result.affectedCount).toBe(0);
    expect(await db.booking.count({ where: { status: "ACTIVE" } })).toBe(1);
  });
});

describe("unlocking (6.6) and overlaps (6.7)", () => {
  it("unlocks a lock, recording who, when and why, and reopens the range", async () => {
    const { lock } = await createLock(lockOf({ type: "TIME_RANGE", date: TUESDAY, startHour: 8, endHour: 12 }), opts());
    const opened = await unlockLock(lock.id, { actorId: adminId, reason: "جلسه لغو شد", now: NOW });
    expect(opened).toMatchObject({ isActive: false, unlockReason: "جلسه لغو شد" });
    expect(opened.unlockedBy?.id).toBe(adminId);
    expect(opened.unlockedAt).toBe(NOW.toISOString());
    expect((await getDaySlots(TUESDAY, null, clock))[9]!.state).toBe("AVAILABLE");
    // the record and history remain
    const detail = await getLockDetail(lock.id);
    expect(detail.history.map((h) => h.action)).toEqual(["LOCK_UNLOCKED", "LOCK_CREATED"]);
    await expectAppError(unlockLock(lock.id, { actorId: adminId, reason: "دوباره" }), "LOCK_ALREADY_INACTIVE");
  });

  it("a slot covered by two locks stays closed until both are opened", async () => {
    const full = await createLock(lockOf({ type: "FULL_DAY", date: TUESDAY }), opts());
    const weekly = await createLock(lockOf({ type: "WEEKLY", weekday: 2, startHour: 8, endHour: 12 }), opts());

    await unlockLock(full.lock.id, { actorId: adminId, reason: "باز شد" });
    let slots = await getDaySlots(TUESDAY, null, clock);
    expect(slots[9]!.state).toBe("LOCKED"); // weekly still active
    expect(slots[13]!.state).toBe("AVAILABLE");
    expect((await db.scheduleLock.findUnique({ where: { id: weekly.lock.id } }))!.isActive).toBe(true);

    await unlockLock(weekly.lock.id, { actorId: adminId, reason: "باز شد" });
    slots = await getDaySlots(TUESDAY, null, clock);
    expect(slots[9]!.state).toBe("AVAILABLE");
  });

  it("reports overlapping locks in the preview", async () => {
    const weekly = await createLock(lockOf({ type: "WEEKLY", weekday: 2, startHour: 8, endHour: 12 }), opts());
    const impact = await previewLockImpact(lockOf({ type: "TIME_RANGE", date: TUESDAY, startHour: 11, endHour: 14 }), { now: NOW });
    expect(impact.overlappingLocks.map((l) => l.id)).toEqual([weekly.lock.id]);
    const none = await previewLockImpact(lockOf({ type: "TIME_RANGE", date: TUESDAY, startHour: 12, endHour: 14 }), { now: NOW });
    expect(none.overlappingLocks).toEqual([]);
  });

  it("reactivates an opened lock", async () => {
    const { lock } = await createLock(lockOf({ type: "FULL_DAY", date: TUESDAY }), opts());
    await unlockLock(lock.id, { actorId: adminId, reason: "موقت" });
    const result = await reactivateLock(lock.id, opts());
    expect(result.lock).toMatchObject({ isActive: true, unlockedAt: null, unlockReason: null });
    expect((await getDaySlots(TUESDAY, null, clock))[9]!.state).toBe("LOCKED");
    await expectAppError(reactivateLock(lock.id, opts()), "LOCK_ALREADY_ACTIVE");
  });

  it("edits a lock and records before/after", async () => {
    const { lock } = await createLock(lockOf({ type: "TIME_RANGE", date: TUESDAY, startHour: 8, endHour: 12 }), opts());
    const result = await updateLock(lock.id, lockOf({ type: "TIME_RANGE", date: TUESDAY, startHour: 14, endHour: 16, reason: "تغییر" }), opts());
    expect(result.lock).toMatchObject({ startHour: 14, endHour: 16, reason: "تغییر" });
    expect(result.lock.updatedBy?.id).toBe(adminId);
    const slots = await getDaySlots(TUESDAY, null, clock);
    expect(slots[9]!.state).toBe("AVAILABLE");
    expect(slots[15]!.state).toBe("LOCKED");
    const log = await db.auditLog.findFirst({ where: { action: "LOCK_UPDATED", entityId: lock.id } });
    expect(log?.details).toMatchObject({ before: { startHour: 8, endHour: 12 }, after: { startHour: 14, endHour: 16 } });
  });

  it("rule 5/10: a lock created after a booking check still wins over new bookings (serialised)", async () => {
    const users = await Promise.all(Array.from({ length: 6 }, () => createUser()));
    const ops = [
      createLock(lockOf({ type: "FULL_DAY", date: TUESDAY }), opts()),
      ...users.map((u, i) => createBooking({ userId: u.id, dateKey: TUESDAY, hour: 8 + i }, clock)),
    ];
    await Promise.allSettled(ops);
    // Every booking that succeeded must have committed before the lock; the lock reports exactly those as kept.
    const active = await db.booking.count({ where: { status: "ACTIVE" } });
    const lock = (await listLocks({}, { now: NOW }))[0]!;
    expect(lock.keptBookingsCount).toBe(active);
    const log = await db.auditLog.findFirst({ where: { action: "LOCK_CREATED" } });
    expect((log?.details as { affectedCount: number }).affectedCount).toBe(active);
  });
});

describe("lists and calendars", () => {
  it("filters locks by status, type and date", async () => {
    const a = await createLock(lockOf({ type: "FULL_DAY", date: TUESDAY }), opts());
    await createLock(lockOf({ type: "WEEKLY", weekday: 5 }), opts());
    const c = await createLock(lockOf({ type: "TIME_RANGE", date: "2026-11-10", startHour: 9, endHour: 10 }), opts());
    await unlockLock(c.lock.id, { actorId: adminId, reason: "باز" });

    expect((await listLocks({ status: "ACTIVE" })).map((l) => l.type).sort()).toEqual(["FULL_DAY", "WEEKLY"]);
    expect((await listLocks({ status: "INACTIVE" })).map((l) => l.id)).toEqual([c.lock.id]);
    expect((await listLocks({ status: "ALL", type: "WEEKLY" })).map((l) => l.type)).toEqual(["WEEKLY"]);
    // a single Tuesday: the Friday weekly lock does not apply
    expect((await listLocks({ status: "ALL", from: TUESDAY, to: TUESDAY })).map((l) => l.id)).toEqual([a.lock.id]);
    expect(await listLocks({ status: "ALL", from: FRIDAY, to: FRIDAY })).toHaveLength(1);
  });

  it("marks closed and partially locked days in the month views", async () => {
    await createLock(lockOf({ type: "FULL_DAY", date: TUESDAY, reason: "تعطیل", isReasonPublic: true }), opts());
    await createLock(lockOf({ type: "TIME_RANGE", date: "2026-10-28", startHour: 8, endHour: 10 }), opts());
    await createLock(lockOf({ type: "WEEKLY", weekday: 5 }), opts());

    const month = await getUserMonth(1405, 8, null, clock); // آبان ۱۴۰۵ starts 2026-10-23
    const byKey = new Map(month.map((d) => [d.dateKey, d]));
    expect(month).toHaveLength(30);
    expect(byKey.get("2026-10-23")!.status).toBe("PAST");
    expect(byKey.get(TUESDAY)).toMatchObject({ status: "CLOSED", publicReason: "تعطیل" });
    expect(byKey.get("2026-10-28")).toMatchObject({ status: "AVAILABLE", hasPartialLock: true });
    expect(byKey.get(FRIDAY)!.status).toBe("CLOSED");
    expect(byKey.get("2026-11-06")!.status).toBe("CLOSED"); // next Friday

    const admin = new Map((await getAdminMonth(1405, 8)).map((d) => [d.dateKey, d]));
    expect(admin.get(TUESDAY)!.fullyClosed).toBe(true);
    expect(admin.get("2026-10-28")).toMatchObject({ fullyClosed: false, lockedHours: [8, 9] });
  });
});
