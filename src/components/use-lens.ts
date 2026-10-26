"use client";

import * as React from "react";

/**
 * Where the selected item's lens sits inside its bar, in px. `animate` turns on after the
 * first placement, so the lens does not fly in from the corner when the page loads.
 */
export type Lens = { x: number; y: number; w: number; h: number; visible: boolean; animate: boolean };

const HIDDEN: Lens = { x: 0, y: 0, w: 0, h: 0, visible: false, animate: false };

/**
 * Measures the active item relative to its bar, so the lens and the hole in the frosted
 * surface can be placed on it. Re-measures on resize and once the web font has loaded.
 */
export function useLens(bar: React.RefObject<HTMLElement | null>, active: HTMLElement | null | (() => HTMLElement | null), key: unknown): Lens {
  const [lens, setLens] = React.useState<Lens>(HIDDEN);
  const getActive = React.useRef(active);
  getActive.current = active;

  React.useEffect(() => {
    let frame = 0;
    const measure = () => {
      const target = typeof getActive.current === "function" ? getActive.current() : getActive.current;
      const box = bar.current?.getBoundingClientRect();
      if (!target || !box) {
        // fade out where it is instead of jumping
        setLens((prev) => ({ ...prev, visible: false }));
        return;
      }
      const r = target.getBoundingClientRect();
      setLens((prev) => ({ x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height, visible: true, animate: prev.animate }));
      if (!frame) frame = requestAnimationFrame(() => setLens((prev) => (prev.animate ? prev : { ...prev, animate: true })));
    };
    measure();
    void document.fonts?.ready.then(measure);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
    };
  }, [bar, key]);

  return lens;
}

/** Position of the lens itself. */
export function lensStyle(lens: Lens): React.CSSProperties {
  return { left: lens.x, top: lens.y, width: lens.w, height: lens.h };
}

/**
 * Mask for the frosted surface: everything except a pill-shaped hole under the lens.
 * The pill is built from two circles and a rectangle so position and size can animate.
 */
export function surfaceHoleStyle(lens: Lens): React.CSSProperties {
  const d = lens.visible ? lens.h : 0;
  const w = lens.visible ? lens.w : 0;
  const mid = Math.max(w - d, 0);
  const dot = "radial-gradient(circle closest-side, #000 98%, transparent)";
  const fill = "linear-gradient(#000 0 0)";
  const images = [fill, fill, dot, dot].join(", ");
  const sizes = `100% 100%, ${mid}px ${d}px, ${d}px ${d}px, ${d}px ${d}px`;
  const cy = lens.y + (lens.h - d) / 2;
  const positions = `0 0, ${lens.x + d / 2 + (lens.w - w) / 2}px ${cy}px, ${lens.x + (lens.w - w) / 2}px ${cy}px, ${lens.x + (lens.w + w) / 2 - d}px ${cy}px`;
  return {
    maskImage: images,
    WebkitMaskImage: images,
    maskSize: sizes,
    WebkitMaskSize: sizes,
    maskPosition: positions,
    WebkitMaskPosition: positions,
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
    // the top layer (whole surface) minus the union of the three shapes below it
    maskComposite: "subtract, add, add, add",
    WebkitMaskComposite: "source-out, source-over, source-over, source-over",
  };
}
