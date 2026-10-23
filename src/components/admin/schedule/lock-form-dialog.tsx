"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Info, Layers } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";
import { JalaliDatePicker } from "@/components/jalali-date-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field, Label } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/states";
import { Switch } from "@/components/ui/switch";
import { apiFetch, ApiError, errorMessage } from "@/lib/api-client";
import { formatHour, formatJalali, formatSlot, PERSIAN_WEEK_ORDER, WEEKDAY_NAMES } from "@/lib/dates";
import { toFaDigits } from "@/lib/digits";
import { LOCK_TYPE_LABELS } from "@/lib/locks";
import { tehranParts } from "@/lib/time";
import type { Lock, LockImpact, LockType, LockWriteResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { lockInputSchema } from "@/lib/validation";

export interface LockDraft {
  type: LockType;
  date: string | null;
  weekday: number | null;
  wholeDay: boolean;
  startHour: number;
  endHour: number;
  reason: string;
  isReasonPublic: boolean;
  isActive: boolean;
}

export type LockDialogMode =
  | { kind: "create"; draft: LockDraft }
  | { kind: "edit"; lock: Lock }
  | { kind: "reactivate"; lock: Lock };

export function newDraft(type: LockType, date?: string | null): LockDraft {
  return {
    type,
    date: type === "WEEKLY" ? null : (date ?? null),
    weekday: type === "WEEKLY" ? 5 : null,
    wholeDay: type !== "TIME_RANGE",
    startHour: 8,
    endHour: 12,
    reason: "",
    isReasonPublic: false,
    isActive: true,
  };
}

function draftFromLock(lock: Lock, overrides: Partial<LockDraft> = {}): LockDraft {
  return {
    type: lock.type,
    date: lock.dateKey,
    weekday: lock.weekday,
    wholeDay: lock.startHour === 0 && lock.endHour === 24,
    startHour: lock.startHour,
    endHour: lock.endHour,
    reason: lock.reason ?? "",
    isReasonPublic: lock.isReasonPublic,
    isActive: lock.isActive,
    ...overrides,
  };
}

function toPayload(d: LockDraft) {
  const common = { reason: d.reason, isReasonPublic: d.isReasonPublic, isActive: d.isActive };
  if (d.type === "FULL_DAY") return { type: d.type, date: d.date ?? "", ...common };
  if (d.type === "TIME_RANGE") return { type: d.type, date: d.date ?? "", startHour: d.startHour, endHour: d.endHour, ...common };
  return {
    type: d.type,
    weekday: d.weekday ?? -1,
    startHour: d.wholeDay ? 0 : d.startHour,
    endHour: d.wholeDay ? 24 : d.endHour,
    ...common,
  };
}

const START_HOURS = Array.from({ length: 24 }, (_, h) => h);
const END_HOURS = Array.from({ length: 24 }, (_, h) => h + 1);

export function LockFormDialog({ mode, onClose }: { mode: LockDialogMode | null; onClose: () => void }) {
  return (
    <Dialog open={!!mode} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">{mode && <LockFormBody key={JSON.stringify(mode)} mode={mode} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function LockFormBody({ mode, onClose }: { mode: LockDialogMode; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = React.useState<LockDraft>(() =>
    mode.kind === "create" ? mode.draft : draftFromLock(mode.lock, mode.kind === "reactivate" ? { isActive: true } : {}),
  );
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [step, setStep] = React.useState<"form" | "review">(mode.kind === "reactivate" ? "review" : "form");
  const [impact, setImpact] = React.useState<LockImpact | null>(null);
  const [conflictMode, setConflictMode] = React.useState<"KEEP_BOOKINGS" | "CANCEL_BOOKINGS">("KEEP_BOOKINGS");
  const [cancelReason, setCancelReason] = React.useState("");
  const todayKey = tehranParts().dateKey;
  const lockId = mode.kind === "create" ? undefined : mode.lock.id;

  const set = (patch: Partial<LockDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setErrors({});
  };

  const preview = useMutation({
    mutationFn: (payload: ReturnType<typeof toPayload>) =>
      apiFetch<LockImpact>("/api/admin/locks/preview", { body: { lock: payload, excludeLockId: lockId } }),
    onSuccess: (data) => {
      setImpact(data);
      setStep("review");
    },
    onError: (e) => {
      if (e instanceof ApiError && e.fields) setErrors(mapFieldErrors(e.fields));
      else toast.error(errorMessage(e));
      if (mode.kind === "reactivate") onClose();
    },
  });

  const save = useMutation({
    mutationFn: () => {
      const body = { lock: toPayload(draft), conflictMode, cancelReason: cancelReason.trim() || undefined };
      if (mode.kind === "create") return apiFetch<LockWriteResult>("/api/admin/locks", { body });
      if (mode.kind === "edit") return apiFetch<LockWriteResult>(`/api/admin/locks/${mode.lock.id}`, { method: "PUT", body });
      return apiFetch<LockWriteResult>(`/api/admin/locks/${mode.lock.id}/reactivate`, { body: { conflictMode, cancelReason: body.cancelReason } });
    },
    onSuccess: (result) => {
      const verb = mode.kind === "create" ? "ثبت شد" : mode.kind === "edit" ? "ویرایش شد" : "دوباره فعال شد";
      const extra =
        result.cancelledCount > 0
          ? ` ${toFaDigits(result.cancelledCount)} رزرو لغو شد.`
          : result.affectedCount > 0
            ? ` ${toFaDigits(result.affectedCount)} رزرو موجود حفظ شد.`
            : "";
      toast.success(`قفل ${verb}.${extra}`);
      void queryClient.invalidateQueries();
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  // Reactivation starts directly at the review step.
  const started = React.useRef(false);
  React.useEffect(() => {
    if (mode.kind === "reactivate" && !started.current) {
      started.current = true;
      preview.mutate(toPayload(draft));
    }
  }, [mode.kind, draft, preview]);

  function review() {
    const payload = toPayload(draft);
    const parsed = lockInputSchema.safeParse(payload);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) fields[String(issue.path[0] ?? "_")] ??= issue.message;
      setErrors(mapFieldErrors(fields));
      return;
    }
    preview.mutate(payload);
  }

  const title =
    mode.kind === "create" ? `تعریف قفل ${LOCK_TYPE_LABELS[draft.type]}` : mode.kind === "edit" ? "ویرایش قفل" : "فعال‌سازی مجدد قفل";

  if (step === "review") {
    if (!impact) return <LoadingState label="در حال بررسی محدوده تأثیر..." />;
    const affected = impact.affectedBookings;
    return (
      <>
        <DialogHeader>
          <DialogTitle>بررسی و تأیید</DialogTitle>
          <DialogDescription>پیش از ثبت، محدوده تأثیر این قفل را بررسی کنید.</DialogDescription>
        </DialogHeader>

        <dl className="divide-y rounded-xl border text-sm">
          <div className="flex justify-between gap-3 px-4 py-3">
            <dt className="text-muted-foreground">نوع قفل</dt>
            <dd className="font-medium">{LOCK_TYPE_LABELS[draft.type]}</dd>
          </div>
          <div className="flex justify-between gap-3 px-4 py-3">
            <dt className="text-muted-foreground">محدوده</dt>
            <dd className="font-semibold">{impact.scope}</dd>
          </div>
          {draft.reason.trim() && (
            <div className="flex justify-between gap-3 px-4 py-3">
              <dt className="text-muted-foreground">دلیل</dt>
              <dd>
                {draft.reason.trim()} {draft.isReasonPublic ? "(قابل مشاهده برای کاربران)" : "(داخلی)"}
              </dd>
            </div>
          )}
          <div className="flex justify-between gap-3 px-4 py-3">
            <dt className="text-muted-foreground">وضعیت</dt>
            <dd>{draft.isActive ? "فعال — رزرو جدید در این محدوده ممنوع می‌شود" : "غیرفعال (اعمال نمی‌شود)"}</dd>
          </div>
        </dl>

        {impact.overlappingLocks.length > 0 && (
          <div className="flex gap-2 rounded-xl border border-primary/20 bg-primary-soft px-4 py-3 text-xs leading-6 text-primary">
            <Layers className="mt-0.5 size-4 shrink-0" />
            <div>
              این محدوده با {toFaDigits(impact.overlappingLocks.length)} قفل فعال دیگر هم‌پوشانی دارد:
              <ul className="list-inside list-disc">
                {impact.overlappingLocks.slice(0, 5).map((l) => (
                  <li key={l.id}>{l.scope}</li>
                ))}
              </ul>
              بازکردن هر قفل، قفل‌های دیگر را باز نمی‌کند.
            </div>
          </div>
        )}

        {affected.length > 0 ? (
          <div className="space-y-3 rounded-xl border border-warning/40 bg-warning-soft p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-warning">
              <AlertTriangle className="size-4" />
              {toFaDigits(affected.length)} رزرو فعال از {toFaDigits(impact.affectedUsers)} کاربر در این محدوده وجود دارد
            </p>
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-card p-2 text-xs">
              {affected.map((b) => (
                <li key={b.id} className="flex justify-between gap-2 px-1 py-1">
                  <span>
                    {formatJalali(b.dateKey)} — {formatSlot(b.hour)}
                  </span>
                  <span className="text-muted-foreground">{b.user.fullName}</span>
                </li>
              ))}
            </ul>
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium">با این رزروها چه شود؟</legend>
              <ConflictOption
                checked={conflictMode === "KEEP_BOOKINGS"}
                onChange={() => setConflictMode("KEEP_BOOKINGS")}
                title="ثبت قفل و حفظ رزروهای موجود (پیش‌فرض)"
                description="رزروهای فعلی پابرجا می‌مانند و با هشدار «رزرو موجود در محدوده قفل‌شده» مشخص می‌شوند؛ فقط رزرو جدید ممنوع است."
              />
              <ConflictOption
                checked={conflictMode === "CANCEL_BOOKINGS"}
                onChange={() => setConflictMode("CANCEL_BOOKINGS")}
                title="لغو رزروهای متأثر و سپس ثبت قفل"
                description="همه رزروهای بالا هم‌زمان با ثبت قفل لغو می‌شوند (سوابق حفظ می‌شود)."
              />
              {conflictMode === "CANCEL_BOOKINGS" && (
                <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} maxLength={300} placeholder="دلیل لغو برای کاربران (اختیاری)" aria-label="دلیل لغو" />
              )}
            </fieldset>
            <p className="text-xs text-muted-foreground">
              برای جابه‌جایی یا لغو تک‌به‌تک رزروها، انصراف دهید و از{" "}
              <Link href={draft.date ? `/admin/bookings?status=PENDING&from=${draft.date}&to=${draft.date}` : "/admin/bookings?status=PENDING"} className="font-semibold text-primary underline" onClick={onClose}>
                بخش رزروها
              </Link>{" "}
              اقدام کنید.
            </p>
          </div>
        ) : (
          <p className="flex items-center gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
            <Info className="size-4" />
            هیچ رزرو فعالی در این محدوده وجود ندارد.
          </p>
        )}

        <DialogFooter>
          <Button onClick={() => save.mutate()} loading={save.isPending} variant={conflictMode === "CANCEL_BOOKINGS" ? "destructive" : "default"}>
            {mode.kind === "reactivate" ? "تأیید و فعال‌سازی" : "تأیید و ثبت قفل"}
          </Button>
          {mode.kind !== "reactivate" && (
            <Button variant="outline" onClick={() => setStep("form")} disabled={save.isPending}>
              <ArrowRight />
              بازگشت به ویرایش
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            انصراف
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>قفل تا زمانی که آن را باز نکنید فعال می‌ماند.</DialogDescription>
      </DialogHeader>

      <form
        noValidate
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          review();
        }}
      >
        <div className="space-y-2">
          <Label>نوع قفل</Label>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="نوع قفل">
            {(["FULL_DAY", "TIME_RANGE", "WEEKLY"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={draft.type === t}
                onClick={() => set({ type: t, ...(t === "WEEKLY" ? { weekday: draft.weekday ?? 5 } : {}), wholeDay: t !== "TIME_RANGE" })}
                className={cn(
                  "h-10 rounded-lg border text-sm font-medium cursor-pointer",
                  draft.type === t ? "border-primary bg-primary-soft text-primary" : "hover:bg-accent",
                )}
              >
                {LOCK_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {draft.type === "WEEKLY" ? (
          <Field label="روز هفته" error={errors.weekday}>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7" role="radiogroup" aria-label="روز هفته">
              {PERSIAN_WEEK_ORDER.map((wd) => (
                <button
                  key={wd}
                  type="button"
                  role="radio"
                  aria-checked={draft.weekday === wd}
                  onClick={() => set({ weekday: wd })}
                  className={cn(
                    "h-10 rounded-lg border text-xs font-medium cursor-pointer",
                    draft.weekday === wd ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
                  )}
                >
                  {WEEKDAY_NAMES[wd]}
                </button>
              ))}
            </div>
          </Field>
        ) : (
          <Field label="تاریخ" htmlFor="lock-date" error={errors.date}>
            <JalaliDatePicker id="lock-date" value={draft.date} onChange={(date) => set({ date })} invalid={!!errors.date} minDate={mode.kind === "create" ? todayKey : undefined} />
          </Field>
        )}

        {draft.type === "WEEKLY" && (
          <label className="flex cursor-pointer items-center justify-between rounded-lg border px-3.5 py-3 text-sm">
            کل روز (۰۰:۰۰ تا ۲۴:۰۰)
            <Switch checked={draft.wholeDay} onCheckedChange={(wholeDay) => set({ wholeDay })} />
          </label>
        )}

        {(draft.type === "TIME_RANGE" || (draft.type === "WEEKLY" && !draft.wholeDay)) && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="از ساعت" htmlFor="lock-start" error={errors.startHour}>
              <NativeSelect id="lock-start" value={draft.startHour} onChange={(e) => set({ startHour: Number(e.target.value) })}>
                {START_HOURS.map((h) => (
                  <option key={h} value={h}>
                    {formatHour(h)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="تا ساعت" htmlFor="lock-end" error={errors.endHour}>
              <NativeSelect id="lock-end" value={draft.endHour} onChange={(e) => set({ endHour: Number(e.target.value) })} aria-invalid={!!errors.endHour}>
                {END_HOURS.map((h) => (
                  <option key={h} value={h}>
                    {formatHour(h)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <p className="col-span-2 -mt-2 text-xs text-muted-foreground">ساعت پایان جزو بازه بسته‌شده نیست (مثلاً ۰۸ تا ۱۲ یعنی آخرین ساعت بسته ۱۱ تا ۱۲).</p>
          </div>
        )}

        <Field label="دلیل یا توضیح" htmlFor="lock-reason" error={errors.reason}>
          <Textarea id="lock-reason" value={draft.reason} maxLength={300} onChange={(e) => set({ reason: e.target.value })} placeholder="مثلاً: تعطیل رسمی، جلسه داخلی" className="min-h-20" />
        </Field>

        <div className="space-y-2">
          <label className="flex cursor-pointer items-center justify-between rounded-lg border px-3.5 py-3 text-sm">
            <span>
              نمایش دلیل به کاربران
              <span className="block text-xs text-muted-foreground">در غیر این صورت فقط «غیرفعال» نمایش داده می‌شود</span>
            </span>
            <Switch checked={draft.isReasonPublic} onCheckedChange={(isReasonPublic) => set({ isReasonPublic })} />
          </label>
          <label className="flex cursor-pointer items-center justify-between rounded-lg border px-3.5 py-3 text-sm">
            <span>
              قفل فعال باشد
              <span className="block text-xs text-muted-foreground">قفل غیرفعال ذخیره می‌شود ولی اعمال نمی‌شود</span>
            </span>
            <Switch checked={draft.isActive} onCheckedChange={(isActive) => set({ isActive })} />
          </label>
        </div>

        <DialogFooter>
          <Button type="submit" loading={preview.isPending}>
            بررسی و ادامه
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            انصراف
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

function mapFieldErrors(fields: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, message] of Object.entries(fields)) out[key.replace(/^lock\./, "")] = message;
  return out;
}

function ConflictOption({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  description: string;
}) {
  return (
    <label className={cn("flex cursor-pointer gap-3 rounded-lg border bg-card p-3 text-sm", checked && "border-primary ring-1 ring-primary/30")}>
      <input type="radio" checked={checked} onChange={onChange} className="mt-1 accent-[var(--primary)]" />
      <span>
        <span className="font-medium">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}
