import { z } from "zod";
import { requireUser } from "@/server/auth/current";
import { api, readQuery } from "@/server/http";
import { getDaySlots } from "@/server/services/bookings";
import { dateKeySchema } from "@/lib/validation";

export const GET = api(async (req) => {
  const user = await requireUser();
  const { date } = readQuery(req, z.object({ date: dateKeySchema }));
  return { date, slots: await getDaySlots(date, user.id) };
});
