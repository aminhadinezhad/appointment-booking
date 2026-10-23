"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Phone, User } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { AuthCard } from "@/components/auth/auth-card";
import { OtpStep, type OtpRequestResponse } from "@/components/auth/otp-step";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { apiFetch, ApiError, errorMessage } from "@/lib/api-client";
import { loginRequestSchema } from "@/lib/validation";

type FormInput = z.input<typeof loginRequestSchema>;
type FormValues = z.output<typeof loginRequestSchema>;

export default function LoginPage() {
  const [step, setStep] = React.useState<{ phone: string; otp: OtpRequestResponse } | null>(null);
  const [formError, setFormError] = React.useState<React.ReactNode>(null);
  const form = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: { phone: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const request = (phone: string) => apiFetch<OtpRequestResponse>("/api/auth/otp/request", { body: { purpose: "LOGIN", phone } });

  async function onSubmit({ phone }: FormValues) {
    setFormError(null);
    try {
      setStep({ phone, otp: await request(phone) });
    } catch (e) {
      if (e instanceof ApiError && e.code === "PHONE_NOT_REGISTERED") {
        setFormError(
          <>
            {e.message}{" "}
            <Link href="/register" className="font-semibold underline">
              ثبت‌نام
            </Link>
          </>,
        );
      } else {
        setFormError(errorMessage(e));
      }
    }
  }

  if (step) {
    return (
      <AuthCard title="ورود به حساب کاربری" backHref="/login">
        <OtpStep phone={step.phone} purpose="LOGIN" initial={step.otp} resend={() => request(step.phone)} onEditPhone={() => setStep(null)} />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="ورود به حساب کاربری"
      subtitle="شماره موبایل خود را وارد کنید"
      icon={
        <div className="grid size-20 place-items-center rounded-full bg-primary-soft text-primary">
          <User className="size-9" />
        </div>
      }
      footer={
        <>
          حساب کاربری ندارید؟{" "}
          <Link href="/register" className="font-semibold text-primary hover:underline">
            ثبت‌نام
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <Field label="شماره موبایل" htmlFor="phone" error={errors.phone?.message}>
          <div className="relative">
            <Phone className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="phone"
              inputMode="tel"
              autoComplete="tel"
              autoFocus
              placeholder="۰۹۱۲۱۲۳۴۵۶۷"
              className="pr-9 text-right"
              aria-invalid={!!errors.phone}
              {...form.register("phone")}
            />
          </div>
        </Field>
        {formError && (
          <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">
            {formError}
          </p>
        )}
        <Button type="submit" className="w-full" loading={isSubmitting}>
          دریافت کد ورود
        </Button>
      </form>
    </AuthCard>
  );
}
