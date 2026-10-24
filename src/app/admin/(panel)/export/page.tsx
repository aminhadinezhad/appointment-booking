"use client";

import { Download, FileSpreadsheet } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { JalaliDatePicker } from "@/components/jalali-date-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toQuery } from "@/lib/api-client";
import { jalaliMonthDays, toJalali } from "@/lib/dates";
import { tehranParts } from "@/lib/time";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { key: "users", label: "کاربران", description: "نام، موبایل، جنسیت، وضعیت و تاریخ ثبت‌نام" },
  { key: "bookings", label: "رزروها", description: "تاریخ و ساعت جلسه، کاربر، وضعیت، لغو و هشدار قفل" },
  { key: "locks", label: "قفل‌ها و تعطیلی‌ها", description: "محدوده، دلیل، وضعیت، ایجادکننده و بازگشایی" },
  { key: "consents", label: "سوابق پذیرش قوانین", description: "چه کسی، چه زمانی و از چه IP کدام نسخه از قوانین را پذیرفته است" },
] as const;

type Section = (typeof SECTIONS)[number]["key"];

export default function ExportPage() {
  const [sections, setSections] = React.useState<Section[]>(["users", "bookings", "locks", "consents"]);
  const [from, setFrom] = React.useState<string | null>(null);
  const [to, setTo] = React.useState<string | null>(null);
  const [downloading, setDownloading] = React.useState(false);

  const toggle = (key: Section) => setSections((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));

  function thisMonth() {
    const { jy, jm } = toJalali(tehranParts().dateKey);
    const days = jalaliMonthDays(jy, jm);
    setFrom(days[0]!);
    setTo(days.at(-1)!);
  }

  async function download() {
    if (sections.length === 0) return toast.error("حداقل یک بخش را انتخاب کنید");
    if (from && to && from > to) return toast.error("تاریخ شروع باید قبل از تاریخ پایان باشد");
    setDownloading(true);
    try {
      const res = await fetch(`/api/admin/export${toQuery({ sections: sections.join(","), from, to })}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "تهیه فایل با خطا مواجه شد");
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "report.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("فایل اکسل آماده شد");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تهیه فایل با خطا مواجه شد");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <AdminPageHeader title="خروجی اکسل" description="دریافت فایل Excel راست‌به‌چپ با تاریخ‌های شمسی" />
      <Card>
        <CardContent className="space-y-6 pt-5">
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">بخش‌های فایل</legend>
            {SECTIONS.map((s) => (
              <label
                key={s.key}
                className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3", sections.includes(s.key) && "border-primary bg-primary-soft/50")}
              >
                <input type="checkbox" checked={sections.includes(s.key)} onChange={() => toggle(s.key)} className="mt-1 size-4 accent-[var(--primary)]" />
                <span>
                  <span className="text-sm font-semibold">{s.label}</span>
                  <span className="block text-xs text-muted-foreground">{s.description}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>بازه تاریخ رزروها (اختیاری)</Label>
              <Button variant="link" size="sm" onClick={thisMonth}>
                ماه جاری
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <JalaliDatePicker value={from} onChange={setFrom} placeholder="از تاریخ" clearable />
              <JalaliDatePicker value={to} onChange={setTo} placeholder="تا تاریخ" clearable />
            </div>
            <p className="text-xs text-muted-foreground">بدون انتخاب بازه، همه رزروها در فایل قرار می‌گیرند.</p>
          </div>

          <Button onClick={download} loading={downloading} className="w-full sm:w-auto">
            {downloading ? <FileSpreadsheet /> : <Download />}
            دریافت فایل اکسل
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
