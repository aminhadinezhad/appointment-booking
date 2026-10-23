import { changeAdminPassword } from "@/server/auth/admin";
import { getSessionToken, requireAdmin } from "@/server/auth/current";
import { api, readJson } from "@/server/http";
import { changePasswordSchema } from "@/lib/validation";

export const POST = api(async (req) => {
  const admin = await requireAdmin();
  const body = await readJson(req, changePasswordSchema);
  await changeAdminPassword({
    userId: admin.id,
    currentPassword: body.currentPassword,
    newPassword: body.newPassword,
    currentToken: await getSessionToken("ADMIN"),
  });
  return { ok: true };
});
