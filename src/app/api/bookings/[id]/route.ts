import { requireUser } from "@/server/auth/current";
import { api } from "@/server/http";
import { getUserBooking } from "@/server/services/bookings";

export const GET = api<{ id: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  return { booking: await getUserBooking(user.id, id) };
});
