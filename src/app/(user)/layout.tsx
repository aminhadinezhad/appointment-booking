import { UserShell } from "@/components/user/user-shell";
import { requireUserPage } from "@/server/auth/current";

export const dynamic = "force-dynamic";

// Note: pages under this layout render in parallel with it; each page that reads data must call requireUserPage() itself.
export default async function UserLayout({ children }: { children: React.ReactNode }) {
  await requireUserPage();
  return <UserShell>{children}</UserShell>;
}
