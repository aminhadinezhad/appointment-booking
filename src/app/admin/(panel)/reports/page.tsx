"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, FileSpreadsheet, Users, XCircle } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { DailyChart, GenderSplit, HourlyChart, StatusDonut, STATUS_SERIES } from "@/components/admin/reports-charts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { apiFetch, errorMessage, toQuery } from "@/lib/api-client";
import { formatJalaliMonth, jalaliMonthDays, shiftJalaliMonth, toJalali } from "@/lib/dates";
import { toFaDigits } from "@/lib/digits";
import { tehranParts } from "@/lib/time";
import type { MonthlyStats } from "@/lib/types";

export default function ReportsPage() {
  const [month, setMonth] = React.useState(() => {
    const { jy, jm } = toJalali(tehranParts().dateKey);
    return { jy, jm };
  });
  const [showTable, setShowTable] = React.useState(false);
  const query = useQuery({
    queryKey: ["admin-stats", month.jy, month.jm],
    queryFn: () => apiFetch<MonthlyStats>(`/api/admin/stats${toQuery(month)}`),
    placeholderData: keepPreviousData,
  });
  const days = jalaliMonthDays(month.jy, month.jm);
  const exportHref = `/api/admin/export${toQuery({ sections: "bookings", from: days[0], to: days.at(-1) })}`;
  const move = (delta: number) => setMonth((m) => shiftJalaliMonth(m.jy, m.jm, delta));

  return (
    <>
      <AdminPageHeader
        title="آمار و گزارش‌ها"
        actions={
          <Button asChild size="sm" variant="outline">
            <a href={exportHref}>
              <FileSpreadsheet />
              خروجی اکسل این ماه
            </a>
          </Button>
        }
      />

      <Card className="mb-4 flex items-center justify-between p-2">
        <Button variant="ghost" size="icon" onClick={() => move(-1)} aria-label="ماه قبل">
          <ChevronRight />
        </Button>
        <p className="font-bold">{formatJalaliMonth(month.jy, month.jm)}</p>
        <Button variant="ghost" size="icon" onClick={() => move(1)} aria-label="ماه بعد">
          <ChevronLeft />
        </Button>
      </Card>

      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
      ) : (
        <div className={query.isFetching ? "opacity-70 transition-opacity" : undefined}>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile icon={<Users />} tone="text-primary bg-primary-soft" label="کل کاربران" value={query.data.users.total} hint={`${toFaDigits(query.data.users.newThisMonth)} عضو جدید در این ماه`} href="/admin/users" />
            <Tile icon={<CheckCircle2 />} tone="text-primary bg-primary-soft" label="برگزار شده" value={query.data.bookings.held} />
            <Tile icon={<Clock />} tone="text-warning bg-warning-soft" label="در انتظار" value={query.data.bookings.pending} />
            <Tile icon={<XCircle />} tone="text-destructive bg-destructive-soft" label="لغو شده" value={query.data.bookings.cancelled} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>وضعیت جلسات</CardTitle>
              </CardHeader>
              <CardContent>
                <StatusDonut stats={query.data} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>جنسیت کاربران</CardTitle>
              </CardHeader>
              <CardContent>
                <GenderSplit stats={query.data} />
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>رزروها به تفکیک روز</CardTitle>
                <Button size="sm" variant="ghost" onClick={() => setShowTable((v) => !v)}>
                  {showTable ? "نمایش نمودار" : "نمایش جدول"}
                </Button>
              </CardHeader>
              <CardContent>
                <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  {STATUS_SERIES.map((s) => (
                    <span key={s.key} className="flex items-center gap-1.5">
                      <span className="size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
                      {s.label}
                    </span>
                  ))}
                </div>
                {showTable ? (
                  <div className="max-h-80 overflow-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-muted text-xs">
                        <tr>
                          <th className="px-3 py-2 text-right">روز</th>
                          {STATUS_SERIES.map((s) => (
                            <th key={s.key} className="px-3 py-2 text-right">
                              {s.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {query.data.daily.map((d) => (
                          <tr key={d.dateKey}>
                            <td className="px-3 py-1.5">{toFaDigits(d.day)}</td>
                            <td className="px-3 py-1.5 tabular-nums">{toFaDigits(d.held)}</td>
                            <td className="px-3 py-1.5 tabular-nums">{toFaDigits(d.pending)}</td>
                            <td className="px-3 py-1.5 tabular-nums">{toFaDigits(d.cancelled)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <DailyChart stats={query.data} />
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>ساعت‌های پرتقاضا</CardTitle>
                <p className="text-xs text-muted-foreground">تعداد رزروهای فعال این ماه بر اساس ساعت شروع</p>
              </CardHeader>
              <CardContent>
                <HourlyChart stats={query.data} />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

function Tile({ icon, tone, label, value, hint, href }: { icon: React.ReactNode; tone: string; label: string; value: number; hint?: string; href?: string }) {
  const body = (
    <Card className="flex h-full items-start justify-between gap-2 p-4 transition-colors hover:border-primary/30">
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-extrabold tabular-nums">{toFaDigits(value)}</p>
        {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      <span className={`grid size-9 place-items-center rounded-full [&_svg]:size-5 ${tone}`}>{icon}</span>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
