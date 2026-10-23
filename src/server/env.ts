/** Typed, lazily-read configuration. Read at call time so tests can override process.env. */
export const env = {
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
  get authSecret(): string {
    const secret = process.env.AUTH_SECRET ?? "";
    if (secret.length < 32) {
      if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET must be at least 32 characters");
      return "insecure-development-secret-do-not-use-in-production";
    }
    return secret;
  },
  get smsProvider(): string {
    return (process.env.SMS_PROVIDER ?? "console").trim().toLowerCase();
  },
  get kavenegarApiKey() {
    return process.env.KAVENEGAR_API_KEY?.trim() ?? "";
  },
  get kavenegarTemplate() {
    return process.env.KAVENEGAR_TEMPLATE?.trim() || "verify";
  },
  get cookieSecure(): boolean {
    const raw = process.env.COOKIE_SECURE?.trim().toLowerCase();
    if (raw === "true") return true;
    if (raw === "false") return false;
    return process.env.NODE_ENV === "production";
  },
  /** The console SMS provider (code shown in terminal/UI) is a development-only convenience. */
  get devOtpEnabled(): boolean {
    return process.env.NODE_ENV !== "production" && this.smsProvider === "console";
  },
};
