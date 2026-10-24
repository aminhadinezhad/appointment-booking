import { z } from "zod";
import { requireAdmin } from "@/server/auth/current";
import { AppError } from "@/server/errors";
import { api, readQuery } from "@/server/http";
import { buildExportWorkbook, type ExportSection } from "@/server/services/export";
import { tehranParts } from "@/lib/time";
import { dateKeySchema } from "@/lib/validation";

export const runtime = "nodejs";

const SECTIONS = ["users", "bookings", "locks", "consents"] as const;

const querySchema = z.object({
  sections: z
    .string()
    .default(SECTIONS.join(","))
    .transform((v) => [...new Set(v.split(",").map((s) => s.trim()))])
    .pipe(z.array(z.enum(SECTIONS)).min(1, "حداقل یک بخش را انتخاب کنید")),
  from: dateKeySchema.optional(),
  to: dateKeySchema.optional(),
});

export const GET = api(async (req) => {
  await requireAdmin();
  const query = readQuery(req, querySchema);
  if (query.from && query.to && query.from > query.to) {
    throw new AppError("VALIDATION", { message: "تاریخ شروع باید قبل از تاریخ پایان باشد" });
  }
  const buffer = await buildExportWorkbook({ sections: query.sections as ExportSection[], from: query.from, to: query.to });
  const filename = `booking-report-${tehranParts().dateKey}.xlsx`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
