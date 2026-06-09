import { useEffect, useRef, useState, type ReactNode } from "react";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function Drawer({ open, onClose, children }: DrawerProps) {
  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState<"closed" | "open">("closed");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setState("open"));
      });
    } else if (mounted) {
      setState("closed");
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAnimationEnd = () => {
    if (state === "closed") {
      setMounted(false);
    }
  };

  useEffect(() => {
    if (!mounted) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [mounted, onClose]);

  useEffect(() => {
    if (state === "open") panelRef.current?.focus();
  }, [state]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Overlay */}
      <div
        className={`absolute inset-0 bg-black/20 transition-opacity duration-[var(--duration-normal)] ${
          state === "open" ? "opacity-100" : "opacity-0"
        }`}
        style={{ backdropFilter: "blur(2px)" }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        data-state={state}
        className={[
          "relative w-[var(--drawer-width)] h-full bg-bg-surface shadow-[var(--shadow-lg)] flex flex-col",
          state === "open"
            ? "animate-[drawer-in_250ms_var(--ease-out)_forwards]"
            : "animate-[drawer-out_180ms_var(--ease-in)_forwards]",
        ].join(" ")}
        onAnimationEnd={handleAnimationEnd}
      >
        {children}
      </div>
    </div>
  );
}
