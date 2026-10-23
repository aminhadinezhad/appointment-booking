import { beforeEach, describe, expect, it } from "vitest";
import { dateKeyToDb } from "@/lib/dates";
import { db } from "@/server/db";
import { cancelBooking, createBooking, getDaySlots, listUserBookings, rescheduleBooking } from "@/server/services/bookings";
import { createLock } from "@/server/services/locks";
import { clock, createAdmin, createUser, expectAppError, lockOf, NOW, setSettings, TODAY, TOMORROW, TUESDAY } from "./helpers";

beforeEach(async () => {
  await setSettings();
});

describe("createBooking", () => {
  it("creates an active booking in a free bookable slot", async () => {
    const user = await createUser();
    const booking = await createBooking({ userId: user.id, dateKey: TOMORROW, hour: 9 }, clock);
    expect(booking).toMatchObject({ userId: user.id, hour: 9, status: "ACTIVE" });
    const slots = await getDaySlots(TOMORROW, user.id, clock);
    expect(slots[9]).toMatchObject({ state: "MINE", bookingId: booking.id });
  });

  it("rule 1: allows only one active booking per user per day", async () => {
    const user = await createUser();
    await createBooking({ userId: user.id, dateKey: TOMORROW, hour: 9 }, clock);
    await expectAppError(createBooking({ userId: user.id, dateKey: TOMORROW, hour: 11 }, clock), "ONE_BOOKING_PER_DAY");
  });

  it("rule 2: allows independent bookings on different days", async () => {
    const user = await createUser();
    await createBooking({ userId: user.id, dateKey: TOMORROW, hour: 9 }, clock);
    await createBooking({ userId: user.id, dateKey: TUESDAY, hour: 9 }, clock);
    expect(await db.booking.count({ where: { userId: user.id, status: "ACTIVE" } })).toBe(2);
  });

  it("rule 3: allows only one active booking per slot", async () => {
    const [a, b] = await Promise.all([createUser(), createUser()]);
    await createBooking({ userId: a.id, dateKey: TOMORROW, hour: 9 }, clock);
    await expectAppError(createBooking({ userId: b.id, dateKey: TOMORROW, hour: 9 }, clock), "SLOT_TAKEN");
    expect((await getDaySlots(TOMORROW, b.id, clock))[9]!.state).toBe("BOOKED");
  });

  it("rule 4: rejects past and already-started slots", async () => {
    const user = await createUser();
    await expectAppError(createBooking({ userId: user.id, dateKey: "2026-10-23", hour: 15 }, clock), "SLOT_IN_PAST");
    await expectAppError(createBooking({ userId: user.id, dateKey: TODAY, hour: 9 }, clock), "SLOT_IN_PAST");
    await expectAppError(createBooking({ userId: user.id, dateKey: TODAY, hour: 10 }, clock), "SLOT_IN_PAST"); // started at 10:00
    await expect(createBooking({ userId: user.id, dateKey: TODAY, hour: 11 }, clock)).resolves.toBeTruthy();
  });

  it("rejects hours outside the general bookable hours and beyond the booking window", async () => {
    const user = await createUser();
    await expectAppError(createBooking({ userId: user.id, dateKey: TOMORROW, hour: 3 }, clock), "SLOT_NOT_BOOKABLE");
    await expectAppError(createBooking({ userId: user.id, dateKey: TOMORROW, hour: 20 }, clock), "SLOT_NOT_BOOKABLE");
    await expectAppError(createBooking({ userId: user.id, dateKey: "2027-01-10", hour: 9 }, clock), "BEYOND_BOOKING_WINDOW");
  });

  it("rule 9: rejects locked slots even when called directly", async () => {
    const admin = await createAdmin();
    const user = await createUser();
    await createLock(lockOf({ type: "TIME_RANGE", date: TOMORROW, startHour: 8, endHour: 12 }), { actorId: admin.id, now: NOW });
    await expectAppError(createBooking({ userId: user.id, dateKey: TOMORROW, hour: 11 }, clock), "SLOT_LOCKED");
    await expect(createBooking({ userId: user.id, dateKey: TOMORROW, hour: 12 }, clock)).resolves.toBeTruthy(); // end is exclusive
  });

  it("rejects inactive users and admins", async () => {
    const disabled = await createUser({ isActive: false });
    await expectAppError(createBooking({ userId: disabled.id, dateKey: TOMORROW, hour: 9 }, clock), "ACCOUNT_DISABLED");
    const admin = await createAdmin();
    await expectAppError(createBooking({ userId: admin.id, dateKey: TOMORROW, hour: 9 }, clock), "FORBIDDEN");
  });

  it("rule 6: exactly one of many concurrent requests for the same slot wins", async () => {
    const users = await Promise.all(Array.from({ length: 12 }, () => createUser()));
    const results = await Promise.allSettled(users.map((u) => createBooking({ userId: u.id, dateKey: TOMORROW, hour: 10 }, clock)));
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed.every((r) => r.reason?.code === "SLOT_TAKEN")).toBe(true);
    expect(await db.booking.count({ where: { date: dateKeyToDb(TOMORROW), hour: 10, status: "ACTIVE" } })).toBe(1);
  });

  it("rule 1 under concurrency: one user firing parallel requests for one day gets one booking", async () => {
    const user = await createUser();
    const hours = [8, 9, 10, 11, 12, 13, 14, 15];
    const results = await Promise.allSettled(hours.map((hour) => createBooking({ userId: user.id, dateKey: TOMORROW, hour }, clock)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const reasons = results.filter((r): r is PromiseRejectedResult => r.status === "rejected").map((r) => r.reason?.code);
    expect(new Set(reasons)).toEqual(new Set(["ONE_BOOKING_PER_DAY"]));
    expect(await db.booking.count({ where: { userId: user.id, status: "ACTIVE" } })).toBe(1);
  });

  it("database constraints block duplicates even when the service is bypassed", async () => {
    const [a, b] = await Promise.all([createUser(), createUser()]);
    await db.booking.create({ data: { userId: a.id, date: dateKeyToDb(TOMORROW), hour: 9 } });
    await expect(db.booking.create({ data: { userId: b.id, date: dateKeyToDb(TOMORROW), hour: 9 } })).rejects.toThrow();
    await expect(db.booking.create({ data: { userId: a.id, date: dateKeyToDb(TOMORROW), hour: 10 } })).rejects.toThrow();
    await expect(db.booking.create({ data: { userId: b.id, date: dateKeyToDb(TOMORROW), hour: 24 } })).rejects.toThrow();
  });
});

describe("cancelBooking", () => {
  it("rule 8: cancels but keeps the record, and frees the slot", async () => {
    const [user, other] = await Promise.all([createUser(), createUser()]);
    const booking = await createBooking({ userId: user.id, dateKey: TOMORROW, hour: 9 }, clock);
    const cancelled = await cancelBooking({ bookingId: booking.id, actor: { id: user.id, role: "USER" } }, clock);
    expect(cancelled).toMatchObject({ status: "CANCELLED", cancelledById: user.id, cancelReason: "لغو توسط کاربر" });
    expect(cancelled.cancelledAt).toBeInstanceOf(Date);
    expect(await db.booking.count()).toBe(1);
    // slot and the user's day are free again
    await expect(createBooking({ userId: other.id, dateKey: TOMORROW, hour: 9 }, clock)).resolves.toBeTruthy();
    await expect(createBooking({ userId: user.id, dateKey: TOMORROW, hour: 10 }, clock)).resolves.toBeTruthy();
    const history = await listUserBookings(user.id, clock);
    expect(history.map((b) => b.displayStatus).sort()).toEqual(["CANCELLED", "UPCOMING"]);
  });

  it("does not let a user cancel someone else's booking, but lets an admin", async () => {
    const [owner, stranger] = await Promise.all([createUser(), createUser()]);
    const admin = await createAdmin();
    const booking = await createBooking({ userId: owner.id, dateKey: TOMORROW, hour: 9 }, clock);
    await expectAppError(cancelBooking({ bookingId: booking.id, actor: { id: stranger.id, role: "USER" } }, clock), "NOT_FOUND");
    const cancelled = await cancelBooking({ bookingId: booking.id, actor: { id: admin.id, role: "ADMIN" }, reason: "درخواست تلفنی" }, clock);
    expect(cancelled).toMatchObject({ status: "CANCELLED", cancelledById: admin.id, cancelReason: "درخواست تلفنی" });
  });

  it("rejects cancelling twice or after the session started", async () => {
    const user = await createUser();
    const booking = await createBooking({ userId: user.id, dateKey: TODAY, hour: 11 }, clock);
    await expectAppError(
      cancelBooking({ bookingId: booking.id, actor: { id: user.id, role: "USER" } }, { now: new Date("2026-10-24T07:35:00Z") }), // 11:05
      "BOOKING_ALREADY_STARTED",
    );
    await cancelBooking({ bookingId: booking.id, actor: { id: user.id, role: "USER" } }, clock);
    await expectAppError(cancelBooking({ bookingId: booking.id, actor: { id: user.id, role: "USER" } }, clock), "BOOKING_NOT_ACTIVE");
  });

  it("only one of two concurrent cancellations succeeds", async () => {
    const user = await createUser();
    const booking = await createBooking({ userId: user.id, dateKey: TOMORROW, hour: 9 }, clock);
    const results = await Promise.allSettled([
      cancelBooking({ bookingId: booking.id, actor: { id: user.id, role: "USER" } }, clock),
      cancelBooking({ bookingId: booking.id, actor: { id: user.id, role: "USER" } }, clock),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
});

describe("rescheduleBooking (rule 7)", () => {
  it("moves a booking to another hour of the same day atomically", async () => {
    const user = await createUser();
    const old = await createBooking({ userId: user.id, dateKey: TOMORROW, hour: 9 }, clock);
    const moved = await rescheduleBooking({ userId: user.id, bookingId: old.id, dateKey: TOMORROW, hour: 14 }, clock);
    expect(moved).toMatchObject({ hour: 14, status: "ACTIVE", rescheduledFromId: old.id });
    expect(await db.booking.findUnique({ where: { id: old.id } })).toMatchObject({ status: "CANCELLED", cancelReason: "تغییر ساعت توسط کاربر" });
    expect(await db.booking.count({ where: { userId: user.id, status: "ACTIVE" } })).toBe(1);
  });

  it("moves a booking to another day", async () => {
    const user = await createUser();
    const old = await createBooking({ userId: user.id, dateKey: TOMORROW, hour: 9 }, clock);
    const moved = await rescheduleBooking({ userId: user.id, bookingId: old.id, dateKey: TUESDAY, hour: 9 }, clock);
    expect(moved.status).toBe("ACTIVE");
    expect((await getDaySlots(TOMORROW, null, clock))[9]!.state).toBe("AVAILABLE");
  });

  it("keeps the original booking when the new slot is not allowed", async () => {
    const [user, other] = await Promise.all([createUser(), createUser()]);
    const admin = await createAdmin();
    const old = await createBooking({ userId: user.id, dateKey: TOMORROW, hour: 9 }, clock);
    await createBooking({ userId: other.id, dateKey: TOMORROW, hour: 10 }, clock);
    await createLock(lockOf({ type: "TIME_RANGE", date: TOMORROW, startHour: 15, endHour: 17 }), { actorId: admin.id, now: NOW });

    await expectAppError(rescheduleBooking({ userId: user.id, bookingId: old.id, dateKey: TOMORROW, hour: 10 }, clock), "SLOT_TAKEN");
    await expectAppError(rescheduleBooking({ userId: user.id, bookingId: old.id, dateKey: TOMORROW, hour: 15 }, clock), "SLOT_LOCKED");
    await expectAppError(rescheduleBooking({ userId: user.id, bookingId: old.id, dateKey: TOMORROW, hour: 9 }, clock), "SAME_SLOT");
    await expectAppError(rescheduleBooking({ userId: user.id, bookingId: old.id, dateKey: TODAY, hour: 8 }, clock), "SLOT_IN_PAST");

    expect(await db.booking.findUnique({ where: { id: old.id } })).toMatchObject({ status: "ACTIVE", hour: 9 });
    expect(await db.booking.count({ where: { userId: user.id } })).toBe(1);
  });

  it("refuses to move to a day where the user already has another booking", async () => {
    const user = await createUser();
    const a = await createBooking({ userId: user.id, dateKey: TOMORROW, hour: 9 }, clock);
    await createBooking({ userId: user.id, dateKey: TUESDAY, hour: 9 }, clock);
    await expectAppError(rescheduleBooking({ userId: user.id, bookingId: a.id, dateKey: TUESDAY, hour: 11 }, clock), "ONE_BOOKING_PER_DAY");
    expect(await db.booking.findUnique({ where: { id: a.id } })).toMatchObject({ status: "ACTIVE" });
  });

  it("refuses to move another user's or a cancelled booking", async () => {
    const [user, other] = await Promise.all([createUser(), createUser()]);
    const booking = await createBooking({ userId: user.id, dateKey: TOMORROW, hour: 9 }, clock);
    await expectAppError(rescheduleBooking({ userId: other.id, bookingId: booking.id, dateKey: TOMORROW, hour: 11 }, clock), "NOT_FOUND");
    await cancelBooking({ bookingId: booking.id, actor: { id: user.id, role: "USER" } }, clock);
    await expectAppError(rescheduleBooking({ userId: user.id, bookingId: booking.id, dateKey: TOMORROW, hour: 11 }, clock), "BOOKING_NOT_ACTIVE");
  });
});
