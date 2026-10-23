import { maskPhone } from "@/lib/phone";
import { env } from "./env";
import { AppError } from "./errors";

/** Sends the OTP code; throws AppError on failure. */
export async function sendOtpSms(phone: string, code: string): Promise<void> {
  switch (env.smsProvider) {
    case "console":
      if (env.isProduction) throw new AppError("SMS_NOT_CONFIGURED");
      console.info(`[sms:console] OTP for ${maskPhone(phone)}: ${code}`);
      return;
    case "kavenegar":
      return sendWithKavenegar(phone, code);
    default:
      console.error(`[sms] unknown SMS_PROVIDER "${env.smsProvider}"`);
      throw new AppError("SMS_NOT_CONFIGURED");
  }
}

async function sendWithKavenegar(phone: string, code: string): Promise<void> {
  const apiKey = env.kavenegarApiKey;
  if (!apiKey) throw new AppError("SMS_NOT_CONFIGURED");
  const url = new URL(`https://api.kavenegar.com/v1/${encodeURIComponent(apiKey)}/verify/lookup.json`);
  url.searchParams.set("receptor", phone);
  url.searchParams.set("token", code);
  url.searchParams.set("template", env.kavenegarTemplate);
  try {
    const res = await fetch(url, { method: "POST", signal: AbortSignal.timeout(10_000) });
    const body = (await res.json().catch(() => null)) as { return?: { status?: number; message?: string } } | null;
    if (!res.ok || body?.return?.status !== 200) {
      console.error(`[sms:kavenegar] failed for ${maskPhone(phone)}: HTTP ${res.status} ${body?.return?.message ?? ""}`);
      throw new AppError("SMS_FAILED");
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error(`[sms:kavenegar] request error for ${maskPhone(phone)}:`, error);
    throw new AppError("SMS_FAILED");
  }
}
