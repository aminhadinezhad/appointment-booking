"use client";

import { useMutation } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarCheck,
  CalendarCog,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { GlassTabBar } from "@/components/glass-nav";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export const ADMIN_NAV = [
  { href: "/admin", label: "داشبورد", icon: LayoutDashboard, mobile: true },
  { href: "/admin/bookings", label: "رزروها", icon: CalendarCheck, mobile: true },
  { href: "/admin/users", label: "کاربران", icon: Users, mobile: true },
  { href: "/admin/schedule", label: "زمان‌بندی و تعطیلی‌ها", short: "زمان‌بندی", icon: CalendarCog, mobile: true },
  { href: "/admin/reports", label: "آمار و گزارش‌ها", short: "گزارش‌ها", icon: BarChart3, mobile: true },
  { href: "/admin/export", label: "خروجی اکسل", icon: FileSpreadsheet, mobile: false },
  { href: "/admin/settings", label: "تنظیمات", icon: Settings, mobile: false },
] as const;

export function useAdminLogout() {
  const router = useRouter();
  return useMutation({
    mutationFn: () => apiFetch("/api/auth/admin/logout", { method: "POST", body: {} }),
    onSuccess: () => {
      router.replace("/admin/login");
      router.refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function AdminShell({ adminName, children }: { adminName: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const logout = useAdminLogout();
  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`));

  React.useEffect(() => setOpen(false), [pathname]);

  const nav = (
    <nav className="space-y-1" aria-label="منوی مدیریت">
      {ADMIN_NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            isActive(href) ? "bg-white/15 text-white" : "text-blue-100/80 hover:bg-white/10 hover:text-white",
          )}
        >
          <Icon className="size-[18px]" />
          {label}
        </Link>
      ))}
      <button
        type="button"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-blue-100/80 hover:bg-white/10 hover:text-white cursor-pointer"
      >
        <LogOut className="size-[18px]" />
        خروج
      </button>
    </nav>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[250px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col bg-admin-header p-4 text-white lg:flex">
        <div className="mb-8 px-2 pt-2">
          <p className="text-lg font-extrabold">پنل مدیریت</p>
          <p className="mt-1 text-xs text-blue-100/70">{adminName}</p>
        </div>
        {nav}
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-admin-header px-4 text-white lg:hidden">
        <p className="font-bold">پنل مدیریت</p>
        <button type="button" onClick={() => setOpen(true)} className="grid size-10 place-items-center rounded-lg hover:bg-white/10 cursor-pointer" aria-label="باز کردن منو">
          <Menu className="size-5" />
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="منو">
          <div className="absolute inset-0 bg-slate-950/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 w-72 bg-admin-header p-4 text-white shadow-xl">
            <div className="mb-6 flex items-center justify-between px-2">
              <div>
                <p className="font-extrabold">پنل مدیریت</p>
                <p className="text-xs text-blue-100/70">{adminName}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-lg hover:bg-white/10 cursor-pointer" aria-label="بستن منو">
                <X className="size-5" />
              </button>
            </div>
            {nav}
          </div>
        </div>
      )}

      <main className="min-w-0 px-4 pb-32 pt-5 md:px-6 lg:px-8 lg:pb-10 lg:pt-8">
        {children}
      </main>

      <GlassTabBar
        label="منوی پایین"
        className="lg:hidden"
        items={ADMIN_NAV.filter((n) => n.mobile).map((item) => ({
          href: item.href,
          label: "short" in item ? item.short : item.label,
          icon: item.icon,
          active: isActive(item.href),
        }))}
      />
    </div>
  );
}

export function AdminPageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold lg:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
