import Link from "next/link";
import { cn } from "@/lib/utils";

/** Legal links at the bottom of the public landing page. */
export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-4 text-xs text-muted-foreground", className)}>
      <Link href="/terms" className="hover:text-primary hover:underline">
        قوانین و مقررات
      </Link>
      <span aria-hidden>·</span>
      <Link href="/privacy" className="hover:text-primary hover:underline">
        حریم خصوصی
      </Link>
    </footer>
  );
}

/** Inline links used in consent sentences; they open in a new tab so form state is kept. */
export function TermsLink({ href, children }: { href: "/terms" | "/privacy" | "/platform-terms"; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener" className="font-semibold text-primary underline-offset-2 hover:underline">
      {children}
    </a>
  );
}
