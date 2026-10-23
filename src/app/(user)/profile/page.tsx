"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Pencil, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { GenderPicker } from "@/components/auth/gender-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { PageTitle } from "@/components/user/user-shell";
import { apiFetch, ApiError, errorMessage } from "@/lib/api-client";
import { toFaDigits } from "@/lib/digits";
import { formatDateTime } from "@/lib/time";
import type { Me } from "@/lib/types";
import { profileUpdateSchema } from "@/lib/validation";

type FormInput = z.input<typeof profileUpdateSchema>;
type FormValues = z.output<typeof profileUpdateSchema>;

export default function ProfilePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState(false);
  const me = useQuery({ queryKey: ["me"], queryFn: () => apiFetch<Me>("/api/me") });

  const logout = useMutation({
    mutationFn: () => apiFetch("/api/auth/logout", { method: "POST", body: {} }),
    onSuccess: () => {
      queryClient.clear();
      router.replace("/");
      router.refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (me.isPending) return <LoadingState />;
  if (me.isError) return <ErrorState message={errorMessage(me.error)} onRetry={() => me.refetch()} />;
  const user = me.data;

  return (
    <div className="mx-auto max-w-lg">
      <PageTitle title="پروفایل کاربری" />
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center">
            <div className="grid size-20 place-items-center rounded-full bg-primary-soft text-primary">
              <UserRound className="size-10" />
            </div>
            <p className="mt-3 text-lg font-bold">{user.fullName}</p>
            <p className="ltr mt-1 text-sm tracking-wide text-muted-foreground">{toFaDigits(user.phone ?? "")}</p>
          </div>
          <dl className="mt-6 divide-y rounded-xl border text-sm">
            <div className="flex justify-between px-4 py-3">
              <dt className="text-muted-foreground">جنسیت</dt>
              <dd className="font-medium">{user.gender === "FEMALE" ? "زن" : user.gender === "MALE" ? "مرد" : "—"}</dd>
            </div>
            <div className="flex justify-between px-4 py-3">
              <dt className="text-muted-foreground">تاریخ عضویت</dt>
              <dd className="font-medium">{formatDateTime(user.createdAt)}</dd>
            </div>
          </dl>
          <div className="mt-4 rounded-xl border p-4">
            <p className="text-sm font-semibold">توضیحات کاربر</p>
            <p className="mt-2 whitespace-pre-line text-sm leading-7 text-muted-foreground">
              {user.notes || "در حال حاضر هیچ توضیحی ثبت نشده است."}
            </p>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Button variant="outline-primary" onClick={() => setEditing(true)}>
              <Pencil />
              ویرایش اطلاعات
            </Button>
            <Button variant="outline" onClick={() => logout.mutate()} loading={logout.isPending} className="text-destructive hover:bg-destructive-soft">
              <LogOut />
              خروج از حساب
            </Button>
          </div>
        </CardContent>
      </Card>
      {editing && <EditProfileDialog user={user} onClose={() => setEditing(false)} />}
    </div>
  );
}

function EditProfileDialog({ user, onClose }: { user: Me; onClose: () => void }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const form = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: { fullName: user.fullName, gender: user.gender ?? undefined },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: FormValues) {
    try {
      await apiFetch("/api/me", { method: "PATCH", body: values });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      router.refresh();
      toast.success("اطلاعات شما به‌روزرسانی شد");
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.fields) {
        for (const [key, message] of Object.entries(e.fields)) form.setError(key as keyof FormInput, { message });
      } else toast.error(errorMessage(e));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !isSubmitting && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ویرایش اطلاعات</DialogTitle>
          <DialogDescription>نام و جنسیت خود را به‌روزرسانی کنید.</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <Field label="نام و نام خانوادگی" htmlFor="edit-name" error={errors.fullName?.message}>
            <Input id="edit-name" aria-invalid={!!errors.fullName} {...form.register("fullName")} />
          </Field>
          <Field label="جنسیت" error={errors.gender?.message}>
            <Controller
              control={form.control}
              name="gender"
              render={({ field }) => <GenderPicker value={field.value} onChange={field.onChange} name="edit-gender" />}
            />
          </Field>
          <p className="text-xs text-muted-foreground">برای تغییر شماره موبایل با پشتیبانی تماس بگیرید.</p>
          <DialogFooter>
            <Button type="submit" loading={isSubmitting}>
              ذخیره تغییرات
            </Button>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              انصراف
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
