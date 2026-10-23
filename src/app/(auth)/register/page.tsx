"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarDays, Phone, User } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { AuthCard } from "@/components/auth/auth-card";
import { GenderPicker } from "@/components/auth/gender-picker";
import { OtpStep, type OtpRequestResponse } from "@/components/auth/otp-step";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { apiFetch, ApiError, errorMessage } from "@/lib/api-client";
import { formatDateTime } from "@/lib/time";
import { registerRequestSchema } from "@/lib/validation";

type FormInput = z.input<typeof registerRequestSchema>;
type FormValues = z.output<typeof registerRequestSchema>;

export default function RegisterPage() {
  const [step, setStep] = React.useState<{ values: FormValues; otp: OtpRequestResponse } | null>(null);
  const [formError, setFormError] = React.useState<React.ReactNode>(null);
  // Computed after mount so server and client render the same markup.
  const [now, setNow] = React.useState("");
  React.useEffect(() => setNow(formatDateTime(new Date())), []);

  const form = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(registerRequestSchema),
    defaultValues: { fullName: "", phone: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const request = (values: FormValues) =>
    apiFetch<OtpRequestResponse>("/api/auth/otp/request", { body: { purpose: "REGISTER", ...values } });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      setStep({ values, otp: await request(values) });
    } catch (e) {
      if (e instanceof ApiError && e.code === "PHONE_ALREADY_REGISTERED") {
        setFormError(
          <>
            {e.message}{" "}
            <Link href="/login" className="font-semibold underline">
              ورود
            </Link>
          </>,
        );
      } else if (e instanceof ApiError && e.fields) {
        for (const [key, message] of Object.entries(e.fields)) form.setError(key as keyof FormInput, { message });
      } else {
        setFormError(errorMessage(e));
      }
    }
  }

  if (step) {
    return (
      <AuthCard title="تأیید شماره موبایل" backHref="/register">
        <OtpStep
          phone={step.values.phone}
          purpose="REGISTER"
          initial={step.otp}
          resend={() => request(step.values)}
          onEditPhone={() => setStep(null)}
        />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="عضویت"
      subtitle="لطفاً اطلاعات خود را وارد کنید"
      footer={
        <>
          قبلاً ثبت‌نام کرده‌اید؟{" "}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            ورود
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <Field label="نام و نام خانوادگی" htmlFor="fullName" error={errors.fullName?.message}>
          <div className="relative">
            <User className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="fullName"
              autoComplete="name"
              placeholder="مثلاً علی محمدی"
              className="pr-9"
              aria-invalid={!!errors.fullName}
              {...form.register("fullName")}
            />
          </div>
        </Field>

        <Field label="شماره موبایل" htmlFor="phone" error={errors.phone?.message}>
          <div className="relative">
            <Phone className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="phone"
              inputMode="tel"
              autoComplete="tel"
              placeholder="۰۹۱۲۱۲۳۴۵۶۷"
              className="pr-9 text-right"
              aria-invalid={!!errors.phone}
              {...form.register("phone")}
            />
          </div>
        </Field>

        <Field label="جنسیت" error={errors.gender?.message}>
          <Controller
            control={form.control}
            name="gender"
            render={({ field }) => <GenderPicker value={field.value} onChange={field.onChange} invalid={!!errors.gender} />}
          />
        </Field>

        <Field label="تاریخ ثبت‌نام" htmlFor="registeredAt" hint="به‌صورت خودکار ثبت می‌شود">
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="registeredAt" value={now} readOnly disabled className="pr-9" />
          </div>
        </Field>

        {formError && (
          <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">
            {formError}
          </p>
        )}

        <Button type="submit" className="w-full" loading={isSubmitting}>
          ثبت‌نام
        </Button>
      </form>
    </AuthCard>
  );
}
