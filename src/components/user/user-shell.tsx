"use client";

import { CalendarDays, Home, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { GlassTabBar, GlassTopBar } from "@/components/glass-nav";

const NAV = [
  { href: "/home", label: "خانه", icon: Home },
  { href: "/bookings", label: "رزروهای من", icon: CalendarDays },
  { href: "/profile", label: "پروفایل", icon: UserRound },
] as const;

export function UserShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const items = NAV.map((item) => ({ ...item, active: isActive(item.href) }));

  return (
    <div className="min-h-dvh pb-32 md:pb-10">
      <header className="sticky top-0 z-30 hidden px-6 pt-3 md:block">
        <GlassTopBar
          className="max-w-5xl"
          label="منوی اصلی"
          items={items}
          brand={
            <Link href="/home" className="flex items-center gap-2 font-extrabold text-primary">
              <CalendarDays className="size-6" />
              رزرو وقت مشاوره
            </Link>
          }
        />
      </header>

      <div className="mx-auto max-w-5xl px-4 pt-5 md:px-6 md:pt-8">
        {children}
      </div>

      <GlassTabBar items={items} label="منوی اصلی" className="md:hidden" />
    </div>
  );
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
