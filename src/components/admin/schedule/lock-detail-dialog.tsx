"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Pencil, RotateCcw, Unlock } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatJalali, formatSlot } from "@/lib/dates";
import { toFaDigits } from "@/lib/digits";
import { LOCK_TYPE_LABELS } from "@/lib/locks";
import { formatDateTime } from "@/lib/time";
import type { Lock, LockDetail } from "@/lib/types";

const ACTION_LABELS: Record<string, string> = {
  LOCK_CREATED: "ایجاد قفل",
  LOCK_UPDATED: "ویرایش قفل",
  LOCK_UNLOCKED: "بازکردن قفل",
  LOCK_REACTIVATED: "فعال‌سازی مجدد",
};

export function LockStatusBadge({ lock }: { lock: Pick<Lock, "isActive"> }) {
  return <Badge variant={lock.isActive ? "locked" : "muted"}>{lock.isActive ? "فعال" : "باز شده"}</Badge>;
}

export function LockDetailDialog({
  lockId,
  onClose,
  onEdit,
  onUnlock,
  onReactivate,
}: {
  lockId: string | null;
  onClose: () => void;
  onEdit: (lock: Lock) => void;
  onUnlock: (lock: Lock) => void;
  onReactivate: (lock: Lock) => void;
}) {
  const query = useQuery({
    queryKey: ["admin-lock", lockId],
    queryFn: () => apiFetch<LockDetail>(`/api/admin/locks/${lockId}`),
    enabled: !!lockId,
  });
  const lock = query.data;

  return (
    <Dialog open={!!lockId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>جزئیات قفل</DialogTitle>
          {lock && <DialogDescription>{lock.scope}</DialogDescription>}
        </DialogHeader>
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
        ) : lock ? (
          <div className="space-y-4">
            <dl className="divide-y rounded-xl border text-sm">
              <Row label="نوع" value={LOCK_TYPE_LABELS[lock.type]} />
              <Row label="وضعیت" value={<LockStatusBadge lock={lock} />} />
              <Row label="دلیل" value={lock.reason ? `${lock.reason}${lock.isReasonPublic ? " (عمومی)" : " (داخلی)"}` : "—"} />
              <Row label="ایجاد" value={`${formatDateTime(lock.createdAt)} — ${lock.createdBy?.fullName ?? "—"}`} />
              <Row label="آخرین تغییر" value={`${formatDateTime(lock.updatedAt)}${lock.updatedBy ? ` — ${lock.updatedBy.fullName}` : ""}`} />
              {lock.unlockedAt && <Row label="بازگشایی" value={`${formatDateTime(lock.unlockedAt)} — ${lock.unlockedBy?.fullName ?? "—"}`} />}
              {lock.unlockReason && <Row label="علت بازگشایی" value={lock.unlockReason} />}
            </dl>

            {lock.keptBookings.length > 0 && (
              <div className="rounded-xl border border-warning/40 bg-warning-soft p-3">
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-warning">
                  <AlertTriangle className="size-4" />
                  {toFaDigits(lock.keptBookings.length)} رزرو موجود در محدوده قفل‌شده
                </p>
                <ul className="max-h-36 space-y-1 overflow-y-auto rounded-lg bg-card p-2 text-xs">
                  {lock.keptBookings.map((b) => (
                    <li key={b.id} className="flex justify-between gap-2 px-1 py-1">
                      <span>
                        {formatJalali(b.dateKey)} — {formatSlot(b.hour)}
                      </span>
                      <span className="text-muted-foreground">{b.user.fullName}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <p className="mb-2 text-sm font-semibold">تاریخچه</p>
              <ol className="space-y-2 border-r-2 border-border pr-4">
                {lock.history.map((h) => (
                  <li key={h.id} className="relative text-xs">
                    <span className="absolute -right-[21px] top-1 size-2.5 rounded-full bg-primary" aria-hidden />
                    <p className="font-medium">{ACTION_LABELS[h.action] ?? h.action}</p>
                    <p className="text-muted-foreground">
                      {formatDateTime(h.createdAt)} — {h.actor?.fullName ?? "—"}
                      {historyNote(h.details)}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        ) : null}
        {lock && (
          <DialogFooter>
            {lock.isActive ? (
              <Button variant="outline-primary" onClick={() => onUnlock(lock)}>
                <Unlock />
                بازکردن قفل
              </Button>
            ) : (
              <Button variant="outline-primary" onClick={() => onReactivate(lock)}>
                <RotateCcw />
                فعال‌سازی مجدد
              </Button>
            )}
            <Button variant="outline" onClick={() => onEdit(lock)}>
              <Pencil />
              ویرایش
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function historyNote(details: unknown): string {
  if (!details || typeof details !== "object") return "";
  const d = details as { reason?: string; affectedCount?: number; cancelledCount?: number };
  const parts: string[] = [];
  if (d.reason) parts.push(`علت: ${d.reason}`);
  if (d.cancelledCount) parts.push(`${toFaDigits(d.cancelledCount)} رزرو لغو شد`);
  else if (d.affectedCount) parts.push(`${toFaDigits(d.affectedCount)} رزرو حفظ شد`);
  return parts.length ? ` · ${parts.join(" · ")}` : "";
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 px-4 py-2.5">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-left">{value}</dd>
    </div>
  );
}

export function UnlockDialog({ lock, onClose }: { lock: Lock | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    setReason("");
    setError(null);
  }, [lock]);

  const mutation = useMutation({
    mutationFn: () => apiFetch(`/api/admin/locks/${lock!.id}/unlock`, { body: { reason: reason.trim() } }),
    onSuccess: () => {
      toast.success("قفل باز شد");
      void queryClient.invalidateQueries();
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  return (
    <Dialog open={!!lock} onOpenChange={(o) => !o && !mutation.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>بازکردن قفل</DialogTitle>
          {lock && (
            <DialogDescription>
              {lock.scope} دوباره قابل رزرو می‌شود، مگر اینکه قفل فعال دیگری آن را پوشش دهد. سوابق قفل حفظ می‌شود.
            </DialogDescription>
          )}
        </DialogHeader>
        <Field label="علت بازگشایی" htmlFor="unlock-reason" error={error ?? undefined}>
          <Textarea
            id="unlock-reason"
            value={reason}
            maxLength={300}
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
            placeholder="مثلاً: جلسه لغو شد"
            aria-invalid={!!error}
          />
        </Field>
        <DialogFooter>
          <Button
            onClick={() => (reason.trim().length < 2 ? setError("دلیل بازکردن قفل را بنویسید") : mutation.mutate())}
            loading={mutation.isPending}
          >
            بازکردن قفل
          </Button>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            انصراف
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
