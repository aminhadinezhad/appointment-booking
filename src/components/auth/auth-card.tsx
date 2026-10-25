import { ChevronRight } from "lucide-react";
import Link from "next/link";
import * as React from "react";

export function AuthCard({
  title,
  subtitle,
  icon,
  backHref = "/",
  children,
  footer,
}: {
  title: string;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  backHref?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-6 sm:justify-center">
      <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="relative mb-6 flex items-center justify-center">
          <Link
            href={backHref}
            className="absolute right-0 grid size-9 place-items-center rounded-lg hover:bg-accent"
            aria-label="بازگشت"
          >
            <ChevronRight className="size-5" />
          </Link>
          <h1 className="text-xl font-bold">{title}</h1>
        </div>
        {icon && <div className="mb-5 flex justify-center">{icon}</div>}
        {subtitle && <p className="mb-6 text-center text-sm text-muted-foreground">{subtitle}</p>}
        {children}
      </div>
      {footer && <div className="mt-5 text-center text-sm text-muted-foreground">{footer}</div>}    </main>
  );
}
