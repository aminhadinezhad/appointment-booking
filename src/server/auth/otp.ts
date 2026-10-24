import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { Gender, OtpPurpose, User } from "@prisma/client";
import { audit } from "../audit";
import { db, isUniqueViolation } from "../db";
import { env } from "../env";
import { AppError } from "../errors";
import { enforceRateLimit, hitRateLimit, resetRateLimit } from "../rate-limit";
import { acceptedVersionsOf, currentCustomerDocs, recordCustomerConsent, type AcceptedVersions } from "../services/legal";
import { sendOtpSms } from "../sms";

export const OTP_LENGTH = 5;
export const OTP_TTL_SECONDS = 120;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const OTP_MAX_PER_PHONE_PER_HOUR = 5;
const OTP_MAX_PER_IP_PER_HOUR = 30;
const VERIFY_MAX_PER_IP_PER_10_MIN = 40;

export type RegistrationPayload = { fullName: string; gender: Gender };

/** Stored with a registration code: form data plus the document versions the user accepted. */
type StoredRegistration = RegistrationPayload & { accepted: AcceptedVersions };

function hashCode(phone: string, purpose: OtpPurpose, code: string): string {
  return createHmac("sha256", env.authSecret).update(`${phone}:${purpose}:${code}`).digest("hex");
}

function generateCode(): string {
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
}

export interface OtpRequestResult {
  expiresInSec: number;
  resendInSec: number;
  /** Only in development with the console SMS provider. */
  devCode?: string;
}

/**
 * Issues a one-time code for login or registration.
 * Throttles per phone (cooldown + hourly cap) and per IP; only the newest code
 * of a phone/purpose pair is valid.
 */
export async function requestOtp(input: {
  phone: string;
  purpose: OtpPurpose;
  /** Required for REGISTER; the user must have ticked the terms checkbox. */
  registration?: RegistrationPayload & { acceptTerms: boolean };
  ip: string;
}): Promise<OtpRequestResult> {
  const { phone, purpose } = input;

  await enforceRateLimit(`otp-ip:${input.ip}`, OTP_MAX_PER_IP_PER_HOUR, 3600);

  const existing = await db.user.findUnique({ where: { phone }, select: { id: true, isActive: true, role: true } });
  if (purpose === "LOGIN") {
    if (!existing || existing.role !== "USER") throw new AppError("PHONE_NOT_REGISTERED");
    if (!existing.isActive) throw new AppError("ACCOUNT_DISABLED");
  } else {
    if (existing) throw new AppError("PHONE_ALREADY_REGISTERED");
    if (!input.registration) throw new AppError("VALIDATION");
    if (input.registration.acceptTerms !== true) throw new AppError("TERMS_REQUIRED");
  }

  const cooldown = await hitRateLimit(`otp-cooldown:${purpose}:${phone}`, 1, OTP_RESEND_COOLDOWN_SECONDS);
  if (!cooldown.allowed) throw new AppError("OTP_COOLDOWN", { details: { retryAfterSec: cooldown.retryAfterSec } });
  await enforceRateLimit(`otp-phone:${phone}`, OTP_MAX_PER_PHONE_PER_HOUR, 3600);

  // Versions shown to the user right now; recorded as accepted once the code is verified.
  const stored: StoredRegistration | undefined =
    purpose === "REGISTER"
      ? { fullName: input.registration!.fullName, gender: input.registration!.gender, accepted: acceptedVersionsOf(currentCustomerDocs()) }
      : undefined;

  const code = generateCode();
  const otp = await db.otpCode.create({
    data: {
      phone,
      purpose,
      codeHash: hashCode(phone, purpose, code),
      payload: stored,
      expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
    },
  });

  try {
    await sendOtpSms(phone, code);
  } catch (error) {
    // Nothing was delivered: drop the code and let the user retry immediately.
    await db.otpCode.delete({ where: { id: otp.id } });
    await resetRateLimit(`otp-cooldown:${purpose}:${phone}`);
    throw error;
  }

  // Older pending codes for the same phone/purpose are no longer valid.
  await db.otpCode.updateMany({
    where: { phone, purpose, consumedAt: null, id: { not: otp.id } },
    data: { consumedAt: new Date() },
  });

  return {
    expiresInSec: OTP_TTL_SECONDS,
    resendInSec: OTP_RESEND_COOLDOWN_SECONDS,
    ...(env.devOtpEnabled ? { devCode: code } : {}),
  };
}

/**
 * Verifies a code and returns the logged-in (or newly registered) user.
 * Each code allows OTP_MAX_ATTEMPTS guesses and can be consumed only once.
 */
export async function verifyOtp(input: {
  phone: string;
  purpose: OtpPurpose;
  code: string;
  ip: string;
  userAgent?: string | null;
}): Promise<User> {
  const { phone, purpose, code } = input;
  await enforceRateLimit(`otp-verify-ip:${input.ip}`, VERIFY_MAX_PER_IP_PER_10_MIN, 600);

  const otp = await db.otpCode.findFirst({
    where: { phone, purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!otp || otp.expiresAt.getTime() <= Date.now()) throw new AppError("OTP_EXPIRED");

  // Count the attempt atomically before comparing, so parallel guesses cannot exceed the limit.
  const counted = await db.otpCode.updateMany({
    where: { id: otp.id, consumedAt: null, attempts: { lt: OTP_MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (counted.count === 0) throw new AppError("OTP_TOO_MANY_ATTEMPTS");

  const expected = Buffer.from(otp.codeHash, "hex");
  const actual = Buffer.from(hashCode(phone, purpose, code), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    const remaining = Math.max(0, OTP_MAX_ATTEMPTS - (otp.attempts + 1));
    if (remaining === 0) throw new AppError("OTP_TOO_MANY_ATTEMPTS");
    throw new AppError("OTP_INVALID", { details: { remainingAttempts: remaining } });
  }

  const consumed = await db.otpCode.updateMany({
    where: { id: otp.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count === 0) throw new AppError("OTP_EXPIRED");

  if (purpose === "LOGIN") {
    const user = await db.user.findUnique({ where: { phone } });
    if (!user || user.role !== "USER") throw new AppError("PHONE_NOT_REGISTERED");
    if (!user.isActive) throw new AppError("ACCOUNT_DISABLED");
    return user;
  }

  const payload = otp.payload as StoredRegistration | null;
  if (!payload?.fullName || (payload.gender !== "MALE" && payload.gender !== "FEMALE") || !payload.accepted) {
    throw new AppError("VALIDATION");
  }
  try {
    return await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { phone, fullName: payload.fullName, gender: payload.gender, role: "USER" },
      });
      await recordCustomerConsent(tx, {
        userId: user.id,
        context: "REGISTER",
        versions: payload.accepted,
        ip: input.ip,
        userAgent: input.userAgent,
      });
      await audit(tx, { actorId: user.id, action: "USER_REGISTERED", entity: "User", entityId: user.id });
      return user;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError("PHONE_ALREADY_REGISTERED");
    throw error;
  }
}
