import { requireUser } from "@/server/auth/current";
import { api, readJson } from "@/server/http";
import { getUserBooking, rescheduleBooking } from "@/server/services/bookings";
import { createBookingSchema } from "@/lib/validation";

export const POST = api<{ id: string }>(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await readJson(req, createBookingSchema);
  const booking = await rescheduleBooking({ userId: user.id, bookingId: id, dateKey: body.date, hour: body.hour });
  return { booking: await getUserBooking(user.id, booking.id) };
});
