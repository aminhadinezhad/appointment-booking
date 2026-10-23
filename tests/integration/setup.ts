import { afterAll, beforeEach } from "vitest";
import { db } from "@/server/db";

beforeEach(async () => {
  await db.$executeRawUnsafe(
    `TRUNCATE "AuditLog", "Booking", "ScheduleLock", "Session", "OtpCode", "RateLimit", "Settings", "User" RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await db.$disconnect();
});
