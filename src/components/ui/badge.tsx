import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap [&_svg]:size-3.5",
  {
    variants: {
      variant: {
        default: "bg-primary-soft text-primary",
        success: "bg-success-soft text-success",
        destructive: "bg-destructive-soft text-destructive",
        warning: "bg-warning-soft text-warning",
        locked: "bg-locked-soft text-locked",
        muted: "bg-muted text-muted-foreground",
        outline: "border text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
