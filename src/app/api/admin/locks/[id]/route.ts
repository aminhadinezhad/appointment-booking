import { requireAdmin } from "@/server/auth/current";
import { api, readJson } from "@/server/http";
import { getLockDetail, updateLock } from "@/server/services/locks";
import { lockWriteSchema, normalizeLockInput } from "@/lib/validation";

export const GET = api<{ id: string }>(async (_req, { params }) => {
  await requireAdmin();
  return getLockDetail((await params).id);
});

export const PUT = api<{ id: string }>(async (req, { params }) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const body = await readJson(req, lockWriteSchema);
  return updateLock(id, normalizeLockInput(body.lock), {
    actorId: admin.id,
    conflictMode: body.conflictMode,
    cancelReason: body.cancelReason,
  });
});
