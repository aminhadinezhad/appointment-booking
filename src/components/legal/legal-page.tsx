import { ChevronRight, FileText } from "lucide-react";
import Link from "next/link";
import { toFaDigits } from "@/lib/digits";
import { LegalDocument } from "./legal-document";
import { SiteFooter } from "./site-footer";

export function LegalPage({
  title,
  version,
  dateLabel,
  content,
  variant = "customer",
}: {
  title: string;
  version: number;
  dateLabel: string;
  content: string;
  variant?: "customer" | "admin";
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-6 md:py-10">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
        <ChevronRight className="size-4" />
        صفحه اصلی
      </Link>
      <article className="rounded-2xl border bg-card p-5 shadow-sm md:p-8">
        <header className="mb-6 flex items-start gap-3 border-b pb-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
            <FileText className="size-5" />
          </span>
          <div>
            <h1 className="text-xl font-extrabold">{title}</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              نسخه {toFaDigits(version)} · {dateLabel}
            </p>
          </div>
        </header>
        <LegalDocument content={content} />
      </article>
      <SiteFooter variant={variant} />
    </main>
  );
}
