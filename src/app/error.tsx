"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 grid size-16 place-items-center rounded-full bg-destructive-soft text-destructive">
        <AlertTriangle className="size-8" />
      </div>
      <h1 className="text-xl font-bold">خطایی رخ داد</h1>
      <p className="mt-2 text-sm text-muted-foreground">متأسفیم، در نمایش این صفحه مشکلی پیش آمد. دوباره تلاش کنید.</p>
      <Button className="mt-6" onClick={reset}>
        تلاش دوباره
      </Button>
    </main>
  );
}
