import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { toFaDigits } from "@/lib/digits";
import { currentCustomerDocs } from "@/server/services/legal";

export const metadata: Metadata = { title: "قوانین و مقررات" };

export default function TermsPage() {
  const doc = currentCustomerDocs().TERMS;
  return <LegalPage title={doc.title} version={doc.version} dateLabel={`تاریخ اجرا ${toFaDigits(doc.effectiveDate)}`} content={doc.content} />;
}
