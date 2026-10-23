"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "FEMALE", label: "زن" },
  { value: "MALE", label: "مرد" },
] as const;

export function GenderPicker({
  value,
  onChange,
  invalid,
  name = "gender",
}: {
  value?: "MALE" | "FEMALE" | null;
  onChange: (v: "MALE" | "FEMALE") => void;
  invalid?: boolean;
  name?: string;
}) {
  return (
    <div role="radiogroup" aria-label="جنسیت" aria-invalid={invalid || undefined} className="grid grid-cols-2 gap-3">
      {OPTIONS.map((o) => {
        const checked = value === o.value;
        return (
          <label
            key={o.value}
            className={cn(
              "flex h-11 cursor-pointer items-center justify-between rounded-lg border bg-card px-3.5 text-sm transition-colors",
              checked ? "border-primary bg-primary-soft font-semibold text-primary" : "border-input hover:bg-accent",
              invalid && !checked && "border-destructive/60",
            )}
          >
            <input type="radio" name={name} value={o.value} checked={checked} onChange={() => onChange(o.value)} className="sr-only" />
            {o.label}
            <span
              className={cn(
                "grid size-5 place-items-center rounded-full border",
                checked ? "border-primary bg-primary text-white" : "border-input",
              )}
              aria-hidden
            >
              {checked && <Check className="size-3.5" strokeWidth={3} />}
            </span>
          </label>
        );
      })}
    </div>
  );
}
