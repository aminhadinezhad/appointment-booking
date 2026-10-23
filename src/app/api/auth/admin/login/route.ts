import { authenticateAdmin } from "@/server/auth/admin";
import { setSessionCookie } from "@/server/auth/current";
import { createSession } from "@/server/auth/sessions";
import { api, clientIp, readJson } from "@/server/http";
import { adminLoginSchema } from "@/lib/validation";

export const POST = api(async (req) => {
  const body = await readJson(req, adminLoginSchema);
  const admin = await authenticateAdmin({ ...body, ip: clientIp(req) });
  const session = await createSession(admin, req.headers.get("user-agent"));
  await setSessionCookie("ADMIN", session.token, session.expiresAt);
  return { user: { id: admin.id, fullName: admin.fullName } };
});
