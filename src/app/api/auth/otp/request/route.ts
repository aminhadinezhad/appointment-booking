import { z } from "zod";
import { requestOtp } from "@/server/auth/otp";
import { api, clientIp, readJson } from "@/server/http";
import { loginRequestSchema, registerRequestSchema } from "@/lib/validation";

const schema = z.discriminatedUnion("purpose", [
  loginRequestSchema.extend({ purpose: z.literal("LOGIN") }),
  registerRequestSchema.extend({ purpose: z.literal("REGISTER") }),
]);

export const POST = api(async (req) => {
  const body = await readJson(req, schema);
  return requestOtp({
    phone: body.phone,
    purpose: body.purpose,
    registration: body.purpose === "REGISTER" ? { fullName: body.fullName, gender: body.gender } : undefined,
    ip: clientIp(req),
  });
});
