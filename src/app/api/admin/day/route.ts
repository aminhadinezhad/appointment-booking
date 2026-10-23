import { z } from "zod";
import { requireAdmin } from "@/server/auth/current";
import { api, readQuery } from "@/server/http";
import { getAdminDay } from "@/server/services/calendar";
import { dateKeySchema } from "@/lib/validation";

export const GET = api(async (req) => {
  await requireAdmin();
  const { date } = readQuery(req, z.object({ date: dateKeySchema }));
  return { date, slots: await getAdminDay(date) };
});
