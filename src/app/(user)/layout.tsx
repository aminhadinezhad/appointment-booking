import { UserShell } from "@/components/user/user-shell";
import { requireUserPage } from "@/server/auth/current";

export const dynamic = "force-dynamic";

export default async function UserLayout({ children }: { children: React.ReactNode }) {
  await requireUserPage();
  return <UserShell>{children}</UserShell>;
}
