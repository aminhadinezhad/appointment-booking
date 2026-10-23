"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarX2, Lock, RefreshCw, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { JalaliCalendar, type CalendarDayProps } from "@/components/jalali-calendar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Switch } from "@/components/ui/switch";
import { SlotGrid, SlotLegend } from "@/components/user/slot-grid";
import { apiFetch, ApiError, errorMessage, toQuery } from "@/lib/api-client";
import { formatJalaliLong, formatSlot, shiftJalaliMonth, toJalali } from "@/lib/dates";
import type { Booking, DaySummary, SlotView } from "@/lib/types";

const REFRESH_CODES = new Set(["SLOT_TAKEN", "SLOT_LOCKED", "SLOT_IN_PAST", "SLOT_NOT_BOOKABLE", "ONE_BOOKING_PER_DAY", "BOOKING_NOT_ACTIVE"]);

export function HomeClient({
  firstName,
  todayKey,
  initialDate,
  rescheduleId,
}: {
  firstName: string;
  todayKey: string;
  initialDate: string;
  rescheduleId: string | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const today = toJalali(todayKey);
  const [month, setMonth] = React.useState(() => {
    const { jy, jm } = toJalali(initialDate);
    return { jy, jm };
  });
  const [selected, setSelected] = React.useState(initialDate);
  const [showAll, setShowAll] = React.useState(false);
  const [pending, setPending] = React.useState<SlotView | null>(null);

  const calendar = useQuery({
    queryKey: ["calendar", month.jy, month.jm],
    queryFn: () => apiFetch<{ days: DaySummary[] }>(`/api/calendar${toQuery(month)}`),
    placeholderData: (prev) => prev,
  });
  const slots = useQuery({
    queryKey: ["slots", selected],
    queryFn: () => apiFetch<{ slots: SlotView[] }>(`/api/slots${toQuery({ date: selected })}`),
  });
  const rescheduling = useQuery({
    queryKey: ["booking", rescheduleId],
    queryFn: () => apiFetch<{ booking: Booking }>(`/api/bookings/${rescheduleId}`),
    enabled: !!rescheduleId,
  });
  const rescheduleTarget = rescheduling.data?.booking.canModify ? rescheduling.data.booking : null;

  const summaries = React.useMemo(() => new Map(calendar.data?.days.map((d) => [d.dateKey, d])), [calendar.data]);
  const daySummary = summaries.get(selected);
  const mineToday = slots.data?.slots.find((s) => s.state === "MINE" && s.bookingId);
  // Booking being moved: explicit reschedule target, or the user's existing booking on this day.
  const moving = rescheduleTarget ?? (mineToday ? { id: mineToday.bookingId!, dateKey: selected, hour: mineToday.hour } : null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["slots"] });
    void queryClient.invalidateQueries({ queryKey: ["calendar"] });
    void queryClient.invalidateQueries({ queryKey: ["bookings"] });
  };

  const mutation = useMutation({
    mutationFn: (slot: SlotView) =>
      moving
        ? apiFetch<{ booking: Booking }>(`/api/bookings/${moving.id}/reschedule`, { body: { date: selected, hour: slot.hour } })
        : apiFetch<{ booking: Booking }>("/api/bookings", { body: { date: selected, hour: slot.hour } }),
    onSuccess: ({ booking }) => {
      refresh();
      router.push(`/bookings/${booking.id}/confirmed${moving ? "?changed=1" : ""}`);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      setPending(null);
      if (error instanceof ApiError && REFRESH_CODES.has(error.code)) refresh();
    },
  });

  function dayProps(dateKey: string): CalendarDayProps {
    const d = summaries.get(dateKey);
    if (!d) return { disabled: dateKey < todayKey, tone: dateKey < todayKey ? "muted" : "default" };
    const marker = d.hasMyBooking ? "mine" : d.hasPartialLock ? "locked" : d.status === "AVAILABLE" ? "dot" : null;
    switch (d.status) {
      case "PAST":
        return { disabled: true, tone: "muted" };
      case "CLOSED":
        return { tone: "closed", marker: d.hasMyBooking ? "mine" : null, srLabel: "بسته است" };
      case "FULL":
        return { tone: "full", marker, srLabel: "ظرفیت تکمیل" };
      case "UNAVAILABLE":
        return { tone: "muted", marker, srLabel: "قابل رزرو نیست" };
      default:
        return { marker, srLabel: d.hasPartialLock ? "برخی ساعت‌ها بسته است" : undefined };
    }
  }

  const visibleSlots = (slots.data?.slots ?? []).filter((s) => showAll || s.state !== "CLOSED_HOURS");

  return (
    <>
      <div className="mb-5">
        <h1 className="text-xl font-bold">سلام، {firstName} 👋</h1>
        <p className="mt-1 text-sm text-muted-foreground">به سامانه رزرو وقت خوش آمدید. روز و ساعت دلخواه را انتخاب کنید.</p>
      </div>

      {rescheduleTarget && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary-soft px-4 py-3 text-sm text-primary">
          <span className="flex items-center gap-2">
            <RefreshCw className="size-4 shrink-0" />
            در حال تغییر ساعت رزرو {formatJalaliLong(rescheduleTarget.dateKey)}، {formatSlot(rescheduleTarget.hour)}. ساعت جدید را انتخاب کنید.
          </span>
          <Button variant="ghost" size="icon-sm" onClick={() => router.replace("/home")} aria-label="انصراف از تغییر ساعت">
            <X />
          </Button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <Card className="h-fit">
          <CardContent className="pt-5">
            <JalaliCalendar
              jy={month.jy}
              jm={month.jm}
              onMonthChange={(jy, jm) => setMonth({ jy, jm })}
              selected={selected}
              onSelect={setSelected}
              todayKey={todayKey}
              getDayProps={dayProps}
              minMonth={today}
              maxMonth={shiftJalaliMonth(today.jy, today.jm, 12)}
              loading={calendar.isFetching}
            />
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t pt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-primary" />دارای وقت آزاد</span>
              <span className="flex items-center gap-1.5"><span className="h-1 w-2.5 rounded-full bg-locked/70" />بخشی از روز بسته</span>
              <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-success" />رزرو شما</span>
              <span className="flex items-center gap-1.5"><span className="text-destructive/70 line-through">۱۲</span>روز بسته</span>
            </div>
            {calendar.isError && <p className="mt-3 text-xs text-destructive">{errorMessage(calendar.error)}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>زمان‌های {selected === todayKey ? "امروز" : "روز انتخاب‌شده"}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{formatJalaliLong(selected)}</p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              نمایش همه ۲۴ ساعت
              <Switch checked={showAll} onCheckedChange={setShowAll} aria-label="نمایش همه ساعت‌ها" />
            </label>
          </CardHeader>
          <CardContent className="space-y-4">
            {daySummary?.status === "CLOSED" && (
              <div className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive-soft px-4 py-3 text-sm text-destructive">
                <Lock className="mt-0.5 size-4 shrink-0" />
                <div>
                  <p className="font-semibold">این روز بسته است</p>
                  {daySummary.publicReason && <p className="mt-0.5 text-destructive/80">{daySummary.publicReason}</p>}
                </div>
              </div>
            )}
            {moving && !rescheduleTarget && (
              <p className="rounded-lg bg-success-soft px-3 py-2 text-xs leading-6 text-success">
                شما در این روز رزرو دارید ({formatSlot(moving.hour)}). با انتخاب ساعت دیگر، رزرو شما به آن ساعت منتقل می‌شود.
              </p>
            )}

            {slots.isPending ? (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {Array.from({ length: 9 }, (_, i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : slots.isError ? (
              <ErrorState message={errorMessage(slots.error)} onRetry={() => slots.refetch()} />
            ) : visibleSlots.length === 0 ? (
              <EmptyState icon={CalendarX2} title="ساعتی برای این روز وجود ندارد" description="روز دیگری را انتخاب کنید." />
            ) : (
              <SlotGrid
                slots={visibleSlots}
                selectedHour={pending?.hour}
                onPick={(slot) => {
                  if (slot.state === "MINE" && slot.bookingId) router.push(`/bookings/${slot.bookingId}`);
                  else setPending(slot);
                }}
              />
            )}
            <SlotLegend />
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!pending} onOpenChange={(open) => !open && !mutation.isPending && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{moving ? "تغییر ساعت رزرو" : "تأیید رزرو"}</DialogTitle>
            <DialogDescription>
              {moving ? "رزرو فعلی شما لغو و رزرو جدید به‌صورت هم‌زمان ثبت می‌شود." : "لطفاً اطلاعات رزرو را بررسی و تأیید کنید."}
            </DialogDescription>
          </DialogHeader>
          {pending && (
            <dl className="divide-y rounded-xl border text-sm">
              {moving && (
                <div className="flex justify-between gap-3 px-4 py-3">
                  <dt className="text-muted-foreground">زمان فعلی</dt>
                  <dd className="font-medium text-muted-foreground line-through">
                    {formatJalaliLong(moving.dateKey)}، {formatSlot(moving.hour)}
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-3 px-4 py-3">
                <dt className="text-muted-foreground">تاریخ</dt>
                <dd className="font-semibold">{formatJalaliLong(selected)}</dd>
              </div>
              <div className="flex justify-between gap-3 px-4 py-3">
                <dt className="text-muted-foreground">ساعت</dt>
                <dd className="font-semibold">{formatSlot(pending.hour)}</dd>
              </div>
            </dl>
          )}
          <DialogFooter>
            <Button onClick={() => pending && mutation.mutate(pending)} loading={mutation.isPending} className="sm:min-w-32">
              {moving ? "تأیید تغییر ساعت" : "تأیید رزرو"}
            </Button>
            <Button variant="outline" onClick={() => setPending(null)} disabled={mutation.isPending}>
              انصراف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {rescheduleId && rescheduling.isError && (
        <p className="mt-4 text-center text-sm text-destructive">
          رزرو موردنظر برای تغییر یافت نشد. <Link href="/bookings" className="underline">رزروهای من</Link>
        </p>
      )}
    </>
  );
}
