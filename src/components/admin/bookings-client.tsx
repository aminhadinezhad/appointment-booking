"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Search, XCircle } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { CancelBookingDialog, type CancelTarget } from "@/components/admin/cancel-booking-dialog";
import { Avatar, FilterChips, Pagination } from "@/components/admin/common";
import { BookingStatusBadge } from "@/components/booking-status";
import { JalaliDatePicker } from "@/components/jalali-date-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Switch } from "@/components/ui/switch";
import { apiFetch, errorMessage, toQuery } from "@/lib/api-client";
import { formatJalali, formatSlot, WEEKDAY_NAMES, weekdayOf } from "@/lib/dates";
import { toFaDigits } from "@/lib/digits";
import type { AdminBooking, Page } from "@/lib/types";

export interface BookingFilters {
  from: string | null;
  to: string | null;
  status: "ALL" | "ACTIVE" | "PENDING" | "HELD" | "CANCELLED";
  q: string;
  inLocked: boolean;
}

const STATUS_OPTIONS = [
  { key: "ALL", label: "همه" },
  { key: "PENDING", label: "در انتظار" },
  { key: "HELD", label: "برگزار شده" },
  { key: "CANCELLED", label: "لغو شده" },
] as const;

function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function AdminBookingsClient({ initial }: { initial: BookingFilters }) {
  const [filters, setFilters] = React.useState(initial);
  const [page, setPage] = React.useState(1);
  const [cancelTarget, setCancelTarget] = React.useState<CancelTarget | null>(null);
  const q = useDebounced(filters.q.trim());

  const params = {
    from: filters.from ?? undefined,
    to: filters.to ?? undefined,
    status: filters.status,
    q: q || undefined,
    inLockedRangeOnly: filters.inLocked ? "true" : undefined,
    page,
    pageSize: 20,
  };
  const query = useQuery({
    queryKey: ["admin-bookings", params],
    queryFn: () => apiFetch<Page<AdminBooking>>(`/api/admin/bookings${toQuery(params)}`),
    placeholderData: keepPreviousData,
  });

  React.useEffect(() => {
    const url = toQuery({
      from: filters.from,
      to: filters.to,
      status: filters.status === "ALL" ? undefined : filters.status,
      q: q || undefined,
      inLocked: filters.inLocked ? "1" : undefined,
    });
    // Keep the URL shareable without a server round-trip.
    window.history.replaceState(null, "", `/admin/bookings${url}`);
  }, [filters.from, filters.to, filters.status, filters.inLocked, q]);

  const update = (patch: Partial<BookingFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  return (
    <>
      <AdminPageHeader title="رزروها" description="مشاهده، جست‌وجو و لغو رزروها" />

      <Card className="mb-4 space-y-3 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={filters.q} onChange={(e) => update({ q: e.target.value })} placeholder="جست‌وجوی نام یا شماره موبایل..." className="pr-9" aria-label="جست‌وجو" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <JalaliDatePicker value={filters.from} onChange={(from) => update({ from })} placeholder="از تاریخ" clearable />
          <JalaliDatePicker value={filters.to} onChange={(to) => update({ to })} placeholder="تا تاریخ" clearable />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterChips label="وضعیت" options={STATUS_OPTIONS} value={filters.status === "ACTIVE" ? "ALL" : filters.status} onChange={(status) => update({ status })} />
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-warning">
            <Switch checked={filters.inLocked} onCheckedChange={(inLocked) => update({ inLocked })} />
            فقط رزروهای داخل محدوده قفل‌شده
          </label>
        </div>
      </Card>

      {query.isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState title="رزروی یافت نشد" description="فیلترها را تغییر دهید." />
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground">{toFaDigits(query.data.total)} رزرو</p>
          <ul className="space-y-3">
            {query.data.items.map((b) => (
              <li key={b.id}>
                <Card className="flex flex-wrap items-center gap-3 p-4">
                  <Avatar name={b.user.fullName} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/users/${b.user.id}`} className="font-semibold hover:text-primary">
                      {b.user.fullName}
                    </Link>
                    <p className="ltr text-right text-xs text-muted-foreground">{toFaDigits(b.user.phone ?? "")}</p>
                    <p className="mt-1 text-sm">
                      {WEEKDAY_NAMES[weekdayOf(b.dateKey)]} {formatJalali(b.dateKey)} — {formatSlot(b.hour)}
                    </p>
                    {b.cancelReason && <p className="mt-1 text-xs text-muted-foreground">علت لغو: {b.cancelReason}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <BookingStatusBadge status={b.displayStatus} />
                    {b.inLockedRange && b.displayStatus !== "HELD" && (
                      <Badge variant="warning">
                        <AlertTriangle />
                        رزرو موجود در محدوده قفل‌شده
                      </Badge>
                    )}
                    {b.canModify && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive-soft"
                        onClick={() => setCancelTarget({ id: b.id, dateKey: b.dateKey, hour: b.hour, userName: b.user.fullName })}
                      >
                        <XCircle />
                        لغو
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
          <Pagination page={page} pageSize={query.data.pageSize} total={query.data.total} onPage={setPage} />
        </>
      )}

      <CancelBookingDialog target={cancelTarget} onClose={() => setCancelTarget(null)} />
    </>
  );
}
