import { requireUser } from "@/server/auth/current";
import { api, readJson } from "@/server/http";
import { createBooking, getUserBooking, listUserBookings } from "@/server/services/bookings";
import { createBookingSchema } from "@/lib/validation";

export const GET = api(async () => {
  const user = await requireUser();
  return { bookings: await listUserBookings(user.id) };
});

export const POST = api(async (req) => {
  const user = await requireUser();
  const body = await readJson(req, createBookingSchema);
  const booking = await createBooking({ userId: user.id, dateKey: body.date, hour: body.hour });
  return { booking: await getUserBooking(user.id, booking.id) };
});
