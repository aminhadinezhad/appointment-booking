"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronRight, Clock, RefreshCw, XCircle } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { BookingStatusBadge } from "@/components/booking-status";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatJalaliLong, formatSlot } from "@/lib/dates";
import { formatDateTime } from "@/lib/time";
import type { Booking } from "@/lib/types";

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = React.useState(false);
  const query = useQuery({ queryKey: ["booking", id], queryFn: () => apiFetch<{ booking: Booking }>(`/api/bookings/${id}`) });

  const cancel = useMutation({
    mutationFn: () => apiFetch<{ booking: Booking }>(`/api/bookings/${id}/cancel`, { method: "POST", body: {} }),
    onSuccess: () => {
      void queryClient.invalidateQueries();
      router.push(`/bookings/${id}/cancelled`);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      setConfirming(false);
      void query.refetch();
    },
  });

  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  const b = query.data.booking;

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-5 flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="بازگشت">
          <Link href="/bookings">
            <ChevronRight className="size-5" />
          </Link>
        </Button>
        <h1 className="text-xl font-bold">جزئیات رزرو</h1>
      </div>

      <Card>
        <CardContent className="space-y-0 divide-y p-0">
          <Row icon={<CalendarDays />} label="تاریخ" value={formatJalaliLong(b.dateKey)} />
          <Row icon={<Clock />} label="ساعت" value={formatSlot(b.hour)} />
          <Row label="وضعیت" value={<BookingStatusBadge status={b.displayStatus} />} />
          <Row label="زمان ثبت رزرو" value={formatDateTime(b.createdAt)} />
          {b.cancelledAt && <Row label="زمان لغو" value={formatDateTime(b.cancelledAt)} />}
          {b.cancelReason && <Row label="علت لغو" value={b.cancelledByAdmin ? `${b.cancelReason} (توسط مدیر)` : b.cancelReason} />}
        </CardContent>
      </Card>

      {b.canModify && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Button asChild variant="outline-primary">
            <Link href={`/home?reschedule=${b.id}&date=${b.dateKey}`}>
              <RefreshCw />
              تغییر ساعت
            </Link>
          </Button>
          <Button variant="outline" className="text-destructive hover:bg-destructive-soft" onClick={() => setConfirming(true)}>
            <XCircle />
            لغو رزرو
          </Button>
        </div>
      )}

      <Dialog open={confirming} onOpenChange={(o) => !cancel.isPending && setConfirming(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>لغو رزرو</DialogTitle>
            <DialogDescription>
              آیا از لغو رزرو {formatJalaliLong(b.dateKey)}، {formatSlot(b.hour)} اطمینان دارید؟ این ساعت برای دیگران آزاد می‌شود.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="destructive" onClick={() => cancel.mutate()} loading={cancel.isPending}>
              بله، لغو شود
            </Button>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={cancel.isPending}>
              انصراف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ icon, label, value }: { icon?: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-4 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground [&_svg]:size-4">
        {icon}
        {label}
      </span>
      <span className="text-left font-medium">{value}</span>
    </div>
  );
}
