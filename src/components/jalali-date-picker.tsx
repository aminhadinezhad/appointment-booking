"use client";

import * as Popover from "@radix-ui/react-popover";
import { CalendarDays, X } from "lucide-react";
import * as React from "react";
import { formatJalali, toJalali, type DateKey } from "@/lib/dates";
import { tehranParts } from "@/lib/time";
import { cn } from "@/lib/utils";
import { JalaliCalendar } from "./jalali-calendar";

/** Button + popover calendar for picking a single Jalali date. Value is a Gregorian date key. */
export function JalaliDatePicker({
  value,
  onChange,
  placeholder = "انتخاب تاریخ",
  id,
  invalid,
  clearable,
  minDate,
  className,
}: {
  value: DateKey | null | undefined;
  onChange: (value: DateKey | null) => void;
  placeholder?: string;
  id?: string;
  invalid?: boolean;
  clearable?: boolean;
  minDate?: DateKey;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const todayKey = tehranParts().dateKey;
  const initial = toJalali(value ?? minDate ?? todayKey);
  const [month, setMonth] = React.useState({ jy: initial.jy, jm: initial.jm });

  React.useEffect(() => {
    if (open) {
      const j = toJalali(value ?? minDate ?? todayKey);
      setMonth({ jy: j.jy, jm: j.jm });
    }
  }, [open, value, minDate, todayKey]);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div className={cn("relative", className)}>
        <Popover.Trigger asChild>
          <button
            id={id}
            type="button"
            className={cn(
              "flex h-11 w-full items-center gap-2 rounded-lg border border-input bg-card px-3 text-sm shadow-xs cursor-pointer focus-visible:outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/40",
              invalid && "border-destructive",
              !value && "text-muted-foreground",
            )}
          >
            <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
            <span className="tabular-nums">{value ? formatJalali(value) : placeholder}</span>
          </button>
        </Popover.Trigger>
        {clearable && value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute left-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-accent cursor-pointer"
            aria-label="پاک کردن تاریخ"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <Popover.Portal>
        <Popover.Content
          dir="rtl"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-[60] w-[19rem] rounded-xl border bg-popover p-3 shadow-xl"
        >
          <JalaliCalendar
            jy={month.jy}
            jm={month.jm}
            onMonthChange={(jy, jm) => setMonth({ jy, jm })}
            selected={value}
            todayKey={todayKey}
            onSelect={(d) => {
              onChange(d);
              setOpen(false);
            }}
            getDayProps={minDate ? (d) => ({ disabled: d < minDate, tone: d < minDate ? "muted" : "default" }) : undefined}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
