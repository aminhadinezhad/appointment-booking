import { setSessionCookie } from "@/server/auth/current";
import { verifyOtp } from "@/server/auth/otp";
import { createSession } from "@/server/auth/sessions";
import { api, clientIp, readJson } from "@/server/http";
import { otpVerifySchema } from "@/lib/validation";

export const POST = api(async (req) => {
  const body = await readJson(req, otpVerifySchema);
  const user = await verifyOtp({ ...body, ip: clientIp(req) });
  const session = await createSession(user, req.headers.get("user-agent"));
  await setSessionCookie("USER", session.token, session.expiresAt);
  return { user: { id: user.id, fullName: user.fullName } };
});
