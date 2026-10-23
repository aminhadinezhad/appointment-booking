import { z } from "zod";
import { requireAdmin } from "@/server/auth/current";
import { api, readJson } from "@/server/http";
import { previewLockImpact } from "@/server/services/locks";
import { lockInputSchema, normalizeLockInput } from "@/lib/validation";

const schema = z.object({ lock: lockInputSchema, excludeLockId: z.string().max(40).optional() });

/** Read-only: what a lock would affect, shown to the admin before confirming. */
export const POST = api(async (req) => {
  await requireAdmin();
  const body = await readJson(req, schema);
  return previewLockImpact(normalizeLockInput(body.lock), { excludeLockId: body.excludeLockId });
});
