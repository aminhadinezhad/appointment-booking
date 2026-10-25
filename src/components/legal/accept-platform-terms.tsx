"use client";

import { ExternalLink, LogOut, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { useAdminLogout } from "@/components/admin/admin-shell";
import { Button } from "@/components/ui/button";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { toFaDigits } from "@/lib/digits";

/** First-visit gate of the admin panel: the software terms must be accepted to continue. */
export function AcceptPlatformTerms({
  adminName,
  version,
  effectiveDate,
  title,
  summary,
}: {
  adminName: string;
  version: number;
  effectiveDate: string;
  title: string;
  summary: string[];
}) {
  const router = useRouter();
  const logout = useAdminLogout();
  const [checked, setChecked] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  async function accept() {
    setSaving(true);
    try {
      await apiFetch("/api/admin/terms", { body: { version, accept: true } });
      router.replace("/admin");
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 py-6 sm:justify-center">
      <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-8">
        <div className="mb-6 flex items-start gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
            <ShieldCheck className="size-6" />
          </span>
          <div>
            <h1 className="text-xl font-extrabold">راه‌اندازی پنل مدیریت</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {adminName} عزیز، پیش از شروع کار، شرایط استفاده از نرم‌افزار را مطالعه و تأیید کنید.
            </p>
          </div>
        </div>

        <section className="rounded-xl border bg-muted/40 p-4">
          <h2 className="text-sm font-bold">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            نسخه {toFaDigits(version)} · تاریخ اجرا {toFaDigits(effectiveDate)}
          </p>
          <p className="mt-3 text-xs font-medium text-muted-foreground">خلاصه مهم‌ترین موارد:</p>
          <ul className="mt-2 list-disc space-y-1.5 pr-5 text-sm leading-7 marker:text-primary">
            {summary.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <a
            href="/platform-terms"
            target="_blank"
            rel="noopener"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            مطالعه متن کامل شرایط استفاده
            <ExternalLink className="size-3.5" />
          </a>
        </section>

        <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm leading-7 has-[:checked]:border-primary has-[:checked]:bg-primary-soft/40">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-1.5 size-4 shrink-0 accent-[var(--primary)]"
            aria-describedby="terms-note"
          />
          <span>
            شرایط استفاده را خوانده‌ام و می‌پذیرم و تأیید می‌کنم کسب‌وکارم مجوزهای قانونی لازم را دارد.
          </span>
        </label>
        <p id="terms-note" className="mt-2 text-xs text-muted-foreground">
          پذیرش شما همراه با تاریخ و ساعت، نشانی IP، مرورگر و شماره نسخه متن ثبت می‌شود.
        </p>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" onClick={() => logout.mutate()} loading={logout.isPending}>
            <LogOut />
            خروج
          </Button>
          <Button onClick={accept} disabled={!checked} loading={saving} className="sm:min-w-40">
            پذیرش و ادامه
          </Button>
        </div>
      </div>
    </main>
  );
}
