import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current";

export const dynamic = "force-dynamic";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getCurrentUser("USER")) redirect("/home");
  return children;
}
