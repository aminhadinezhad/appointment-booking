import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type Tx = Prisma.TransactionClient;

/**
 * Advisory lock that orders booking writes against schedule-lock writes.
 * Bookings take it SHARED (they run concurrently with each other and rely on
 * the unique indexes), lock mutations take it EXCLUSIVE, so a booking can never
 * slip into a range while a lock for that range is being committed.
 */
const SCHEDULE_ADVISORY_KEY = 7_301_405;

export async function acquireScheduleLock(tx: Tx, mode: "shared" | "exclusive"): Promise<void> {
  if (mode === "shared") await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(${SCHEDULE_ADVISORY_KEY})`;
  else await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SCHEDULE_ADVISORY_KEY})`;
}

export const TX_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 10_000,
  timeout: 20_000,
} as const;

export function isUniqueViolation(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
