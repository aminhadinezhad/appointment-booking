import { requireUser } from "@/server/auth/current";
import { api, clientIp, readJson } from "@/server/http";
import { getUserBooking, rescheduleBooking } from "@/server/services/bookings";
import { resolveBookingConsent } from "@/server/services/legal";
import { bookingRequestSchema } from "@/lib/validation";

export const POST = api<{ id: string }>(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await readJson(req, bookingRequestSchema);
  const consent = await resolveBookingConsent({
    userId: user.id,
    acceptTerms: body.acceptTerms,
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });
  const booking = await rescheduleBooking({ userId: user.id, bookingId: id, dateKey: body.date, hour: body.hour, consent });
  return { booking: await getUserBooking(user.id, booking.id) };
});
