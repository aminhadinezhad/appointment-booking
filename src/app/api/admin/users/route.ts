import { z } from "zod";
import { requireAdmin } from "@/server/auth/current";
import { api, readQuery } from "@/server/http";
import { listUsers } from "@/server/services/users";

const querySchema = z.object({
  q: z.string().max(100).optional(),
  status: z.enum(["ALL", "ACTIVE", "INACTIVE"]).default("ALL"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const GET = api(async (req) => {
  await requireAdmin();
  return listUsers(readQuery(req, querySchema));
});
