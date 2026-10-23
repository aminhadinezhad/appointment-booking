import { SearchX } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 grid size-16 place-items-center rounded-full bg-primary-soft text-primary">
        <SearchX className="size-8" />
      </div>
      <h1 className="text-xl font-bold">صفحه موردنظر یافت نشد</h1>
      <p className="mt-2 text-sm text-muted-foreground">ممکن است آدرس اشتباه باشد یا این مورد حذف شده باشد.</p>
      <Button asChild className="mt-6">
        <Link href="/">بازگشت به صفحه اصلی</Link>
      </Button>
    </main>
  );
}
