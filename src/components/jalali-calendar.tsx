"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import {
  formatJalaliLong,
  formatJalaliMonth,
  jalaliMonthDays,
  persianWeekIndex,
  shiftJalaliMonth,
  toJalali,
  WEEKDAY_SHORT,
  type DateKey,
} from "@/lib/dates";
import { toFaDigits } from "@/lib/digits";
import { cn } from "@/lib/utils";

export interface CalendarDayProps {
  disabled?: boolean;
  /** Visual tone of the day cell. */
  tone?: "default" | "muted" | "closed" | "full";
  /** Small marker under the day number. */
  marker?: "dot" | "locked" | "mine" | null;
  /** Extra text for screen readers, e.g. "بسته است". */
  srLabel?: string;
}

interface Props {
  jy: number;
  jm: number;
  onMonthChange: (jy: number, jm: number) => void;
  selected?: DateKey | null;
  onSelect?: (dateKey: DateKey) => void;
  todayKey: DateKey;
  getDayProps?: (dateKey: DateKey) => CalendarDayProps;
  minMonth?: { jy: number; jm: number };
  maxMonth?: { jy: number; jm: number };
  loading?: boolean;
  className?: string;
  footer?: React.ReactNode;
}

const monthIndex = (m: { jy: number; jm: number }) => m.jy * 12 + m.jm;

export function JalaliCalendar({
  jy,
  jm,
  onMonthChange,
  selected,
  onSelect,
  todayKey,
  getDayProps,
  minMonth,
  maxMonth,
  loading,
  className,
  footer,
}: Props) {
  const days = React.useMemo(() => jalaliMonthDays(jy, jm), [jy, jm]);
  const leading = persianWeekIndex(days[0]!);
  const prev = shiftJalaliMonth(jy, jm, -1);
  const next = shiftJalaliMonth(jy, jm, 1);
  const canPrev = !minMonth || monthIndex(prev) >= monthIndex(minMonth);
  const canNext = !maxMonth || monthIndex(next) <= monthIndex(maxMonth);

  return (
    <div className={cn("select-none", className)}>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onMonthChange(prev.jy, prev.jm)}
          disabled={!canPrev}
          className="grid size-9 place-items-center rounded-lg text-foreground hover:bg-accent disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
          aria-label="ماه قبل"
        >
          <ChevronRight className="size-5" />
        </button>
        <p className="text-base font-bold" aria-live="polite">
          {formatJalaliMonth(jy, jm)}
        </p>
        <button
          type="button"
          onClick={() => onMonthChange(next.jy, next.jm)}
          disabled={!canNext}
          className="grid size-9 place-items-center rounded-lg text-foreground hover:bg-accent disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
          aria-label="ماه بعد"
        >
          <ChevronLeft className="size-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center" role="grid" aria-busy={loading || undefined}>
        {WEEKDAY_SHORT.map((w, i) => (
          <div key={w} role="columnheader" className={cn("pb-1 text-xs font-medium text-muted-foreground", i === 6 && "text-destructive/80")}>
            {w}
          </div>
        ))}
        {Array.from({ length: leading }, (_, i) => (
          <div key={`blank-${i}`} aria-hidden />
        ))}
        {days.map((dateKey) => {
          const props = getDayProps?.(dateKey) ?? {};
          const isSelected = selected === dateKey;
          const isToday = dateKey === todayKey;
          const jd = toJalali(dateKey).jd;
          return (
            <button
              key={dateKey}
              type="button"
              role="gridcell"
              aria-selected={isSelected}
              aria-label={`${formatJalaliLong(dateKey)}${props.srLabel ? `، ${props.srLabel}` : ""}`}
              disabled={props.disabled || !onSelect}
              onClick={() => onSelect?.(dateKey)}
              className={cn(
                "relative mx-auto flex aspect-square w-full max-w-11 flex-col items-center justify-center rounded-full text-sm transition-colors cursor-pointer",
                "disabled:cursor-not-allowed",
                props.tone === "muted" && "text-muted-foreground/50",
                props.tone === "closed" && "text-destructive/70 line-through decoration-destructive/40",
                props.tone === "full" && "text-muted-foreground",
                !props.disabled && !isSelected && "hover:bg-accent",
                isToday && !isSelected && "ring-1 ring-primary/50 font-bold text-primary",
                isSelected && "bg-primary text-primary-foreground font-bold shadow-md shadow-primary/30",
                loading && "opacity-60",
              )}
            >
              <span>{toFaDigits(jd)}</span>
              {props.marker && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute bottom-1 h-1 rounded-full",
                    props.marker === "dot" && "w-1 bg-primary",
                    props.marker === "mine" && "w-1.5 bg-success",
                    props.marker === "locked" && "w-2.5 bg-locked/70",
                    isSelected && "bg-primary-foreground",
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
      {footer}
    </div>
  );
}
