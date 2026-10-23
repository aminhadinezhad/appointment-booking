import { db } from "./db";
import { AppError, type ErrorCode } from "./errors";

/**
 * Fixed-window counter stored in PostgreSQL so it is atomic across concurrent
 * requests and survives restarts. Returns whether this hit is within `limit`.
 */
export async function hitRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; count: number; retryAfterSec: number }> {
  // Prisma stores DateTime columns as UTC `timestamp without time zone`, so the
  // SQL must use UTC explicitly; plain now() would follow the session TimeZone.
  const rows = await db.$queryRaw<{ count: number; retryAfterSec: number }[]>`
    INSERT INTO "RateLimit" ("key", "count", "resetAt")
    VALUES (${key}, 1, (now() AT TIME ZONE 'UTC') + make_interval(secs => ${windowSeconds}))
    ON CONFLICT ("key") DO UPDATE SET
      "count"   = CASE WHEN "RateLimit"."resetAt" <= (now() AT TIME ZONE 'UTC') THEN 1 ELSE "RateLimit"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" <= (now() AT TIME ZONE 'UTC')
                       THEN (now() AT TIME ZONE 'UTC') + make_interval(secs => ${windowSeconds})
                       ELSE "RateLimit"."resetAt" END
    RETURNING "count", CEIL(EXTRACT(EPOCH FROM ("resetAt" - (now() AT TIME ZONE 'UTC'))))::int AS "retryAfterSec"`;
  const row = rows[0]!;
  return { allowed: row.count <= limit, count: row.count, retryAfterSec: Math.max(1, row.retryAfterSec) };
}

export async function enforceRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  code: ErrorCode = "RATE_LIMITED",
): Promise<void> {
  const result = await hitRateLimit(key, limit, windowSeconds);
  if (!result.allowed) throw new AppError(code, { details: { retryAfterSec: result.retryAfterSec } });
}

export async function resetRateLimit(key: string): Promise<void> {
  await db.rateLimit.deleteMany({ where: { key } });
}
