import { requireUser } from "@/server/auth/current";
import { api, readJson } from "@/server/http";
import { hasAcceptedCustomerDocs } from "@/server/services/legal";
import { updateOwnProfile } from "@/server/services/users";
import { profileUpdateSchema } from "@/lib/validation";

export const GET = api(async () => {
  const user = await requireUser();
  return {
    id: user.id,
    fullName: user.fullName,
    phone: user.phone,
    gender: user.gender,
    notes: user.notes,
    createdAt: user.createdAt.toISOString(),
    /** false after the business published new terms the user has not accepted yet */
    termsUpToDate: await hasAcceptedCustomerDocs(user.id),
  };
});

export const PATCH = api(async (req) => {
  const user = await requireUser();
  const body = await readJson(req, profileUpdateSchema);
  await updateOwnProfile(user.id, body);
  return { ok: true };
});
