import { describe, expect, it } from "vitest";
import {
  addDays,
  dateKeyToDb,
  dbToDateKey,
  diffDays,
  formatJalali,
  formatJalaliLong,
  formatSlot,
  fromJalali,
  isValidDateKey,
  jalaliMonthDays,
  jalaliMonthLength,
  persianWeekIndex,
  shiftJalaliMonth,
  toJalali,
  weekdayOf,
} from "@/lib/dates";
import { toEnDigits, toFaDigits } from "@/lib/digits";
import { isSlotEnded, isSlotStarted, tehranParts } from "@/lib/time";

describe("digits", () => {
  it("converts Persian and Arabic digits to ASCII and back", () => {
    expect(toEnDigits("۰۹۱۲٣٤٥abc")).toBe("0912345abc");
    expect(toFaDigits("1405/08/01")).toBe("۱۴۰۵/۰۸/۰۱");
    expect(toFaDigits(23)).toBe("۲۳");
  });
});

describe("date keys", () => {
  it("validates real calendar dates only", () => {
    expect(isValidDateKey("2026-10-23")).toBe(true);
    expect(isValidDateKey("2024-02-29")).toBe(true);
    expect(isValidDateKey("2025-02-29")).toBe(false);
    expect(isValidDateKey("2026-13-01")).toBe(false);
    expect(isValidDateKey("2026-1-01")).toBe(false);
    expect(isValidDateKey("")).toBe(false);
  });

  it("round-trips through the database representation", () => {
    const db = dateKeyToDb("2026-03-21");
    expect(db.toISOString()).toBe("2026-03-21T00:00:00.000Z");
    expect(dbToDateKey(db)).toBe("2026-03-21");
  });

  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(diffDays("2026-10-23", "2026-11-02")).toBe(10);
    expect(diffDays("2026-11-02", "2026-10-23")).toBe(-10);
  });

  it("computes weekdays", () => {
    expect(weekdayOf("2026-10-23")).toBe(5); // Friday
    expect(persianWeekIndex("2026-10-24")).toBe(0); // Saturday is the first column
    expect(persianWeekIndex("2026-10-23")).toBe(6); // Friday is the last column
  });
});

describe("jalali calendar", () => {
  it("converts known dates", () => {
    expect(toJalali("2026-03-21")).toEqual({ jy: 1405, jm: 1, jd: 1 }); // Nowruz 1405
    expect(fromJalali(1405, 8, 1)).toBe("2026-10-23");
    expect(fromJalali(1404, 1, 25)).toBe("2025-04-14");
  });

  it("knows month lengths including leap Esfand", () => {
    expect(jalaliMonthLength(1405, 1)).toBe(31);
    expect(jalaliMonthLength(1405, 7)).toBe(30);
    expect(jalaliMonthLength(1403, 12)).toBe(30); // 1403 is a leap year
    expect(jalaliMonthLength(1404, 12)).toBe(29);
  });

  it("lists every day of a month in order", () => {
    const days = jalaliMonthDays(1405, 8);
    expect(days).toHaveLength(30);
    expect(days[0]).toBe("2026-10-23");
    expect(days.at(-1)).toBe("2026-11-21");
  });

  it("rejects invalid Jalali dates", () => {
    expect(() => fromJalali(1404, 12, 30)).toThrow(RangeError);
    expect(() => fromJalali(1405, 13, 1)).toThrow(RangeError);
  });

  it("shifts months across years", () => {
    expect(shiftJalaliMonth(1405, 12, 1)).toEqual({ jy: 1406, jm: 1 });
    expect(shiftJalaliMonth(1405, 1, -1)).toEqual({ jy: 1404, jm: 12 });
    expect(shiftJalaliMonth(1405, 6, -18)).toEqual({ jy: 1403, jm: 12 });
  });

  it("formats for display", () => {
    expect(formatJalali("2026-10-23")).toBe("۱۴۰۵/۰۸/۰۱");
    expect(formatJalaliLong("2026-10-23")).toBe("جمعه ۱ آبان ۱۴۰۵");
    expect(formatSlot(9)).toBe("۰۹:۰۰ تا ۱۰:۰۰");
    expect(formatSlot(23, "en")).toBe("23:00 تا 24:00");
  });
});

describe("Tehran time", () => {
  it("converts instants to Tehran wall-clock time (UTC+03:30)", () => {
    expect(tehranParts(new Date("2026-10-23T20:29:00Z"))).toEqual({ dateKey: "2026-10-23", hour: 23, minute: 59 });
    expect(tehranParts(new Date("2026-10-23T20:30:00Z"))).toEqual({ dateKey: "2026-10-24", hour: 0, minute: 0 });
    // summer: Iran no longer observes DST, still +03:30
    expect(tehranParts(new Date("2026-07-01T06:00:00Z"))).toEqual({ dateKey: "2026-07-01", hour: 9, minute: 30 });
  });

  it("treats a slot as started from its first minute and ended at its end hour", () => {
    const now = { dateKey: "2026-10-23", hour: 10, minute: 0 };
    expect(isSlotStarted("2026-10-23", 10, now)).toBe(true);
    expect(isSlotStarted("2026-10-23", 11, now)).toBe(false);
    expect(isSlotStarted("2026-10-22", 23, now)).toBe(true);
    expect(isSlotStarted("2026-10-24", 0, now)).toBe(false);
    expect(isSlotEnded("2026-10-23", 9, now)).toBe(true);
    expect(isSlotEnded("2026-10-23", 10, now)).toBe(false);
  });
});
