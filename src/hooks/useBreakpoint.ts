import { useState, useEffect } from "react";

export type Breakpoint = "wide" | "medium" | "narrow";

function getBreakpoint(width: number): Breakpoint {
  if (width >= 1280) return "wide";
  if (width >= 1024) return "medium";
  return "narrow";
}

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(() => getBreakpoint(window.innerWidth));

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setBp(getBreakpoint(entry.contentRect.width));
      }
    });
    observer.observe(document.documentElement);
    return () => observer.disconnect();
  }, []);

  return bp;
}
