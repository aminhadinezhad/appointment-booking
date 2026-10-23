"use client";

import { CheckCircle2, Clock, Lock } from "lucide-react";
import { formatHour } from "@/lib/dates";
import type { SlotView } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATE_LABEL: Record<SlotView["state"], string> = {
  AVAILABLE: "قابل رزرو",
  MINE: "رزرو شما",
  BOOKED: "رزرو شده",
  LOCKED: "غیرفعال",
  CLOSED_HOURS: "خارج از ساعات کاری",
  PAST: "گذشته",
  OUT_OF_RANGE: "هنوز باز نشده",
};

export function SlotGrid({
  slots,
  selectedHour,
  onPick,
}: {
  slots: SlotView[];
  selectedHour?: number | null;
  onPick: (slot: SlotView) => void;
}) {
  return (
    <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3" aria-label="ساعت‌های این روز">
      {slots.map((slot) => {
        const available = slot.state === "AVAILABLE";
        const mine = slot.state === "MINE";
        const locked = slot.state === "LOCKED";
        const selected = selectedHour === slot.hour;
        return (
          <li key={slot.hour}>
            <button
              type="button"
              disabled={!available && !mine}
              onClick={() => onPick(slot)}
              aria-label={`${formatHour(slot.hour)} تا ${formatHour(slot.hour + 1)}، ${STATE_LABEL[slot.state]}`}
              className={cn(
                "flex h-16 w-full flex-col items-center justify-center gap-0.5 rounded-xl border text-sm transition-all cursor-pointer disabled:cursor-not-allowed",
                available && "border-input bg-card hover:border-primary hover:bg-primary-soft hover:text-primary",
                available && selected && "border-primary bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                mine && "border-success/40 bg-success-soft text-success",
                slot.state === "BOOKED" && "border-transparent bg-slate-100 text-slate-500",
                locked && "hatch border-dashed border-locked/40 bg-locked-soft/60 text-locked",
                (slot.state === "PAST" || slot.state === "CLOSED_HOURS" || slot.state === "OUT_OF_RANGE") &&
                  "border-transparent bg-muted/60 text-muted-foreground/60",
              )}
            >
              <span className="ltr font-semibold tabular-nums">
                {formatHour(slot.hour)} - {formatHour(slot.hour + 1)}
              </span>
              <span className="flex items-center gap-1 text-[11px] font-medium">
                {mine && <CheckCircle2 className="size-3" />}
                {locked && <Lock className="size-3" />}
                {slot.state === "BOOKED" && <Clock className="size-3" />}
                {locked ? "قابل رزرو نیست" : STATE_LABEL[slot.state]}
              </span>
            </button>
            {locked && slot.publicReason && <p className="mt-1 px-1 text-[11px] leading-5 text-locked">{slot.publicReason}</p>}
          </li>
        );
      })}
    </ul>
  );
}

export function SlotLegend() {
  const items = [
    { className: "border-input bg-card", label: "آزاد" },
    { className: "border-success/40 bg-success-soft", label: "رزرو شما" },
    { className: "bg-slate-100 border-transparent", label: "رزرو شده" },
    { className: "hatch border-dashed border-locked/40 bg-locked-soft", label: "غیرفعال (بسته)" },
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className={cn("size-3.5 rounded border", i.className)} aria-hidden />
          {i.label}
        </span>
      ))}
    </div>
  );
}
