import { requireAdmin } from "@/server/auth/current";
import { api, readJson } from "@/server/http";
import { getSettings, updateSettings } from "@/server/services/settings";
import { settingsSchema } from "@/lib/validation";

export const GET = api(async () => {
  await requireAdmin();
  return getSettings();
});

export const PUT = api(async (req) => {
  const admin = await requireAdmin();
  const body = await readJson(req, settingsSchema);
  return updateSettings(body, admin.id);
});
