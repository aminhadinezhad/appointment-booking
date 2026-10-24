import { describe, expect, it } from "vitest";
import { parseLegalText } from "@/lib/legal-text";
import { normalizePhone } from "@/lib/phone";
import {
  bookingRequestSchema,
  createBookingSchema,
  fullNameSchema,
  lockInputSchema,
  normalizeLockInput,
  otpCodeSchema,
  registerRequestSchema,
  settingsSchema,
} from "@/lib/validation";

describe("normalizePhone", () => {
  it.each([
    ["09121234567", "09121234567"],
    ["۰۹۱۲۱۲۳۴۵۶۷", "09121234567"],
    ["+989121234567", "09121234567"],
    ["00989121234567", "09121234567"],
    ["989121234567", "09121234567"],
    ["9121234567", "09121234567"],
    ["0912 123 4567", "09121234567"],
    ["0912-123-4567", "09121234567"],
  ])("normalises %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(["", "0912123456", "091212345678", "08121234567", "abc", "+1 555 1234567"])("rejects %s", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe("registration schema", () => {
  it("accepts and normalises valid input", () => {
    const parsed = registerRequestSchema.parse({ fullName: "  علی   محمدی ", phone: "۰۹۱۲۱۲۳۴۵۶۷", gender: "MALE", acceptTerms: true });
    expect(parsed).toEqual({ fullName: "علی محمدی", phone: "09121234567", gender: "MALE", acceptTerms: true });
  });

  it("rejects names with digits or symbols and too short names", () => {
    expect(fullNameSchema.safeParse("علی123").success).toBe(false);
    expect(fullNameSchema.safeParse("<script>").success).toBe(false);
    expect(fullNameSchema.safeParse("ع").success).toBe(false);
    expect(fullNameSchema.safeParse("Sara Rezaei").success).toBe(true);
    expect(fullNameSchema.safeParse("مهدی کریمی‌نژاد").success).toBe(true);
  });

  it("requires a gender", () => {
    const r = registerRequestSchema.safeParse({ fullName: "علی محمدی", phone: "09121234567", acceptTerms: true });
    expect(r.success).toBe(false);
  });
});

describe("otp code", () => {
  it("accepts 5 digits including Persian digits", () => {
    expect(otpCodeSchema.parse("۱۲۳۴۵")).toBe("12345");
    expect(otpCodeSchema.safeParse("1234").success).toBe(false);
    expect(otpCodeSchema.safeParse("12a45").success).toBe(false);
  });
});

describe("booking schema", () => {
  it("validates date and hour", () => {
    expect(createBookingSchema.parse({ date: "2026-10-24", hour: "9" })).toEqual({ date: "2026-10-24", hour: 9 });
    expect(createBookingSchema.safeParse({ date: "2026-02-30", hour: 9 }).success).toBe(false);
    expect(createBookingSchema.safeParse({ date: "2026-10-24", hour: 24 }).success).toBe(false);
    expect(createBookingSchema.safeParse({ date: "2026-10-24", hour: 9.5 }).success).toBe(false);
    expect(createBookingSchema.safeParse({ date: "2026-10-24", hour: -1 }).success).toBe(false);
  });
});

describe("lock input", () => {
  it("normalises a full-day lock to 0..24", () => {
    const parsed = lockInputSchema.parse({ type: "FULL_DAY", date: "2026-10-23", startHour: 5, endHour: 6 });
    expect(normalizeLockInput(parsed)).toMatchObject({ type: "FULL_DAY", date: "2026-10-23", weekday: null, startHour: 0, endHour: 24 });
  });

  it("accepts a time range with exclusive end and rejects inverted ranges", () => {
    const ok = lockInputSchema.parse({ type: "TIME_RANGE", date: "2026-10-27", startHour: 8, endHour: 12, reason: " جلسه " });
    expect(normalizeLockInput(ok)).toMatchObject({ startHour: 8, endHour: 12, reason: "جلسه", isActive: true, isReasonPublic: false });
    expect(lockInputSchema.safeParse({ type: "TIME_RANGE", date: "2026-10-27", startHour: 12, endHour: 12 }).success).toBe(false);
    expect(lockInputSchema.safeParse({ type: "TIME_RANGE", date: "2026-10-27", startHour: 13, endHour: 12 }).success).toBe(false);
    expect(lockInputSchema.safeParse({ type: "TIME_RANGE", date: "2026-10-27", startHour: 23, endHour: 24 }).success).toBe(true);
    expect(lockInputSchema.safeParse({ type: "TIME_RANGE", date: "2026-10-27", startHour: 0, endHour: 25 }).success).toBe(false);
  });

  it("defaults a weekly lock to the whole day", () => {
    const parsed = lockInputSchema.parse({ type: "WEEKLY", weekday: 5 });
    expect(normalizeLockInput(parsed)).toMatchObject({ type: "WEEKLY", weekday: 5, date: null, startHour: 0, endHour: 24 });
    expect(lockInputSchema.safeParse({ type: "WEEKLY", weekday: 7 }).success).toBe(false);
  });

  it("turns an empty reason into null and limits its length", () => {
    const parsed = lockInputSchema.parse({ type: "FULL_DAY", date: "2026-10-23", reason: "   " });
    expect(normalizeLockInput(parsed).reason).toBeNull();
    expect(lockInputSchema.safeParse({ type: "FULL_DAY", date: "2026-10-23", reason: "x".repeat(301) }).success).toBe(false);
  });
});

describe("settings", () => {
  it("deduplicates and sorts bookable hours", () => {
    expect(settingsSchema.parse({ bookableHours: [10, 9, 10, 23, 0], maxAdvanceDays: "30" })).toEqual({
      bookableHours: [0, 9, 10, 23],
      maxAdvanceDays: 30,
    });
    expect(settingsSchema.safeParse({ bookableHours: [24], maxAdvanceDays: 30 }).success).toBe(false);
    expect(settingsSchema.safeParse({ bookableHours: [], maxAdvanceDays: 0 }).success).toBe(false);
  });
});

describe("consent", () => {
  it("requires an explicit tick at registration", () => {
    const base = { fullName: "علی محمدی", phone: "09121234567", gender: "MALE" };
    expect(registerRequestSchema.safeParse({ ...base, acceptTerms: true }).success).toBe(true);
    expect(registerRequestSchema.safeParse({ ...base, acceptTerms: false }).success).toBe(false);
    expect(registerRequestSchema.safeParse(base).success).toBe(false);
    expect(registerRequestSchema.safeParse({ ...base, acceptTerms: "true" }).success).toBe(false);
    expect(bookingRequestSchema.safeParse({ date: "2026-10-25", hour: 9, acceptTerms: true }).success).toBe(true);
    // at booking time consent is only needed after the texts change, so the flag is optional
    expect(bookingRequestSchema.safeParse({ date: "2026-10-25", hour: 9 }).success).toBe(true);
    expect(bookingRequestSchema.safeParse({ date: "2026-10-25", hour: 9, acceptTerms: "yes" }).success).toBe(false);
  });
});

describe("legal text", () => {
  it("parses headings, paragraphs and lists", () => {
    expect(parseLegalText("## عنوان\nخط اول\nخط دوم\n\n- مورد ۱\n- مورد ۲\nپاراگراف")).toEqual([
      { type: "heading", text: "عنوان" },
      { type: "paragraph", text: "خط اول خط دوم" },
      { type: "list", items: ["مورد ۱", "مورد ۲"] },
      { type: "paragraph", text: "پاراگراف" },
    ]);
  });

  it("treats markup-like input as plain text", () => {
    expect(parseLegalText("<script>alert(1)</script>")).toEqual([{ type: "paragraph", text: "<script>alert(1)</script>" }]);
  });
});
