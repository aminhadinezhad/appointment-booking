import { notFound, redirect } from "next/navigation";
import { ResultScreen } from "@/components/user/result-screen";
import { formatJalali, formatSlot } from "@/lib/dates";
import { requireUserPage } from "@/server/auth/current";
import { isAppError } from "@/server/errors";
import { getUserBooking } from "@/server/services/bookings";

export default async function BookingCancelledPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUserPage();
  const { id } = await params;
  const booking = await getUserBooking(user.id, id).catch((e) => {
    if (isAppError(e, "NOT_FOUND")) notFound();
    throw e;
  });
  if (booking.status !== "CANCELLED") redirect(`/bookings/${id}`);

  return (
    <ResultScreen
      title="رزرو لغو شد"
      description={
        <>
          ساعت {formatSlot(booking.hour)}
          <br />
          در تاریخ {formatJalali(booking.dateKey)} لغو شد.
        </>
      }
      actionHref="/home"
      actionLabel="بازگشت به تقویم"
      secondary={{ href: "/bookings", label: "رزروهای من" }}
    />
  );
}
