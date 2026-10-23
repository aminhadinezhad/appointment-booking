import { requireAdmin } from "@/server/auth/current";
import { api, readJson } from "@/server/http";
import { getUserDetail, updateUserByAdmin } from "@/server/services/users";
import { adminUserUpdateSchema } from "@/lib/validation";

export const GET = api<{ id: string }>(async (_req, { params }) => {
  await requireAdmin();
  return getUserDetail((await params).id);
});

export const PATCH = api<{ id: string }>(async (req, { params }) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const body = await readJson(req, adminUserUpdateSchema);
  await updateUserByAdmin(id, body, admin.id);
  return getUserDetail(id);
});
