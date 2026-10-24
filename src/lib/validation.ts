/**
 * Zod schemas shared by forms (client) and API handlers (server).
 * Messages are user-facing Persian text.
 */
import { z } from "zod";
import { isValidDateKey } from "./dates";
import { toEnDigits } from "./digits";
import { normalizePhone } from "./phone";

const toStr = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

export const phoneSchema = z.preprocess(
  (v) => normalizePhone(toStr(v)) ?? toStr(v),
  z
    .string({ required_error: "شماره موبایل را وارد کنید" })
    .min(1, "شماره موبایل را وارد کنید")
    .regex(/^09\d{9}$/, "شماره موبایل معتبر نیست (مثال: ۰۹۱۲۱۲۳۴۵۶۷)"),
);

export const fullNameSchema = z
  .string({ required_error: "نام و نام خانوادگی را وارد کنید" })
  .transform((v) => v.replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .min(3, "نام و نام خانوادگی باید حداقل ۳ حرف باشد")
      .max(80, "نام و نام خانوادگی حداکثر ۸۰ حرف است")
      .regex(/^[\p{L}\p{M}\s.\-‌]+$/u, "نام فقط می‌تواند شامل حروف باشد"),
  );

export const genderSchema = z.enum(["MALE", "FEMALE"], {
  errorMap: () => ({ message: "جنسیت را انتخاب کنید" }),
});

export const otpCodeSchema = z.preprocess(
  (v) => toEnDigits(toStr(v)).replace(/\s/g, ""),
  z.string().regex(/^\d{5}$/, "کد تأیید ۵ رقمی است"),
);

export const dateKeySchema = z
  .string({ required_error: "تاریخ را انتخاب کنید" })
  .refine(isValidDateKey, "تاریخ معتبر نیست");

const intFrom = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? Number(toEnDigits(v)) : v);

export const slotHourSchema = z.preprocess(
  intFrom,
  z.number({ invalid_type_error: "ساعت معتبر نیست" }).int("ساعت معتبر نیست").min(0, "ساعت معتبر نیست").max(23, "ساعت معتبر نیست"),
);

const endHourSchema = z.preprocess(
  intFrom,
  z.number({ invalid_type_error: "ساعت پایان معتبر نیست" }).int().min(1, "ساعت پایان معتبر نیست").max(24, "ساعت پایان معتبر نیست"),
);

const weekdaySchema = z.preprocess(
  intFrom,
  z.number({ invalid_type_error: "روز هفته را انتخاب کنید" }).int().min(0, "روز هفته را انتخاب کنید").max(6, "روز هفته را انتخاب کنید"),
);

// ---------------------------------------------------------------- auth

export const loginRequestSchema = z.object({ phone: phoneSchema });

/** Consent must be an explicit, user-made choice (the checkbox starts unticked). */
export const acceptTermsSchema = z
  .boolean({ required_error: "برای ادامه باید قوانین و مقررات و حریم خصوصی را بپذیرید" })
  .refine((v) => v === true, "برای ادامه باید قوانین و مقررات و حریم خصوصی را بپذیرید");

export const registerRequestSchema = z.object({
  fullName: fullNameSchema,
  phone: phoneSchema,
  gender: genderSchema,
  acceptTerms: acceptTermsSchema,
});

export const otpVerifySchema = z.object({
  phone: phoneSchema,
  purpose: z.enum(["LOGIN", "REGISTER"]),
  code: otpCodeSchema,
});

export const adminLoginSchema = z.object({
  username: z.string().trim().min(1, "نام کاربری را وارد کنید").max(64),
  password: z.string().min(1, "رمز عبور را وارد کنید").max(128),
});

export const profileUpdateSchema = z.object({
  fullName: fullNameSchema,
  gender: genderSchema,
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "رمز فعلی را وارد کنید"),
    newPassword: z
      .string()
      .min(8, "رمز جدید باید حداقل ۸ کاراکتر باشد")
      .max(128, "رمز جدید حداکثر ۱۲۸ کاراکتر است"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "تکرار رمز با رمز جدید یکسان نیست",
  });

// ---------------------------------------------------------------- bookings

export const createBookingSchema = z.object({ date: dateKeySchema, hour: slotHourSchema });

/** acceptTerms is sent only when the UI showed the updated-terms notice (see resolveBookingConsent). */
export const bookingRequestSchema = createBookingSchema.extend({ acceptTerms: z.boolean().optional() });

export const cancelBookingSchema = z.object({
  reason: z.string().trim().max(300, "حداکثر ۳۰۰ کاراکتر").optional(),
});

// ---------------------------------------------------------------- locks

const reasonSchema = z
  .string()
  .trim()
  .max(300, "دلیل حداکثر ۳۰۰ کاراکتر است")
  .optional()
  .transform((v) => (v ? v : null));

const lockCommon = {
  reason: reasonSchema,
  isReasonPublic: z.boolean().default(false),
  isActive: z.boolean().default(true),
};

export const lockInputSchema = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("FULL_DAY"), date: dateKeySchema, ...lockCommon }),
    z.object({
      type: z.literal("TIME_RANGE"),
      date: dateKeySchema,
      startHour: slotHourSchema,
      endHour: endHourSchema,
      ...lockCommon,
    }),
    z.object({
      type: z.literal("WEEKLY"),
      weekday: weekdaySchema,
      startHour: slotHourSchema.default(0),
      endHour: endHourSchema.default(24),
      ...lockCommon,
    }),
  ])
  .superRefine((v, ctx) => {
    if (v.type !== "FULL_DAY" && v.startHour >= v.endHour) {
      ctx.addIssue({ code: "custom", path: ["endHour"], message: "ساعت پایان باید بعد از ساعت شروع باشد" });
    }
  });

export type LockInput = z.infer<typeof lockInputSchema>;

/** Normalised lock shape as stored in the database. */
export interface NormalizedLock {
  type: LockInput["type"];
  date: string | null;
  weekday: number | null;
  startHour: number;
  endHour: number;
  reason: string | null;
  isReasonPublic: boolean;
  isActive: boolean;
}

export function normalizeLockInput(input: LockInput): NormalizedLock {
  const common = { reason: input.reason, isReasonPublic: input.isReasonPublic, isActive: input.isActive };
  switch (input.type) {
    case "FULL_DAY":
      return { type: "FULL_DAY", date: input.date, weekday: null, startHour: 0, endHour: 24, ...common };
    case "TIME_RANGE":
      return { type: "TIME_RANGE", date: input.date, weekday: null, startHour: input.startHour, endHour: input.endHour, ...common };
    case "WEEKLY":
      return { type: "WEEKLY", date: null, weekday: input.weekday, startHour: input.startHour, endHour: input.endHour, ...common };
  }
}

export const lockConflictModeSchema = z.enum(["KEEP_BOOKINGS", "CANCEL_BOOKINGS"]).default("KEEP_BOOKINGS");

export const lockWriteSchema = z.object({
  lock: lockInputSchema,
  conflictMode: lockConflictModeSchema,
  /** Message stored on bookings cancelled because of this lock. */
  cancelReason: z.string().trim().max(300).optional(),
});

export const unlockSchema = z.object({
  reason: z.string().trim().min(2, "دلیل بازکردن قفل را بنویسید").max(300, "حداکثر ۳۰۰ کاراکتر"),
});

export const reactivateLockSchema = z.object({
  conflictMode: lockConflictModeSchema,
  cancelReason: z.string().trim().max(300).optional(),
});

// ---------------------------------------------------------------- admin

export const settingsSchema = z.object({
  bookableHours: z
    .array(z.number().int().min(0).max(23))
    .max(24)
    .transform((hours) => [...new Set(hours)].sort((a, b) => a - b)),
  maxAdvanceDays: z.preprocess(
    intFrom,
    z
      .number({ invalid_type_error: "عدد معتبر وارد کنید" })
      .int("عدد صحیح وارد کنید")
      .min(1, "حداقل ۱ روز")
      .max(365, "حداکثر ۳۶۵ روز"),
  ),
});

export const adminUserUpdateSchema = z
  .object({
    isActive: z.boolean().optional(),
    notes: z
      .string()
      .trim()
      .max(1000, "حداکثر ۱۰۰۰ کاراکتر")
      .transform((v) => (v ? v : null))
      .nullable()
      .optional(),
  })
  .refine((v) => v.isActive !== undefined || v.notes !== undefined, "هیچ تغییری ارسال نشده است");

export const jalaliMonthQuerySchema = z.object({
  jy: z.preprocess(intFrom, z.number().int().min(1300).max(1500)),
  jm: z.preprocess(intFrom, z.number().int().min(1).max(12)),
});

export const acceptPlatformTermsSchema = z.object({
  version: z.number().int().min(1),
  accept: z.literal(true, { errorMap: () => ({ message: "برای ادامه باید شرایط استفاده را بپذیرید" }) }),
});
