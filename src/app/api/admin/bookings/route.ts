import { z } from "zod";
import { requireAdmin } from "@/server/auth/current";
import { api, readQuery } from "@/server/http";
import { listAdminBookings } from "@/server/services/admin-bookings";
import { dateKeySchema } from "@/lib/validation";

const querySchema = z.object({
  from: dateKeySchema.optional(),
  to: dateKeySchema.optional(),
  status: z.enum(["ALL", "ACTIVE", "PENDING", "HELD", "CANCELLED"]).default("ALL"),
  q: z.string().max(100).optional(),
  userId: z.string().max(40).optional(),
  inLockedRangeOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(30),
});

export const GET = api(async (req) => {
  await requireAdmin();
  return listAdminBookings(readQuery(req, querySchema));
});
