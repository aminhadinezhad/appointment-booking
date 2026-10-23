import { AlertCircle, Inbox, Loader2 } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-lg bg-slate-200/70", className)} {...props} />;
}

export function LoadingState({ label = "در حال بارگذاری...", className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cn("flex flex-col items-center justify-center gap-3 py-12 text-sm text-muted-foreground", className)}>
      <Loader2 className="size-6 animate-spin text-primary" aria-hidden />
      {label}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-4 py-12 text-center", className)}>
      <div className="mb-1 grid size-14 place-items-center rounded-full bg-primary-soft text-primary">
        <Icon className="size-6" />
      </div>
      <p className="font-semibold">{title}</p>
      {description && <p className="max-w-xs text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry, className }: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn("flex flex-col items-center justify-center gap-2 px-4 py-10 text-center", className)}>
      <div className="mb-1 grid size-12 place-items-center rounded-full bg-destructive-soft text-destructive">
        <AlertCircle className="size-6" />
      </div>
      <p className="text-sm font-medium">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          تلاش دوباره
        </Button>
      )}
    </div>
  );
}
