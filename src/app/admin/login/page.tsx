"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Lock, ShieldCheck, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { adminLoginSchema } from "@/lib/validation";

type FormValues = z.infer<typeof adminLoginSchema>;

export default function AdminLoginPage() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const form = useForm<FormValues>({ resolver: zodResolver(adminLoginSchema), defaultValues: { username: "", password: "" } });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: FormValues) {
    setError(null);
    try {
      await apiFetch("/api/auth/admin/login", { body: values });
      router.replace("/admin");
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <AuthCard
      legalVariant="admin"
      title="ورود مدیر"
      subtitle="لطفاً اطلاعات مدیر را وارد کنید"
      icon={
        <div className="grid size-20 place-items-center rounded-full bg-primary-soft text-primary">
          <ShieldCheck className="size-10" />
        </div>
      }
    >
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <Field label="نام کاربری" htmlFor="username" error={errors.username?.message}>
          <div className="relative">
            <UserRound className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="username" autoComplete="username" dir="ltr" className="pr-9 text-right" aria-invalid={!!errors.username} {...form.register("username")} />
          </div>
        </Field>
        <Field label="رمز عبور" htmlFor="password" error={errors.password?.message}>
          <div className="relative">
            <Lock className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              dir="ltr"
              className="pr-9 text-right"
              aria-invalid={!!errors.password}
              {...form.register("password")}
            />
          </div>
        </Field>
        {error && (
          <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" loading={isSubmitting}>
          ورود
        </Button>
      </form>
    </AuthCard>
  );
}
