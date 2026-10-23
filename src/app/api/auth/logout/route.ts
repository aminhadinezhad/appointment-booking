import { clearSessionCookie, getSessionToken } from "@/server/auth/current";
import { deleteSessionByToken } from "@/server/auth/sessions";
import { api } from "@/server/http";

export const POST = api(async () => {
  await deleteSessionByToken(await getSessionToken("USER"));
  await clearSessionCookie("USER");
  return { ok: true };
});
