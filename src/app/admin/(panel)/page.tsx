import { AlertTriangle, BarChart3, CalendarCheck, CalendarCog, FileSpreadsheet, Lock, Settings, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { Card } from "@/components/ui/card";
import { dateKeyToDb, formatJalaliLong } from "@/lib/dates";
import { toFaDigits } from "@/lib/digits";
import { tehranParts } from "@/lib/time";
import { requireAdminPage } from "@/server/auth/current";
import { db } from "@/server/db";
import { listAdminBookings } from "@/server/services/admin-bookings";

export const metadata: Metadata = { title: "داشبورد مدیریت" };

const TILES = [
  { href: "/admin/bookings", label: "رزروها", icon: CalendarCheck, color: "text-primary bg-primary-soft" },
  { href: "/admin/users", label: "کاربران", icon: Users, color: "text-primary bg-primary-soft" },
  { href: "/admin/schedule", label: "زمان‌بندی و تعطیلی‌ها", icon: CalendarCog, color: "text-locked bg-locked-soft" },
  { href: "/admin/reports", label: "آمار و گزارش‌ها", icon: BarChart3, color: "text-primary bg-primary-soft" },
  { href: "/admin/export", label: "فایل اکسل", icon: FileSpreadsheet, color: "text-success bg-success-soft" },
  { href: "/admin/settings", label: "تنظیمات", icon: Settings, color: "text-primary bg-primary-soft" },
] as const;

export default async function AdminDashboardPage() {
  // Layouts and pages render in parallel, so every page that reads data checks access itself.
  await requireAdminPage();
  const today = tehranParts().dateKey;
  const [todayBookings, pending, users, activeLocks, keptInLocks] = await Promise.all([
    db.booking.count({ where: { date: dateKeyToDb(today), status: "ACTIVE" } }),
    listAdminBookings({ status: "PENDING", pageSize: 1 }).then((p) => p.total),
    db.user.count({ where: { role: "USER" } }),
    db.scheduleLock.count({ where: { isActive: true } }),
    listAdminBookings({ status: "PENDING", inLockedRangeOnly: true, pageSize: 1 }).then((p) => p.total),
  ]);

  const stats = [
    { label: "رزروهای امروز", value: todayBookings, href: `/admin/bookings?from=${today}&to=${today}` },
    { label: "رزروهای در انتظار", value: pending, href: "/admin/bookings?status=PENDING" },
    { label: "کاربران", value: users, href: "/admin/users" },
    { label: "قفل‌های فعال", value: activeLocks, href: "/admin/schedule" },
  ];

  return (
    <>
      <AdminPageHeader title="داشبورد" description={formatJalaliLong(today)} />

      {keptInLocks > 0 && (
        <Link
          href="/admin/bookings?inLocked=1"
          className="mb-5 flex items-center gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning hover:bg-warning-soft/70"
        >
          <AlertTriangle className="size-5 shrink-0" />
          <span>
            <b>{toFaDigits(keptInLocks)}</b> رزرو موجود در محدوده قفل‌شده وجود دارد. برای بررسی کلیک کنید.
          </span>
        </Link>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="p-4 transition-colors hover:border-primary/40">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="mt-2 text-2xl font-extrabold tabular-nums">{toFaDigits(s.value)}</p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {TILES.map(({ href, label, icon: Icon, color }) => (
          <Link key={href} href={href}>
            <Card className="flex h-32 flex-col items-center justify-center gap-3 text-center transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
              <span className={`grid size-12 place-items-center rounded-xl ${color}`}>
                <Icon className="size-6" />
              </span>
              <span className="text-sm font-semibold">{label}</span>
            </Card>
          </Link>
        ))}
      </div>

      <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
        <Lock className="size-3.5" />
        رزروهای موجود هنگام قفل‌کردن زمان‌ها حذف نمی‌شوند؛ آن‌ها را از بخش رزروها مدیریت کنید.
      </p>
    </>
  );
}
