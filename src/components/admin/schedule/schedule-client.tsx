"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarOff, CalendarRange, Clock3, Eye, Lock as LockIcon, Pencil, Repeat, RotateCcw, Unlock } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { FilterChips } from "@/components/admin/common";
import { JalaliCalendar, type CalendarDayProps } from "@/components/jalali-calendar";
import { JalaliDatePicker } from "@/components/jalali-date-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/input";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { apiFetch, errorMessage, toQuery } from "@/lib/api-client";
import { formatHour, formatJalaliLong, toJalali } from "@/lib/dates";
import { toFaDigits } from "@/lib/digits";
import { LOCK_TYPE_LABELS } from "@/lib/locks";
import { formatDateTime } from "@/lib/time";
import type { AdminDayOverview, AdminSlot, Lock, LockType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LockDetailDialog, LockStatusBadge, UnlockDialog } from "./lock-detail-dialog";
import { LockFormDialog, newDraft, type LockDialogMode } from "./lock-form-dialog";

const STATUS_OPTIONS = [
  { key: "ACTIVE", label: "فعال" },
  { key: "INACTIVE", label: "باز شده" },
  { key: "ALL", label: "همه" },
] as const;

export function ScheduleClient({ todayKey }: { todayKey: string }) {
  const [month, setMonth] = React.useState(() => {
    const { jy, jm } = toJalali(todayKey);
    return { jy, jm };
  });
  const [selected, setSelected] = React.useState(todayKey);
  const [dialog, setDialog] = React.useState<LockDialogMode | null>(null);
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [unlocking, setUnlocking] = React.useState<Lock | null>(null);
  const [filters, setFilters] = React.useState<{ status: "ACTIVE" | "INACTIVE" | "ALL"; type: LockType | ""; from: string | null; to: string | null }>({
    status: "ACTIVE",
    type: "",
    from: null,
    to: null,
  });

  const calendar = useQuery({
    queryKey: ["admin-calendar", month.jy, month.jm],
    queryFn: () => apiFetch<{ days: AdminDayOverview[] }>(`/api/admin/calendar${toQuery(month)}`),
    placeholderData: keepPreviousData,
  });
  const day = useQuery({
    queryKey: ["admin-day", selected],
    queryFn: () => apiFetch<{ slots: AdminSlot[] }>(`/api/admin/day${toQuery({ date: selected })}`),
  });
  const lockParams = { status: filters.status, type: filters.type || undefined, from: filters.from ?? undefined, to: filters.to ?? undefined };
  const locks = useQuery({
    queryKey: ["admin-locks", lockParams],
    queryFn: () => apiFetch<{ locks: Lock[] }>(`/api/admin/locks${toQuery(lockParams)}`),
    placeholderData: keepPreviousData,
  });

  const overview = React.useMemo(() => new Map(calendar.data?.days.map((d) => [d.dateKey, d])), [calendar.data]);
  const selectedOverview = overview.get(selected);

  function dayProps(dateKey: string): CalendarDayProps {
    const d = overview.get(dateKey);
    const muted = dateKey < todayKey;
    if (!d) return { tone: muted ? "muted" : "default" };
    if (d.fullyClosed) return { tone: "closed", marker: d.bookingsCount ? "dot" : null, srLabel: "روز کاملاً بسته" };
    return {
      tone: muted ? "muted" : "default",
      marker: d.lockedHours.length ? "locked" : d.bookingsCount ? "dot" : null,
      srLabel: [d.lockedHours.length ? "دارای قفل ساعتی" : "", d.bookingsCount ? `${d.bookingsCount} رزرو` : ""].filter(Boolean).join("، ") || undefined,
    };
  }

  const openEdit = (lock: Lock) => {
    setDetailId(null);
    setDialog({ kind: "edit", lock });
  };
  const openReactivate = (lock: Lock) => {
    setDetailId(null);
    setDialog({ kind: "reactivate", lock });
  };
  const openUnlock = (lock: Lock) => {
    setDetailId(null);
    setUnlocking(lock);
  };
  const defaultDate = selected >= todayKey ? selected : todayKey;

  return (
    <>
      <AdminPageHeader
        title="مدیریت زمان‌بندی و تعطیلی‌ها"
        description="بستن و بازکردن روزها و ساعت‌ها برای رزرو"
        actions={
          <>
            <Button size="sm" onClick={() => setDialog({ kind: "create", draft: newDraft("FULL_DAY", defaultDate) })}>
              <CalendarOff />
              قفل روز کامل
            </Button>
            <Button size="sm" variant="outline-primary" onClick={() => setDialog({ kind: "create", draft: newDraft("TIME_RANGE", defaultDate) })}>
              <Clock3 />
              قفل بازه ساعتی
            </Button>
            <Button size="sm" variant="outline-primary" onClick={() => setDialog({ kind: "create", draft: newDraft("WEEKLY") })}>
              <Repeat />
              تعریف قفل هفتگی
            </Button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
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
              loading={calendar.isFetching}
            />
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t pt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="text-destructive/70 line-through">۱۲</span>روز کاملاً بسته</span>
              <span className="flex items-center gap-1.5"><span className="h-1 w-2.5 rounded-full bg-locked/70" />دارای قفل ساعتی</span>
              <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-primary" />دارای رزرو</span>
            </div>
            {calendar.isError && <p className="mt-2 text-xs text-destructive">{errorMessage(calendar.error)}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>{formatJalaliLong(selected)}</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedOverview
                  ? selectedOverview.fullyClosed
                    ? "این روز کاملاً بسته است"
                    : selectedOverview.lockedHours.length
                      ? `${toFaDigits(selectedOverview.lockedHours.length)} ساعت قفل‌شده`
                      : "بدون قفل"
                  : " "}
                {selectedOverview?.bookingsCount ? ` · ${toFaDigits(selectedOverview.bookingsCount)} رزرو فعال` : ""}
              </p>
            </div>
            {selected >= todayKey && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "create", draft: newDraft("FULL_DAY", selected) })}>
                  بستن کل روز
                </Button>
                <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "create", draft: newDraft("TIME_RANGE", selected) })}>
                  بستن بازه
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {selectedOverview && selectedOverview.bookingsInLockedRange > 0 && (
              <p className="mb-3 flex items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs font-medium text-warning">
                <AlertTriangle className="size-4" />
                {toFaDigits(selectedOverview.bookingsInLockedRange)} رزرو موجود در محدوده قفل‌شده
              </p>
            )}
            {day.isPending ? (
              <Skeleton className="h-96" />
            ) : day.isError ? (
              <ErrorState message={errorMessage(day.error)} onRetry={() => day.refetch()} />
            ) : (
              <ul className="max-h-[28rem] divide-y overflow-y-auto rounded-xl border text-sm">
                {day.data.slots.map((s) => (
                  <li key={s.hour} className={cn("flex flex-wrap items-center gap-2 px-3 py-2", s.isPast && "opacity-50", s.locks.length && "hatch")}>
                    <span className="ltr w-28 shrink-0 whitespace-nowrap font-medium tabular-nums">
                      {formatHour(s.hour)} - {formatHour(s.hour + 1)}
                    </span>
                    <span className="flex flex-1 flex-wrap items-center gap-1.5">
                      {!s.isBookableHour && <Badge variant="muted">خارج از ساعات کاری</Badge>}
                      {s.locks.map((l) => (
                        <button key={l.id} type="button" onClick={() => setDetailId(l.id)} className="cursor-pointer">
                          <Badge variant="locked">
                            <LockIcon />
                            {LOCK_TYPE_LABELS[l.type]}
                            {l.reason ? `: ${l.reason}` : ""}
                          </Badge>
                        </button>
                      ))}
                      {s.booking && (
                        <Link href={`/admin/users/${s.booking.user.id}`}>
                          <Badge variant={s.locks.length ? "warning" : "default"}>
                            {s.locks.length ? <AlertTriangle /> : null}
                            رزرو: {s.booking.user.fullName}
                          </Badge>
                        </Link>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>فهرست قفل‌ها</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[auto_10rem_1fr_1fr] md:items-center">
            <FilterChips label="وضعیت قفل" options={STATUS_OPTIONS} value={filters.status} onChange={(status) => setFilters((f) => ({ ...f, status }))} />
            <NativeSelect value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value as LockType | "" }))} aria-label="نوع قفل" className="h-10">
              <option value="">همه انواع</option>
              <option value="FULL_DAY">روز کامل</option>
              <option value="TIME_RANGE">بازه ساعتی</option>
              <option value="WEEKLY">هفتگی</option>
            </NativeSelect>
            <JalaliDatePicker value={filters.from} onChange={(from) => setFilters((f) => ({ ...f, from }))} placeholder="از تاریخ" clearable />
            <JalaliDatePicker value={filters.to} onChange={(to) => setFilters((f) => ({ ...f, to }))} placeholder="تا تاریخ" clearable />
          </div>

          {locks.isPending ? (
            <Skeleton className="h-32" />
          ) : locks.isError ? (
            <ErrorState message={errorMessage(locks.error)} onRetry={() => locks.refetch()} />
          ) : locks.data.locks.length === 0 ? (
            <EmptyState icon={CalendarRange} title="قفلی یافت نشد" description="با دکمه‌های بالای صفحه روز یا ساعتی را ببندید." />
          ) : (
            <ul className="grid gap-3 lg:grid-cols-2">
              {locks.data.locks.map((lock) => (
                <li key={lock.id} className={cn("rounded-xl border p-4", lock.isActive ? "bg-card" : "bg-muted/40")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{LOCK_TYPE_LABELS[lock.type]}</Badge>
                    <LockStatusBadge lock={lock} />
                    {lock.isReasonPublic && <Badge variant="muted">دلیل عمومی</Badge>}
                    {lock.keptBookingsCount > 0 && (
                      <Badge variant="warning">
                        <AlertTriangle />
                        {toFaDigits(lock.keptBookingsCount)} رزرو موجود
                      </Badge>
                    )}
                  </div>
                  <p className="mt-2 font-semibold">{lock.scope}</p>
                  {lock.reason && <p className="mt-1 text-sm text-muted-foreground">{lock.reason}</p>}
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {lock.isActive
                      ? `ایجاد: ${formatDateTime(lock.createdAt)} — ${lock.createdBy?.fullName ?? ""}`
                      : `باز شده: ${lock.unlockedAt ? formatDateTime(lock.unlockedAt) : "—"} — ${lock.unlockedBy?.fullName ?? ""}`}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setDetailId(lock.id)}>
                      <Eye />
                      جزئیات
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(lock)}>
                      <Pencil />
                      ویرایش
                    </Button>
                    {lock.isActive ? (
                      <Button size="sm" variant="outline-primary" onClick={() => openUnlock(lock)}>
                        <Unlock />
                        بازکردن قفل
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => openReactivate(lock)}>
                        <RotateCcw />
                        فعال‌سازی مجدد
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <LockFormDialog mode={dialog} onClose={() => setDialog(null)} />
      <LockDetailDialog lockId={detailId} onClose={() => setDetailId(null)} onEdit={openEdit} onUnlock={openUnlock} onReactivate={openReactivate} />
      <UnlockDialog lock={unlocking} onClose={() => setUnlocking(null)} />
    </>
  );
}
