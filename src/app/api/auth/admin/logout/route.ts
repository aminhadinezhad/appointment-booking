import { clearSessionCookie, getSessionToken } from "@/server/auth/current";
import { deleteSessionByToken } from "@/server/auth/sessions";
import { api } from "@/server/http";

export const POST = api(async () => {
  await deleteSessionByToken(await getSessionToken("ADMIN"));
  await clearSessionCookie("ADMIN");
  return { ok: true };
});
