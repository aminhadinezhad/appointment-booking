import { requireAdmin } from "@/server/auth/current";
import { api, readQuery } from "@/server/http";
import { getAdminMonth } from "@/server/services/calendar";
import { jalaliMonthQuerySchema } from "@/lib/validation";

export const GET = api(async (req) => {
  await requireAdmin();
  const { jy, jm } = readQuery(req, jalaliMonthQuerySchema);
  return { days: await getAdminMonth(jy, jm) };
});
