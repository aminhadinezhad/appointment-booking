"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, ChevronLeft } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { BookingStatusBadge } from "@/components/booking-status";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { PageTitle } from "@/components/user/user-shell";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatJalali, formatSlot, WEEKDAY_NAMES, weekdayOf } from "@/lib/dates";
import type { Booking } from "@/lib/types";
import { cn } from "@/lib/utils";

const FILTERS = [
  { key: "ALL", label: "همه" },
  { key: "UPCOMING", label: "پیش رو" },
  { key: "HELD", label: "برگزار شده" },
  { key: "CANCELLED", label: "لغو شده" },
] as const;

export default function MyBookingsPage() {
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]["key"]>("ALL");
  const query = useQuery({ queryKey: ["bookings"], queryFn: () => apiFetch<{ bookings: Booking[] }>("/api/bookings") });

  const items = (query.data?.bookings ?? []).filter(
    (b) => filter === "ALL" || b.displayStatus === filter || (filter === "UPCOMING" && b.displayStatus === "IN_PROGRESS"),
  );

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle
        title="رزروهای من"
        action={
          <Button asChild size="sm" variant="outline-primary">
            <Link href="/home">
              <CalendarPlus />
              رزرو جدید
            </Link>
          </Button>
        }
      />

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="فیلتر وضعیت">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer",
              filter === f.key ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {query.isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          title="رزروی یافت نشد"
          description={filter === "ALL" ? "هنوز رزروی ثبت نکرده‌اید." : "رزروی با این وضعیت ندارید."}
          action={
            <Button asChild size="sm">
              <Link href="/home">رزرو وقت</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {items.map((b) => (
            <li key={b.id}>
              <Link
                href={`/bookings/${b.id}`}
                className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="font-semibold">
                    {WEEKDAY_NAMES[weekdayOf(b.dateKey)]} <span className="tabular-nums">{formatJalali(b.dateKey)}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">{formatSlot(b.hour)}</p>
                </div>
                <BookingStatusBadge status={b.displayStatus} />
                <ChevronLeft className="size-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
