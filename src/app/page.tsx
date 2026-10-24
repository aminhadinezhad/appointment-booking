import { CalendarClock } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteFooter } from "@/components/legal/site-footer";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/server/auth/current";

export default async function LandingPage() {
  if (await getCurrentUser("USER")) redirect("/home");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-10 text-center">
      <div className="relative mb-8 grid size-52 place-items-center rounded-full bg-gradient-to-b from-primary-soft to-white">
        <div className="absolute inset-6 rounded-full bg-white/70 blur-xl" aria-hidden />
        <CalendarClock className="relative size-24 text-primary" strokeWidth={1.4} />
      </div>
      <h1 className="text-2xl font-extrabold">رزرو وقت مشاوره</h1>
      <p className="mt-3 max-w-xs leading-7 text-muted-foreground">به‌راحتی و در کمترین زمان، وقت مشاوره خود را رزرو کنید.</p>
      <Button asChild size="lg" className="mt-10 w-full">
        <Link href="/register">شروع</Link>
      </Button>
      <p className="mt-5 text-sm text-muted-foreground">
        قبلاً ثبت‌نام کرده‌اید؟{" "}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          ورود
        </Link>
      </p>
      <Link href="/admin/login" className="mt-12 text-xs text-muted-foreground/80 hover:text-primary">
        ورود مدیر سامانه
      </Link>
      <SiteFooter className="mt-2" />
    </main>
  );
}
