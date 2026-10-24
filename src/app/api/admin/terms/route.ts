import { requireAdmin } from "@/server/auth/current";
import { api, clientIp, readJson } from "@/server/http";
import { acceptPlatformTerms, currentPlatformTerms, hasAcceptedPlatformTerms } from "@/server/services/legal";
import { acceptPlatformTermsSchema } from "@/lib/validation";

export const GET = api(async () => {
  const admin = await requireAdmin({ allowPendingTerms: true });
  const terms = currentPlatformTerms();
  return { version: terms.version, effectiveDate: terms.effectiveDate, accepted: await hasAcceptedPlatformTerms(admin.id, terms) };
});

/** Records the admin's acceptance of the current software terms. */
export const POST = api(async (req) => {
  const admin = await requireAdmin({ allowPendingTerms: true });
  const body = await readJson(req, acceptPlatformTermsSchema);
  await acceptPlatformTerms({ userId: admin.id, version: body.version, ip: clientIp(req), userAgent: req.headers.get("user-agent") });
  return { ok: true };
});
