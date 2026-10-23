"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { toFaDigits } from "@/lib/digits";
import { cn } from "@/lib/utils";

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="mt-5 flex items-center justify-center gap-3 text-sm">
      <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="صفحه قبل">
        <ChevronRight />
      </Button>
      <span className="tabular-nums text-muted-foreground">
        صفحه {toFaDigits(page)} از {toFaDigits(pages)}
      </span>
      <Button variant="outline" size="icon-sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="صفحه بعد">
        <ChevronLeft />
      </Button>
    </div>
  );
}

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { key: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="tab"
          aria-selected={value === o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer",
            value === o.key ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Avatar({ name, gender, className }: { name: string; gender?: "MALE" | "FEMALE" | null; className?: string }) {
  const initial = name.trim().charAt(0) || "؟";
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-full text-base font-bold",
        gender === "FEMALE" ? "bg-pink-50 text-pink-600" : "bg-primary-soft text-primary",
        className,
      )}
    >
      {initial}
    </span>
  );
}
