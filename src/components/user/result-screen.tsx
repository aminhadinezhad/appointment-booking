import { CalendarDays, Check, Clock } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Full-screen confirmation used after booking and cancellation. */
export function ResultScreen({
  title,
  description,
  date,
  time,
  actionHref,
  actionLabel,
  secondary,
  tone = "success",
}: {
  title: string;
  description?: React.ReactNode;
  date?: string;
  time?: string;
  actionHref: string;
  actionLabel: string;
  secondary?: { href: string; label: string };
  tone?: "success" | "neutral";
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-6 text-center">
      <div className={cn("mb-6 grid size-28 place-items-center rounded-full", tone === "success" ? "bg-success-soft" : "bg-muted")}>
        <div className={cn("grid size-18 place-items-center rounded-full text-white shadow-lg", tone === "success" ? "bg-success shadow-success/30" : "bg-slate-500")}>
          <Check className="size-10" strokeWidth={3} />
        </div>
      </div>
      <h1 className="text-xl font-extrabold">{title}</h1>
      {description && <p className="mt-2 text-sm leading-7 text-muted-foreground">{description}</p>}
      {(date || time) && (
        <dl className="mt-6 w-full divide-y rounded-xl border bg-card text-sm">
          {date && (
            <div className="flex items-center justify-between px-4 py-3.5">
              <dt className="flex items-center gap-2 text-muted-foreground">
                <CalendarDays className="size-4" /> تاریخ
              </dt>
              <dd className="font-semibold">{date}</dd>
            </div>
          )}
          {time && (
            <div className="flex items-center justify-between px-4 py-3.5">
              <dt className="flex items-center gap-2 text-muted-foreground">
                <Clock className="size-4" /> ساعت
              </dt>
              <dd className="font-semibold">{time}</dd>
            </div>
          )}
        </dl>
      )}
      <Button asChild className="mt-8 w-full">
        <Link href={actionHref}>{actionLabel}</Link>
      </Button>
      {secondary && (
        <Button asChild variant="ghost" className="mt-2 w-full">
          <Link href={secondary.href}>{secondary.label}</Link>
        </Button>
      )}
    </div>
  );
}
