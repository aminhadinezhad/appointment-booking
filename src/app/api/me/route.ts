import { requireUser } from "@/server/auth/current";
import { api, readJson } from "@/server/http";
import { updateOwnProfile } from "@/server/services/users";
import { profileUpdateSchema } from "@/lib/validation";

export const GET = api(async () => {
  const user = await requireUser();
  return {
    id: user.id,
    fullName: user.fullName,
    phone: user.phone,
    gender: user.gender,
    notes: user.notes,
    createdAt: user.createdAt.toISOString(),
  };
});

export const PATCH = api(async (req) => {
  const user = await requireUser();
  const body = await readJson(req, profileUpdateSchema);
  await updateOwnProfile(user.id, body);
  return { ok: true };
});
