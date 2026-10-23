import { requireAdmin } from "@/server/auth/current";
import { api, readJson } from "@/server/http";
import { cancelBooking } from "@/server/services/bookings";
import { cancelBookingSchema } from "@/lib/validation";

export const POST = api<{ id: string }>(async (req, { params }) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const body = await readJson(req, cancelBookingSchema);
  await cancelBooking({ bookingId: id, actor: { id: admin.id, role: "ADMIN" }, reason: body.reason });
  return { ok: true };
});
