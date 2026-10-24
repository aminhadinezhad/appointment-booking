"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, XCircle } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { CancelBookingDialog, type CancelTarget } from "@/components/admin/cancel-booking-dialog";
import { Avatar } from "@/components/admin/common";
import { BookingStatusBadge } from "@/components/booking-status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { Switch } from "@/components/ui/switch";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatJalali, formatSlot, WEEKDAY_NAMES, weekdayOf } from "@/lib/dates";
import { toFaDigits } from "@/lib/digits";
import { CONSENT_CONTEXT_LABELS, LEGAL_DOCUMENT_LABELS } from "@/lib/legal-text";
import { formatDateTime } from "@/lib/time";
import type { UserDetail } from "@/lib/types";

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [notes, setNotes] = React.useState<string | null>(null);
  const [confirmStatus, setConfirmStatus] = React.useState<boolean | null>(null);
  const [cancelTarget, setCancelTarget] = React.useState<CancelTarget | null>(null);
  const query = useQuery({ queryKey: ["admin-user", id], queryFn: () => apiFetch<UserDetail>(`/api/admin/users/${id}`) });

  const update = useMutation({
    mutationFn: (body: { isActive?: boolean; notes?: string | null }) => apiFetch<UserDetail>(`/api/admin/users/${id}`, { method: "PATCH", body }),
    onSuccess: (data, body) => {
      queryClient.setQueryData(["admin-user", id], data);
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success(body.isActive === undefined ? "توضیحات ذخیره شد" : body.isActive ? "حساب کاربر فعال شد" : "حساب کاربر غیرفعال شد");
      setConfirmStatus(null);
      setNotes(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  const user = query.data;
  const notesValue = notes ?? user.notes ?? "";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="بازگشت">
          <Link href="/admin/users">
            <ChevronRight className="size-5" />
          </Link>
        </Button>
        <h1 className="text-xl font-bold">پروفایل کاربر</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card className="h-fit">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center">
              <Avatar name={user.fullName} gender={user.gender} className="size-16 text-2xl" />
              <p className="mt-3 text-lg font-bold">{user.fullName}</p>
              <p className="ltr mt-1 text-sm text-muted-foreground">{toFaDigits(user.phone ?? "")}</p>
            </div>
            <dl className="mt-5 divide-y rounded-xl border text-sm">
              <div className="flex justify-between px-4 py-3">
                <dt className="text-muted-foreground">جنسیت</dt>
                <dd>{user.gender === "FEMALE" ? "زن" : user.gender === "MALE" ? "مرد" : "—"}</dd>
              </div>
              <div className="flex justify-between px-4 py-3">
                <dt className="text-muted-foreground">تاریخ عضویت</dt>
                <dd>{formatDateTime(user.createdAt)}</dd>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <dt className="text-muted-foreground">وضعیت حساب</dt>
                <dd className="flex items-center gap-2">
                  <span className={user.isActive ? "text-success" : "text-destructive"}>{user.isActive ? "فعال" : "غیرفعال"}</span>
                  <Switch checked={user.isActive} onCheckedChange={(v) => setConfirmStatus(v)} aria-label="تغییر وضعیت حساب" />
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>توضیحات کاربر</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={notesValue}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={1000}
                placeholder="در حال حاضر هیچ توضیحی ثبت نشده است."
                aria-label="توضیحات کاربر"
              />
              <p className="text-xs text-muted-foreground">این توضیحات در پروفایل کاربر نمایش داده می‌شود.</p>
              <Button
                size="sm"
                variant="outline-primary"
                disabled={notes === null || notesValue === (user.notes ?? "")}
                loading={update.isPending && confirmStatus === null}
                onClick={() => update.mutate({ notes: notesValue })}
              >
                ذخیره توضیحات
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>رزروهای کاربر</CardTitle>
            </CardHeader>
            <CardContent>
              {user.bookings.length === 0 ? (
                <EmptyState title="رزروی ثبت نشده است" className="py-6" />
              ) : (
                <ul className="divide-y">
                  {user.bookings.map((b) => (
                    <li key={b.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          {WEEKDAY_NAMES[weekdayOf(b.dateKey)]} {formatJalali(b.dateKey)}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatSlot(b.hour)}</p>
                      </div>
                      <BookingStatusBadge status={b.displayStatus} />
                      {b.canModify && (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive-soft"
                          aria-label="لغو رزرو"
                          onClick={() => setCancelTarget({ id: b.id, dateKey: b.dateKey, hour: b.hour, userName: user.fullName })}
                        >
                          <XCircle />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>سوابق پذیرش قوانین</CardTitle>
            </CardHeader>
            <CardContent>
              {user.consents.length === 0 ? (
                <p className="text-sm text-muted-foreground">سابقه‌ای ثبت نشده است.</p>
              ) : (
                <ul className="max-h-64 divide-y overflow-y-auto text-xs">
                  {user.consents.map((c) => (
                    <li key={c.id} className="flex flex-wrap justify-between gap-2 py-2">
                      <span>
                        {LEGAL_DOCUMENT_LABELS[c.document] ?? c.document} — نسخه {toFaDigits(c.version)}
                        <span className="text-muted-foreground"> ({CONSENT_CONTEXT_LABELS[c.context] ?? c.context})</span>
                      </span>
                      <span className="text-muted-foreground">
                        {formatDateTime(c.acceptedAt)}
                        {c.ip ? <span className="ltr"> · {c.ip}</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={confirmStatus !== null} onOpenChange={(o) => !o && !update.isPending && setConfirmStatus(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmStatus ? "فعال‌سازی حساب" : "غیرفعال‌سازی حساب"}</DialogTitle>
            <DialogDescription>
              {confirmStatus
                ? "کاربر دوباره می‌تواند وارد شود و رزرو کند."
                : "کاربر از همه دستگاه‌ها خارج می‌شود و تا فعال‌سازی مجدد نمی‌تواند وارد شود یا رزرو کند. رزروهای فعلی او حذف نمی‌شوند."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant={confirmStatus ? "default" : "destructive"}
              loading={update.isPending}
              onClick={() => confirmStatus !== null && update.mutate({ isActive: confirmStatus })}
            >
              تأیید
            </Button>
            <Button variant="outline" onClick={() => setConfirmStatus(null)} disabled={update.isPending}>
              انصراف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CancelBookingDialog target={cancelTarget} onClose={() => setCancelTarget(null)} />
    </div>
  );
}
