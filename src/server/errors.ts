export const ERRORS = {
  UNAUTHORIZED: [401, "ابتدا وارد حساب کاربری خود شوید"],
  FORBIDDEN: [403, "اجازه دسترسی به این بخش را ندارید"],
  NOT_FOUND: [404, "مورد درخواستی یافت نشد"],
  VALIDATION: [400, "اطلاعات ارسالی معتبر نیست"],
  RATE_LIMITED: [429, "تعداد درخواست‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید"],
  ACCOUNT_DISABLED: [403, "حساب کاربری شما غیرفعال شده است. با پشتیبانی تماس بگیرید"],
  PHONE_ALREADY_REGISTERED: [409, "این شماره موبایل قبلاً ثبت‌نام شده است. لطفاً وارد شوید"],
  PHONE_NOT_REGISTERED: [404, "حسابی با این شماره موبایل یافت نشد. ابتدا ثبت‌نام کنید"],
  OTP_COOLDOWN: [429, "کد تأیید به‌تازگی ارسال شده است. کمی صبر کنید"],
  OTP_INVALID: [400, "کد تأیید نادرست است"],
  OTP_EXPIRED: [400, "کد تأیید منقضی شده است. کد جدید دریافت کنید"],
  OTP_TOO_MANY_ATTEMPTS: [429, "تعداد تلاش‌های نادرست زیاد بود. کد جدید دریافت کنید"],
  SMS_FAILED: [502, "ارسال پیامک با خطا مواجه شد. دوباره تلاش کنید"],
  SMS_NOT_CONFIGURED: [503, "سرویس پیامک پیکربندی نشده است"],
  INVALID_CREDENTIALS: [401, "نام کاربری یا رمز عبور نادرست است"],
  WRONG_PASSWORD: [400, "رمز عبور فعلی نادرست است"],
  SLOT_IN_PAST: [409, "زمان انتخاب‌شده گذشته است"],
  SLOT_LOCKED: [409, "این ساعت توسط مدیر غیرفعال شده و قابل رزرو نیست"],
  SLOT_TAKEN: [409, "این ساعت قبلاً رزرو شده است. ساعت دیگری انتخاب کنید"],
  SLOT_NOT_BOOKABLE: [409, "این ساعت جزو ساعت‌های قابل رزرو نیست"],
  BEYOND_BOOKING_WINDOW: [409, "امکان رزرو برای این تاریخ هنوز فراهم نشده است"],
  ONE_BOOKING_PER_DAY: [409, "شما در این روز یک رزرو فعال دارید. برای تغییر ساعت، از گزینه «تغییر ساعت» استفاده کنید"],
  SAME_SLOT: [400, "ساعت جدید با ساعت فعلی رزرو یکسان است"],
  BOOKING_NOT_ACTIVE: [409, "این رزرو فعال نیست"],
  BOOKING_ALREADY_STARTED: [409, "زمان این رزرو شروع شده یا گذشته است و قابل تغییر نیست"],
  LOCK_ALREADY_INACTIVE: [409, "این قفل قبلاً باز شده است"],
  LOCK_ALREADY_ACTIVE: [409, "این قفل در حال حاضر فعال است"],
  TERMS_NOT_ACCEPTED: [403, "برای استفاده از پنل مدیریت ابتدا شرایط استفاده از نرم‌افزار را بپذیرید"],
  TERMS_OUTDATED: [409, "متن شرایط به‌روزرسانی شده است. صفحه را دوباره بارگذاری کنید"],
  TERMS_REQUIRED: [400, "برای ادامه باید قوانین و مقررات و حریم خصوصی را بپذیرید"],
  TERMS_UPDATED: [409, "قوانین و مقررات یا حریم خصوصی به‌روزرسانی شده است. برای ثبت نوبت، نسخه جدید را بپذیرید"],
  INTERNAL: [500, "خطای غیرمنتظره‌ای رخ داد. لطفاً دوباره تلاش کنید"],
} as const satisfies Record<string, readonly [number, string]>;

export type ErrorCode = keyof typeof ERRORS;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, options: { message?: string; details?: Record<string, unknown> } = {}) {
    const [status, message] = ERRORS[code];
    super(options.message ?? message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = options.details;
  }
}

export function isAppError(error: unknown, code?: ErrorCode): error is AppError {
  return error instanceof AppError && (code === undefined || error.code === code);
}
