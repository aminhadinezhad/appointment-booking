import { notFound, redirect } from "next/navigation";
import { ResultScreen } from "@/components/user/result-screen";
import { formatJalaliLong, formatSlot } from "@/lib/dates";
import { requireUserPage } from "@/server/auth/current";
import { isAppError } from "@/server/errors";
import { getUserBooking } from "@/server/services/bookings";

export default async function BookingConfirmedPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ changed?: string }>;
}) {
  const user = await requireUserPage();
  const { id } = await params;
  const { changed } = await searchParams;
  const booking = await getUserBooking(user.id, id).catch((e) => {
    if (isAppError(e, "NOT_FOUND")) notFound();
    throw e;
  });
  if (booking.status !== "ACTIVE") redirect(`/bookings/${id}`);

  return (
    <ResultScreen
      title={changed ? "ساعت رزرو با موفقیت تغییر کرد" : "رزرو با موفقیت ثبت شد"}
      description="لطفاً در زمان مقرر حضور داشته باشید."
      date={formatJalaliLong(booking.dateKey)}
      time={formatSlot(booking.hour)}
      actionHref="/bookings"
      actionLabel="مشاهده رزروهای من"
      secondary={{ href: "/home", label: "بازگشت به تقویم" }}
    />
  );
}
