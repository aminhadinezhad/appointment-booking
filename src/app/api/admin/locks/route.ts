import { z } from "zod";
import { requireAdmin } from "@/server/auth/current";
import { api, readJson, readQuery } from "@/server/http";
import { createLock, listLocks } from "@/server/services/locks";
import { dateKeySchema, lockWriteSchema, normalizeLockInput } from "@/lib/validation";

const querySchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE", "ALL"]).default("ACTIVE"),
  type: z.enum(["FULL_DAY", "TIME_RANGE", "WEEKLY"]).optional(),
  from: dateKeySchema.optional(),
  to: dateKeySchema.optional(),
});

export const GET = api(async (req) => {
  await requireAdmin();
  return { locks: await listLocks(readQuery(req, querySchema)) };
});

export const POST = api(async (req) => {
  const admin = await requireAdmin();
  const body = await readJson(req, lockWriteSchema);
  return createLock(normalizeLockInput(body.lock), {
    actorId: admin.id,
    conflictMode: body.conflictMode,
    cancelReason: body.cancelReason,
  });
});
