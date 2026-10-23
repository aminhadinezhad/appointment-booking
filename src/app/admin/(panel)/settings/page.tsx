"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { apiFetch, ApiError, errorMessage } from "@/lib/api-client";
import { formatHour } from "@/lib/dates";
import { toEnDigits, toFaDigits } from "@/lib/digits";
import { HOURS } from "@/lib/slots";
import type { Settings } from "@/lib/types";
import { cn } from "@/lib/utils";
import { changePasswordSchema } from "@/lib/validation";

export default function SettingsPage() {
  const query = useQuery({ queryKey: ["admin-settings"], queryFn: () => apiFetch<Settings>("/api/admin/settings") });
  return (
    <div className="max-w-3xl space-y-4">
      <AdminPageHeader title="تنظیمات" />
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
      ) : (
        <BookingSettingsCard key={JSON.stringify(query.data)} initial={query.data} />
      )}
      <PasswordCard />
    </div>
  );
}

function BookingSettingsCard({ initial }: { initial: Settings }) {
  const queryClient = useQueryClient();
  const [hours, setHours] = React.useState<number[]>(initial.bookableHours);
  const [days, setDays] = React.useState(String(initial.maxAdvanceDays));
  const [error, setError] = React.useState<string | null>(null);
  const set = new Set(hours);
  const toggle = (h: number) => setHours((cur) => (cur.includes(h) ? cur.filter((x) => x !== h) : [...cur, h].sort((a, b) => a - b)));

  const save = useMutation({
    mutationFn: () => apiFetch<Settings>("/api/admin/settings", { method: "PUT", body: { bookableHours: hours, maxAdvanceDays: toEnDigits(days) } }),
    onSuccess: (data) => {
      queryClient.setQueryData(["admin-settings"], data);
      void queryClient.invalidateQueries({ queryKey: ["admin-day"] });
      toast.success("تنظیمات ذخیره شد");
    },
    onError: (e) => setError(e instanceof ApiError && e.fields ? Object.values(e.fields)[0]! : errorMessage(e)),
  });

  const dirty = hours.join() !== initial.bookableHours.join() || toEnDigits(days) !== String(initial.maxAdvanceDays);

  return (
    <Card>
      <CardHeader>
        <CardTitle>ساعت‌های عمومی قابل رزرو</CardTitle>
        <CardDescription>ساعت‌هایی که در حالت عادی برای رزرو باز هستند. قفل‌ها روی همین ساعت‌ها اعمال می‌شوند.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex gap-2 text-xs">
          <Button size="sm" variant="ghost" onClick={() => setHours(HOURS.filter((h) => h >= 8 && h < 20))}>
            ۰۸ تا ۲۰
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setHours([...HOURS])}>
            همه
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setHours([])}>
            هیچ‌کدام
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" role="group" aria-label="ساعت‌های قابل رزرو">
          {HOURS.map((h) => (
            <button
              key={h}
              type="button"
              aria-pressed={set.has(h)}
              onClick={() => toggle(h)}
              className={cn(
                "ltr h-10 rounded-lg border text-xs font-medium tabular-nums cursor-pointer transition-colors",
                set.has(h) ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-accent",
              )}
            >
              {formatHour(h)}-{formatHour(h + 1)}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{toFaDigits(hours.length)} ساعت در روز قابل رزرو است.</p>

        <Field label="حداکثر چند روز آینده قابل رزرو باشد؟" htmlFor="max-days" error={error ?? undefined}>
          <Input
            id="max-days"
            inputMode="numeric"
            value={toFaDigits(days)}
            onChange={(e) => {
              setDays(toEnDigits(e.target.value).replace(/\D/g, "").slice(0, 3));
              setError(null);
            }}
            className="max-w-32"
            aria-invalid={!!error}
          />
        </Field>

        <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!dirty}>
          ذخیره تنظیمات
        </Button>
      </CardContent>
    </Card>
  );
}

type PasswordInput = z.input<typeof changePasswordSchema>;

function PasswordCard() {
  const form = useForm<PasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: PasswordInput) {
    try {
      await apiFetch("/api/admin/password", { body: values });
      toast.success("رمز عبور تغییر کرد. سایر نشست‌های شما خارج شدند.");
      form.reset();
    } catch (e) {
      if (e instanceof ApiError && e.code === "WRONG_PASSWORD") form.setError("currentPassword", { message: e.message });
      else toast.error(errorMessage(e));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>تغییر رمز عبور مدیر</CardTitle>
      </CardHeader>
      <CardContent>
        <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-3">
          <Field label="رمز فعلی" htmlFor="pw-current" error={errors.currentPassword?.message}>
            <Input id="pw-current" type="password" dir="ltr" autoComplete="current-password" aria-invalid={!!errors.currentPassword} {...form.register("currentPassword")} />
          </Field>
          <Field label="رمز جدید" htmlFor="pw-new" error={errors.newPassword?.message}>
            <Input id="pw-new" type="password" dir="ltr" autoComplete="new-password" aria-invalid={!!errors.newPassword} {...form.register("newPassword")} />
          </Field>
          <Field label="تکرار رمز جدید" htmlFor="pw-confirm" error={errors.confirmPassword?.message}>
            <Input id="pw-confirm" type="password" dir="ltr" autoComplete="new-password" aria-invalid={!!errors.confirmPassword} {...form.register("confirmPassword")} />
          </Field>
          <div className="sm:col-span-3">
            <Button type="submit" variant="outline-primary" loading={isSubmitting}>
              تغییر رمز عبور
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
