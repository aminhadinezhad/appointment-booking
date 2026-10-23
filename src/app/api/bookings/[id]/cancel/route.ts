import { requireUser } from "@/server/auth/current";
import { api } from "@/server/http";
import { cancelBooking, getUserBooking } from "@/server/services/bookings";

export const POST = api<{ id: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  await cancelBooking({ bookingId: id, actor: { id: user.id, role: "USER" } });
  return { booking: await getUserBooking(user.id, id) };
});
