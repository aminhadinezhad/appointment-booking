import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { authenticateAdmin, changeAdminPassword } from "@/server/auth/admin";
import { OTP_MAX_ATTEMPTS, requestOtp, verifyOtp } from "@/server/auth/otp";
import { hashPassword } from "@/server/auth/password";
import { createSession, deleteSessionByToken, getUserBySessionToken } from "@/server/auth/sessions";
import { hitRateLimit } from "@/server/rate-limit";
import { updateUserByAdmin } from "@/server/services/users";
import { createUser, expectAppError } from "./helpers";

const PHONE = "09121112233";
const IP = "10.0.0.1";
const registration = { fullName: "سارا رضایی", gender: "FEMALE" as const };

afterEach(() => {
  vi.unstubAllEnvs();
});

async function register(phone = PHONE) {
  const { devCode } = await requestOtp({ phone, purpose: "REGISTER", registration, ip: IP });
  return verifyOtp({ phone, purpose: "REGISTER", code: devCode!, ip: IP });
}

describe("registration with OTP", () => {
  it("creates the user only after the code is verified", async () => {
    const res = await requestOtp({ phone: PHONE, purpose: "REGISTER", registration, ip: IP });
    expect(res).toMatchObject({ expiresInSec: 120, resendInSec: 60 });
    expect(res.devCode).toMatch(/^\d{5}$/);
    expect(await db.user.count()).toBe(0);

    const user = await verifyOtp({ phone: PHONE, purpose: "REGISTER", code: res.devCode!, ip: IP });
    expect(user).toMatchObject({ phone: PHONE, fullName: "سارا رضایی", gender: "FEMALE", role: "USER", isActive: true });
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(await db.auditLog.count({ where: { action: "USER_REGISTERED" } })).toBe(1);
  });

  it("stores only a hash of the code", async () => {
    const { devCode } = await requestOtp({ phone: PHONE, purpose: "REGISTER", registration, ip: IP });
    const row = await db.otpCode.findFirstOrThrow();
    expect(row.codeHash).not.toContain(devCode);
    expect(row.codeHash).toHaveLength(64);
  });

  it("refuses an already registered phone", async () => {
    await register();
    await expectAppError(requestOtp({ phone: PHONE, purpose: "REGISTER", registration, ip: IP }), "PHONE_ALREADY_REGISTERED");
  });

  it("a code cannot be used twice", async () => {
    const { devCode } = await requestOtp({ phone: PHONE, purpose: "REGISTER", registration, ip: IP });
    await verifyOtp({ phone: PHONE, purpose: "REGISTER", code: devCode!, ip: IP });
    await expectAppError(verifyOtp({ phone: PHONE, purpose: "REGISTER", code: devCode!, ip: IP }), "OTP_EXPIRED");
  });
});

describe("login with OTP", () => {
  it("logs in a registered user", async () => {
    const registered = await register();
    await db.rateLimit.deleteMany(); // skip resend cooldown
    const { devCode } = await requestOtp({ phone: PHONE, purpose: "LOGIN", ip: IP });
    const user = await verifyOtp({ phone: PHONE, purpose: "LOGIN", code: devCode!, ip: IP });
    expect(user.id).toBe(registered.id);
  });

  it("rejects unknown phones and disabled accounts", async () => {
    await expectAppError(requestOtp({ phone: PHONE, purpose: "LOGIN", ip: IP }), "PHONE_NOT_REGISTERED");
    await createUser({ phone: "09125554433", isActive: false });
    await expectAppError(requestOtp({ phone: "09125554433", purpose: "LOGIN", ip: IP }), "ACCOUNT_DISABLED");
  });

  it("rejects wrong codes and locks the code after the maximum attempts", async () => {
    await createUser({ phone: PHONE });
    const { devCode } = await requestOtp({ phone: PHONE, purpose: "LOGIN", ip: IP });
    const wrong = devCode === "00000" ? "11111" : "00000";
    const first = await expectAppError(verifyOtp({ phone: PHONE, purpose: "LOGIN", code: wrong, ip: IP }), "OTP_INVALID");
    expect(first.details).toEqual({ remainingAttempts: OTP_MAX_ATTEMPTS - 1 });
    for (let i = 2; i < OTP_MAX_ATTEMPTS; i++) {
      await expectAppError(verifyOtp({ phone: PHONE, purpose: "LOGIN", code: wrong, ip: IP }), "OTP_INVALID");
    }
    await expectAppError(verifyOtp({ phone: PHONE, purpose: "LOGIN", code: wrong, ip: IP }), "OTP_TOO_MANY_ATTEMPTS");
    // even the right code no longer works
    await expectAppError(verifyOtp({ phone: PHONE, purpose: "LOGIN", code: devCode!, ip: IP }), "OTP_TOO_MANY_ATTEMPTS");
  });

  it("parallel guesses cannot exceed the attempt limit", async () => {
    await createUser({ phone: PHONE });
    await requestOtp({ phone: PHONE, purpose: "LOGIN", ip: IP });
    await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) => verifyOtp({ phone: PHONE, purpose: "LOGIN", code: String(10000 + i), ip: IP })),
    );
    const row = await db.otpCode.findFirstOrThrow();
    expect(row.attempts).toBeLessThanOrEqual(OTP_MAX_ATTEMPTS);
  });

  it("rejects expired codes", async () => {
    await createUser({ phone: PHONE });
    const { devCode } = await requestOtp({ phone: PHONE, purpose: "LOGIN", ip: IP });
    await db.otpCode.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await expectAppError(verifyOtp({ phone: PHONE, purpose: "LOGIN", code: devCode!, ip: IP }), "OTP_EXPIRED");
  });

  it("enforces the resend cooldown, and only the newest code is valid", async () => {
    await createUser({ phone: PHONE });
    const first = await requestOtp({ phone: PHONE, purpose: "LOGIN", ip: IP });
    const cooldown = await expectAppError(requestOtp({ phone: PHONE, purpose: "LOGIN", ip: IP }), "OTP_COOLDOWN");
    expect(cooldown.details?.retryAfterSec).toBeGreaterThan(0);

    await db.rateLimit.deleteMany({ where: { key: { startsWith: "otp-cooldown" } } });
    const second = await requestOtp({ phone: PHONE, purpose: "LOGIN", ip: IP });
    if (first.devCode !== second.devCode) {
      await expectAppError(verifyOtp({ phone: PHONE, purpose: "LOGIN", code: first.devCode!, ip: IP }), "OTP_INVALID");
    }
    await expect(verifyOtp({ phone: PHONE, purpose: "LOGIN", code: second.devCode!, ip: IP })).resolves.toBeTruthy();
  });

  it("caps codes per phone per hour", async () => {
    await createUser({ phone: PHONE });
    for (let i = 0; i < 5; i++) {
      await requestOtp({ phone: PHONE, purpose: "LOGIN", ip: IP });
      await db.rateLimit.deleteMany({ where: { key: { startsWith: "otp-cooldown" } } });
    }
    await expectAppError(requestOtp({ phone: PHONE, purpose: "LOGIN", ip: IP }), "RATE_LIMITED");
  });

  it("never exposes the code or sends via console in production", async () => {
    await createUser({ phone: PHONE });
    vi.stubEnv("NODE_ENV", "production");
    await expectAppError(requestOtp({ phone: PHONE, purpose: "LOGIN", ip: IP }), "SMS_NOT_CONFIGURED");
    expect(await db.otpCode.count()).toBe(0); // the undelivered code was discarded
  });
});

describe("sessions", () => {
  it("resolves a token to its user and supports logout", async () => {
    const user = await createUser();
    const { token } = await createSession(user);
    expect((await getUserBySessionToken(token))?.id).toBe(user.id);
    expect(await getUserBySessionToken("forged")).toBeNull();
    const row = await db.session.findFirstOrThrow();
    expect(row.tokenHash).not.toBe(token);
    await deleteSessionByToken(token);
    expect(await getUserBySessionToken(token)).toBeNull();
  });

  it("drops expired sessions", async () => {
    const user = await createUser();
    const { token } = await createSession(user);
    await db.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1) } });
    expect(await getUserBySessionToken(token)).toBeNull();
    expect(await db.session.count()).toBe(0);
  });

  it("deactivating a user signs them out", async () => {
    const user = await createUser();
    const admin = await db.user.create({ data: { fullName: "مدیر", username: "boss", role: "ADMIN" } });
    const { token } = await createSession(user);
    await updateUserByAdmin(user.id, { isActive: false }, admin.id);
    expect(await getUserBySessionToken(token)).toBeNull();
    expect(await db.session.count()).toBe(0);
  });
});

describe("admin login", () => {
  it("authenticates with username and password", async () => {
    await db.user.create({ data: { fullName: "مدیر", username: "admin", role: "ADMIN", passwordHash: await hashPassword("Admin@12345") } });
    const admin = await authenticateAdmin({ username: " Admin ", password: "Admin@12345", ip: IP });
    expect(admin.role).toBe("ADMIN");
    await expectAppError(authenticateAdmin({ username: "admin", password: "wrong", ip: IP }), "INVALID_CREDENTIALS");
    await expectAppError(authenticateAdmin({ username: "nobody", password: "x", ip: IP }), "INVALID_CREDENTIALS");
  });

  it("a normal user cannot log in as admin", async () => {
    await db.user.create({ data: { fullName: "کاربر", username: "user1", role: "USER", passwordHash: await hashPassword("pass12345") } });
    await expectAppError(authenticateAdmin({ username: "user1", password: "pass12345", ip: IP }), "INVALID_CREDENTIALS");
  });

  it("throttles repeated failures per username", async () => {
    for (let i = 0; i < 10; i++) {
      await authenticateAdmin({ username: "admin", password: "x", ip: `1.1.1.${i}` }).catch(() => {});
    }
    await expectAppError(authenticateAdmin({ username: "admin", password: "x", ip: "2.2.2.2" }), "RATE_LIMITED");
  });

  it("changes the password and revokes other sessions", async () => {
    const admin = await db.user.create({ data: { fullName: "مدیر", username: "admin", role: "ADMIN", passwordHash: await hashPassword("Admin@12345") } });
    const current = await createSession(admin);
    const other = await createSession(admin);
    await expectAppError(changeAdminPassword({ userId: admin.id, currentPassword: "bad", newPassword: "NewPass@123" }), "WRONG_PASSWORD");
    await changeAdminPassword({ userId: admin.id, currentPassword: "Admin@12345", newPassword: "NewPass@123", currentToken: current.token });
    expect(await getUserBySessionToken(current.token)).not.toBeNull();
    expect(await getUserBySessionToken(other.token)).toBeNull();
    await expect(authenticateAdmin({ username: "admin", password: "NewPass@123", ip: IP })).resolves.toBeTruthy();
  });
});

describe("rate limiter", () => {
  it("reports retry-after within the window, whatever the database session time zone", async () => {
    await db.$executeRawUnsafe(`SET TIME ZONE 'Asia/Tehran'`);
    try {
      await hitRateLimit("tz", 1, 60);
      const blocked = await hitRateLimit("tz", 1, 60);
      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfterSec).toBeGreaterThan(55);
      expect(blocked.retryAfterSec).toBeLessThanOrEqual(60);
      const row = await db.rateLimit.findUniqueOrThrow({ where: { key: "tz" } });
      const secondsLeft = (row.resetAt.getTime() - Date.now()) / 1000;
      expect(secondsLeft).toBeGreaterThan(50);
      expect(secondsLeft).toBeLessThanOrEqual(61);
    } finally {
      await db.$executeRawUnsafe(`SET TIME ZONE 'UTC'`);
    }
  });

  it("counts atomically under concurrency", async () => {
    const results = await Promise.all(Array.from({ length: 15 }, () => hitRateLimit("k", 10, 60)));
    expect(results.filter((r) => r.allowed)).toHaveLength(10);
    expect(Math.max(...results.map((r) => r.count))).toBe(15);
  });
});
