import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ورود مدیر" };

export default async function AdminLoginLayout({ children }: { children: React.ReactNode }) {
  if (await getCurrentUser("ADMIN")) redirect("/admin");
  return children;
}
