import { requireAdmin } from "@/server/auth/current";
import { api, readJson } from "@/server/http";
import { unlockLock } from "@/server/services/locks";
import { unlockSchema } from "@/lib/validation";

export const POST = api<{ id: string }>(async (req, { params }) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const body = await readJson(req, unlockSchema);
  return { lock: await unlockLock(id, { actorId: admin.id, reason: body.reason }) };
});
