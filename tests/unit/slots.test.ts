import { describe, expect, it } from "vitest";
import { describeLockScope } from "@/lib/locks";
import {
  checkSlotBookable,
  computeDaySlots,
  lockCoversHour,
  locksCoveringSlot,
  summarizeDay,
  type DayContext,
  type LockRule,
} from "@/lib/slots";

const NOW = { dateKey: "2026-10-24", hour: 10, minute: 15 }; // Saturday 1405/08/02
const TUESDAY = "2026-10-27"; // 1405/08/05
const FRIDAY = "2026-10-30";

let seq = 0;
function lock(partial: Partial<LockRule> & Pick<LockRule, "type">): LockRule {
  return { id: `l${++seq}`, date: null, weekday: null, startHour: 0, endHour: 24, isActive: true, ...partial };
}

function ctx(overrides: Partial<DayContext> = {}): DayContext {
  return {
    dateKey: TUESDAY,
    now: NOW,
    bookableHours: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
    maxAdvanceDays: 60,
    locks: [],
    bookings: [],
    viewerId: "me",
    ...overrides,
  };
}

describe("lock coverage", () => {
  it("covers [start, end) of a time-range lock, end exclusive", () => {
    const l = lock({ type: "TIME_RANGE", date: TUESDAY, startHour: 8, endHour: 12 });
    expect([7, 8, 9, 10, 11, 12].map((h) => lockCoversHour(l, TUESDAY, h))).toEqual([false, true, true, true, true, false]);
    expect(lockCoversHour(l, "2026-10-28", 9)).toBe(false);
  });

  it("applies weekly locks to every matching weekday, without per-date records", () => {
    const fridays = lock({ type: "WEEKLY", weekday: 5 });
    expect(lockCoversHour(fridays, FRIDAY, 0)).toBe(true);
    expect(lockCoversHour(fridays, "2027-06-04", 23)).toBe(true); // a Friday far in the future
    expect(lockCoversHour(fridays, TUESDAY, 9)).toBe(false);
  });

  it("ignores inactive locks", () => {
    const l = lock({ type: "FULL_DAY", date: TUESDAY, isActive: false });
    expect(lockCoversHour(l, TUESDAY, 9)).toBe(false);
  });

  it("reports every lock covering a slot (overlap)", () => {
    const a = lock({ type: "FULL_DAY", date: TUESDAY });
    const b = lock({ type: "WEEKLY", weekday: 2, startHour: 8, endHour: 12 });
    const c = lock({ type: "TIME_RANGE", date: TUESDAY, startHour: 14, endHour: 15 });
    expect(locksCoveringSlot([a, b, c], TUESDAY, 9).map((l) => l.id)).toEqual([a.id, b.id]);
    expect(locksCoveringSlot([a, b, c], TUESDAY, 14).map((l) => l.id)).toEqual([a.id, c.id]);
  });
});

describe("computeDaySlots", () => {
  it("returns 24 slots", () => {
    expect(computeDaySlots(ctx())).toHaveLength(24);
  });

  it("marks general closed hours, available hours and locks", () => {
    const slots = computeDaySlots(
      ctx({ locks: [lock({ type: "TIME_RANGE", date: TUESDAY, startHour: 8, endHour: 10, reason: "داخلی" })] }),
    );
    expect(slots[7]!.state).toBe("CLOSED_HOURS");
    expect(slots[8]!.state).toBe("LOCKED");
    expect(slots[8]!.publicReason).toBeNull(); // reason not public
    expect(slots[9]!.state).toBe("LOCKED");
    expect(slots[10]!.state).toBe("AVAILABLE");
    expect(slots[18]!.state).toBe("CLOSED_HOURS");
  });

  it("exposes only public lock reasons", () => {
    const slots = computeDaySlots(
      ctx({ locks: [lock({ type: "FULL_DAY", date: TUESDAY, reason: "تعطیل رسمی", isReasonPublic: true })] }),
    );
    expect(slots[9]).toMatchObject({ state: "LOCKED", publicReason: "تعطیل رسمی" });
  });

  it("distinguishes the viewer's booking from others' bookings", () => {
    const slots = computeDaySlots(
      ctx({
        bookings: [
          { id: "b1", hour: 9, userId: "me" },
          { id: "b2", hour: 11, userId: "other" },
        ],
      }),
    );
    expect(slots[9]).toMatchObject({ state: "MINE", bookingId: "b1" });
    expect(slots[11]).toEqual({ hour: 11, state: "BOOKED" });
  });

  it("shows a locked slot as locked even when another user's booking was kept", () => {
    const slots = computeDaySlots(
      ctx({
        locks: [lock({ type: "FULL_DAY", date: TUESDAY })],
        bookings: [{ id: "b2", hour: 11, userId: "other" }],
      }),
    );
    expect(slots[11]!.state).toBe("LOCKED");
  });

  it("marks started slots of today and all of past days as PAST", () => {
    const today = computeDaySlots(ctx({ dateKey: NOW.dateKey }));
    expect(today[9]!.state).toBe("PAST");
    expect(today[10]!.state).toBe("PAST"); // 10:15 — the 10:00 slot has started
    expect(today[11]!.state).toBe("AVAILABLE");
    const yesterday = computeDaySlots(ctx({ dateKey: "2026-10-23" }));
    expect(yesterday.every((s) => s.state === "PAST")).toBe(true);
  });

  it("marks dates beyond the booking window", () => {
    const slots = computeDaySlots(ctx({ dateKey: "2026-12-24", maxAdvanceDays: 60 })); // 61 days ahead
    expect(slots[9]!.state).toBe("OUT_OF_RANGE");
    const edge = computeDaySlots(ctx({ dateKey: "2026-12-23", maxAdvanceDays: 60 })); // exactly 60
    expect(edge[9]!.state).toBe("AVAILABLE");
  });
});

describe("checkSlotBookable", () => {
  it("maps every non-available state to a rejection", () => {
    const c = ctx({
      locks: [lock({ type: "TIME_RANGE", date: TUESDAY, startHour: 12, endHour: 13 })],
      bookings: [{ id: "b", hour: 14, userId: "other" }],
    });
    expect(checkSlotBookable(c, 9)).toEqual({ ok: true });
    expect(checkSlotBookable(c, 12)).toEqual({ ok: false, reason: "SLOT_LOCKED" });
    expect(checkSlotBookable(c, 14)).toEqual({ ok: false, reason: "SLOT_TAKEN" });
    expect(checkSlotBookable(c, 3)).toEqual({ ok: false, reason: "SLOT_NOT_BOOKABLE" });
    expect(checkSlotBookable(ctx({ dateKey: NOW.dateKey }), 10)).toEqual({ ok: false, reason: "SLOT_IN_PAST" });
    expect(checkSlotBookable(ctx({ dateKey: "2027-03-01" }), 9)).toEqual({ ok: false, reason: "BEYOND_BOOKING_WINDOW" });
    expect(checkSlotBookable(c, 24)).toEqual({ ok: false, reason: "SLOT_NOT_BOOKABLE" });
  });

  it("stays locked while any overlapping lock is active", () => {
    const full = lock({ type: "FULL_DAY", date: TUESDAY });
    const weekly = lock({ type: "WEEKLY", weekday: 2, startHour: 8, endHour: 12 });
    expect(checkSlotBookable(ctx({ locks: [full, weekly] }), 9).ok).toBe(false);
    // unlocking the full-day lock alone does not free 09:00 (weekly still covers it)
    expect(checkSlotBookable(ctx({ locks: [{ ...full, isActive: false }, weekly] }), 9)).toEqual({ ok: false, reason: "SLOT_LOCKED" });
    // but 13:00 is free again
    expect(checkSlotBookable(ctx({ locks: [{ ...full, isActive: false }, weekly] }), 13)).toEqual({ ok: true });
    expect(checkSlotBookable(ctx({ locks: [{ ...full, isActive: false }, { ...weekly, isActive: false }] }), 9)).toEqual({ ok: true });
  });
});

describe("summarizeDay", () => {
  it("marks a full-day lock as CLOSED", () => {
    const s = summarizeDay(ctx({ locks: [lock({ type: "FULL_DAY", date: TUESDAY, reason: "تعطیل", isReasonPublic: true })] }));
    expect(s).toMatchObject({ status: "CLOSED", hasPartialLock: false, availableCount: 0, publicReason: "تعطیل" });
  });

  it("marks a weekly whole-day lock as CLOSED", () => {
    expect(summarizeDay(ctx({ dateKey: FRIDAY, locks: [lock({ type: "WEEKLY", weekday: 5 })] })).status).toBe("CLOSED");
  });

  it("treats locks that cover every bookable hour as CLOSED", () => {
    const s = summarizeDay(ctx({ locks: [lock({ type: "TIME_RANGE", date: TUESDAY, startHour: 6, endHour: 20 })] }));
    expect(s.status).toBe("CLOSED");
  });

  it("flags partial locks and counts available slots", () => {
    const s = summarizeDay(ctx({ locks: [lock({ type: "TIME_RANGE", date: TUESDAY, startHour: 8, endHour: 12 })] }));
    expect(s).toMatchObject({ status: "AVAILABLE", hasPartialLock: true, availableCount: 6 });
  });

  it("does not flag a lock that only covers closed hours", () => {
    const s = summarizeDay(ctx({ locks: [lock({ type: "TIME_RANGE", date: TUESDAY, startHour: 0, endHour: 6 })] }));
    expect(s.hasPartialLock).toBe(false);
  });

  it("detects FULL, PAST and my booking", () => {
    const bookings = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map((hour) => ({ id: `b${hour}`, hour, userId: hour === 9 ? "me" : "x" }));
    expect(summarizeDay(ctx({ bookings }))).toMatchObject({ status: "FULL", hasMyBooking: true });
    expect(summarizeDay(ctx({ dateKey: "2026-10-20" })).status).toBe("PAST");
  });

  it("is UNAVAILABLE when today's open hours are over", () => {
    expect(summarizeDay(ctx({ dateKey: NOW.dateKey, now: { ...NOW, hour: 18 } })).status).toBe("UNAVAILABLE");
  });
});

describe("describeLockScope", () => {
  it("describes each lock type in Persian", () => {
    expect(describeLockScope({ type: "FULL_DAY", date: "2026-10-23", weekday: null, startHour: 0, endHour: 24 })).toBe("۱۴۰۵/۰۸/۰۱، کل روز");
    expect(describeLockScope({ type: "TIME_RANGE", date: TUESDAY, weekday: null, startHour: 8, endHour: 12 })).toBe("۱۴۰۵/۰۸/۰۵، ۰۸:۰۰ تا ۱۲:۰۰");
    expect(describeLockScope({ type: "WEEKLY", date: null, weekday: 2, startHour: 8, endHour: 12 })).toBe("هر سه‌شنبه، ۰۸:۰۰ تا ۱۲:۰۰");
  });
});
