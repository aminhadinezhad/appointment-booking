import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AcceptPlatformTerms } from "@/components/legal/accept-platform-terms";
import { adminAcceptedTerms, requireAdminPage } from "@/server/auth/current";
import { currentPlatformTerms } from "@/server/services/legal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "پذیرش شرایط استفاده" };

export default async function AdminTermsPage() {
  const admin = await requireAdminPage({ allowPendingTerms: true });
  if (await adminAcceptedTerms(admin.id)) redirect("/admin");
  const terms = currentPlatformTerms();
  return (
    <AcceptPlatformTerms
      adminName={admin.fullName}
      version={terms.version}
      effectiveDate={terms.effectiveDate}
      title={terms.title}
      summary={[...terms.summary]}
    />
  );
}
