"use client";

import { CalendarDays, Home, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/home", label: "خانه", icon: Home },
  { href: "/bookings", label: "رزروهای من", icon: CalendarDays },
  { href: "/profile", label: "پروفایل", icon: UserRound },
] as const;

export function UserShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="min-h-dvh pb-24 md:pb-10">
      <header className="sticky top-0 z-30 hidden border-b bg-card/90 backdrop-blur md:block">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <Link href="/home" className="flex items-center gap-2 font-extrabold text-primary">
            <CalendarDays className="size-6" />
            رزرو وقت مشاوره
          </Link>
          <nav className="flex items-center gap-1">
            {NAV.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive(href) ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 pt-5 md:px-6 md:pt-8">{children}</div>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 backdrop-blur md:hidden" aria-label="منوی اصلی">
        <div className="mx-auto grid h-16 max-w-md grid-cols-3">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={cn(
                "flex flex-col items-center justify-center gap-1 text-[11px] font-medium",
                isActive(href) ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="size-5" strokeWidth={isActive(href) ? 2.4 : 1.8} />
              {label}
            </Link>
          ))}
        </div>
      </nav>
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
