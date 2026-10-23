import { Ban, CheckCircle2, Clock, PlayCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { BookingDisplayStatus } from "@/lib/types";

const MAP: Record<BookingDisplayStatus, { label: string; variant: "default" | "success" | "destructive" | "muted" | "warning"; icon: typeof Clock }> = {
  UPCOMING: { label: "ثبت شده", variant: "success", icon: CheckCircle2 },
  IN_PROGRESS: { label: "در حال برگزاری", variant: "warning", icon: PlayCircle },
  HELD: { label: "برگزار شده", variant: "default", icon: Clock },
  CANCELLED: { label: "لغو شده", variant: "destructive", icon: Ban },
};

export function BookingStatusBadge({ status }: { status: BookingDisplayStatus }) {
  const { label, variant, icon: Icon } = MAP[status];
  return (
    <Badge variant={variant}>
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}
