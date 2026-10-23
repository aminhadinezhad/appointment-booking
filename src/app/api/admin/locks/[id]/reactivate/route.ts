import { requireAdmin } from "@/server/auth/current";
import { api, readJson } from "@/server/http";
import { reactivateLock } from "@/server/services/locks";
import { reactivateLockSchema } from "@/lib/validation";

export const POST = api<{ id: string }>(async (req, { params }) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const body = await readJson(req, reactivateLockSchema);
  return reactivateLock(id, { actorId: admin.id, conflictMode: body.conflictMode, cancelReason: body.cancelReason });
});
