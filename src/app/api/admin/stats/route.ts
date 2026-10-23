import { requireAdmin } from "@/server/auth/current";
import { api, readQuery } from "@/server/http";
import { getMonthlyStats } from "@/server/services/stats";
import { jalaliMonthQuerySchema } from "@/lib/validation";

export const GET = api(async (req) => {
  await requireAdmin();
  const { jy, jm } = readQuery(req, jalaliMonthQuerySchema);
  return getMonthlyStats(jy, jm);
});
