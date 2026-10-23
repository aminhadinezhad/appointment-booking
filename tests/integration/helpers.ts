import type { Gender } from "@prisma/client";
import { expect } from "vitest";
import { normalizeLockInput, lockInputSchema } from "@/lib/validation";
import { db } from "@/server/db";
import { AppError, type ErrorCode } from "@/server/errors";

/** Saturday 1405/08/02 (2026-10-24) 10:00 in Tehran. */
export const NOW = new Date("2026-10-24T06:30:00Z");
export const TODAY = "2026-10-24";
export const TOMORROW = "2026-10-25"; // Sunday
export const TUESDAY = "2026-10-27";
export const FRIDAY = "2026-10-30";
export const clock = { now: NOW };

let phoneSeq = 0;

export async function createUser(overrides: { fullName?: string; gender?: Gender; isActive?: boolean; phone?: string } = {}) {
  phoneSeq++;
  return db.user.create({
    data: {
      fullName: overrides.fullName ?? `کاربر ${phoneSeq}`,
      phone: overrides.phone ?? `0912${String(1_000_000 + phoneSeq).slice(-7)}`,
      gender: overrides.gender ?? "MALE",
      isActive: overrides.isActive ?? true,
      role: "USER",
    },
  });
}

export async function createAdmin(username = "admin") {
  return db.user.create({ data: { fullName: "مدیر آزمایشی", username, role: "ADMIN", passwordHash: null } });
}

export async function setSettings(bookableHours: number[] = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17], maxAdvanceDays = 60) {
  await db.settings.upsert({ where: { id: 1 }, update: { bookableHours, maxAdvanceDays }, create: { id: 1, bookableHours, maxAdvanceDays } });
}

export function lockOf(input: Record<string, unknown>) {
  return normalizeLockInput(lockInputSchema.parse(input));
}

export async function expectAppError(promise: Promise<unknown>, code: ErrorCode) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `expected AppError ${code}`).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
  return error as AppError;
}
