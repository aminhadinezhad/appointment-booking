import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminPage } from "@/server/auth/current";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminPage();
  return <AdminShell adminName={admin.fullName}>{children}</AdminShell>;
}
