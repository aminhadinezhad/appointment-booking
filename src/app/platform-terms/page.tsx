import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { toFaDigits } from "@/lib/digits";
import { currentPlatformTerms } from "@/server/services/legal";

export const metadata: Metadata = { title: "شرایط استفاده از نرم‌افزار" };

export default function PlatformTermsPage() {
  const terms = currentPlatformTerms();
  return (
    <LegalPage
      variant="admin"
      title={terms.title}
      version={terms.version}
      dateLabel={`تاریخ اجرا ${toFaDigits(terms.effectiveDate)}`}
      content={terms.content}
    />
  );
}
