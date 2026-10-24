import { authenticateAdmin } from "@/server/auth/admin";
import { setSessionCookie } from "@/server/auth/current";
import { createSession } from "@/server/auth/sessions";
import { api, clientIp, readJson } from "@/server/http";
import { hasAcceptedPlatformTerms } from "@/server/services/legal";
import { adminLoginSchema } from "@/lib/validation";

export const POST = api(async (req) => {
  const body = await readJson(req, adminLoginSchema);
  const ip = clientIp(req);
  const admin = await authenticateAdmin({ ...body, ip });
  const session = await createSession(admin, req.headers.get("user-agent"), ip);
  await setSessionCookie("ADMIN", session.token, session.expiresAt);
  return { user: { id: admin.id, fullName: admin.fullName }, termsAccepted: await hasAcceptedPlatformTerms(admin.id) };
});
