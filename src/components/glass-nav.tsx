"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { cn } from "@/lib/utils";
import { lensStyle, surfaceHoleStyle, useLens, type Lens } from "./use-lens";

export type GlassNavItem = { href: string; label: string; icon: LucideIcon; active: boolean };

/** The frosted surface (with a hole under the lens) and the clear lens on the selected item. */
function GlassLayers({ lens, className }: { lens: Lens; className?: string }) {
  return (
    <>
      <div aria-hidden className="liquid-surface" style={surfaceHoleStyle(lens)} />
      <span
        aria-hidden
        className={cn(
          "liquid-lens absolute rounded-full",
          lens.animate && "transition-[left,top,width,height,opacity] duration-500 ease-[cubic-bezier(0.3,1.3,0.5,1)]",
          !lens.visible && "opacity-0",
          className,
        )}
        style={lensStyle(lens)}
      />
    </>
  );
}

/** Floating liquid-glass tab bar for phones; a clear lens slides to the current page. */
export function GlassTabBar({ items, label, className }: { items: GlassNavItem[]; label: string; className?: string }) {
  const bar = React.useRef<HTMLDivElement>(null);
  const links = React.useRef<(HTMLAnchorElement | null)[]>([]);
  const index = items.findIndex((i) => i.active);
  const lens = useLens(bar, () => links.current[index] ?? null, index);

  return (
    <nav aria-label={label} className={cn("fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]", className)}>
      <div ref={bar} data-animate={lens.animate || undefined} className="liquid-bar relative mx-auto h-[62px] max-w-md rounded-full p-1.5">
        <GlassLayers lens={lens} />
        <div className="relative grid h-full" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
          {items.map(({ href, label: text, icon: Icon, active }, i) => (
            <Link
              key={href}
              ref={(el) => {
                links.current[i] = el;
              }}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative z-10 flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-full text-center leading-tight transition-colors",
                items.length > 4 ? "text-[10px]" : "text-[11px]",
                active ? "font-bold text-primary" : "font-medium text-slate-600",
              )}
            >
              <Icon className="size-5" strokeWidth={active ? 2.3 : 1.8} />
              <span className="max-w-full truncate px-0.5">{text}</span>
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}

/** Floating liquid-glass top bar (desktop): brand on one side, links with a sliding lens on the other. */
export function GlassTopBar({ brand, items, label, className }: { brand: React.ReactNode; items: GlassNavItem[]; label: string; className?: string }) {
  const bar = React.useRef<HTMLDivElement>(null);
  const links = React.useRef<(HTMLAnchorElement | null)[]>([]);
  const index = items.findIndex((i) => i.active);
  const lens = useLens(bar, () => links.current[index] ?? null, index);

  return (
    <div
      ref={bar}
      data-animate={lens.animate || undefined}
      className={cn("liquid-bar relative mx-auto flex h-14 items-center justify-between rounded-full ps-5 pe-2", className)}
    >
      <GlassLayers lens={lens} />
      <div className="relative z-10">{brand}</div>
      <nav aria-label={label} className="relative z-10 flex items-center">
        {items.map(({ href, label: text, icon: Icon, active }, i) => (
          <Link
            key={href}
            ref={(el) => {
              links.current[i] = el;
            }}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors",
              active ? "font-bold text-primary" : "font-medium text-slate-600 hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {text}
          </Link>
        ))}
      </nav>
    </div>
  );
}
