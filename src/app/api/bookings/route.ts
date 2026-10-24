import { requireUser } from "@/server/auth/current";
import { api, clientIp, readJson } from "@/server/http";
import { createBooking, getUserBooking, listUserBookings } from "@/server/services/bookings";
import { resolveBookingConsent } from "@/server/services/legal";
import { bookingRequestSchema } from "@/lib/validation";

export const GET = api(async () => {
  const user = await requireUser();
  return { bookings: await listUserBookings(user.id) };
});

export const POST = api(async (req) => {
  const user = await requireUser();
  const body = await readJson(req, bookingRequestSchema);
  const consent = await resolveBookingConsent({
    userId: user.id,
    acceptTerms: body.acceptTerms,
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });
  const booking = await createBooking({ userId: user.id, dateKey: body.date, hour: body.hour, consent });
  return { booking: await getUserBooking(user.id, booking.id) };
});
