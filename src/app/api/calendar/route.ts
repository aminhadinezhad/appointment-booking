import { requireUser } from "@/server/auth/current";
import { api, readQuery } from "@/server/http";
import { getUserMonth } from "@/server/services/calendar";
import { jalaliMonthQuerySchema } from "@/lib/validation";

export const GET = api(async (req) => {
  const user = await requireUser();
  const { jy, jm } = readQuery(req, jalaliMonthQuerySchema);
  return { days: await getUserMonth(jy, jm, user.id) };
});
