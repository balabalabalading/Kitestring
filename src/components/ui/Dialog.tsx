import { useEffect, useRef, useState, type ReactNode } from "react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}

export function Dialog({ open, onClose, children, width = "w-96" }: DialogProps) {
  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState<"closed" | "open">("closed");
  const contentRef = useRef<HTMLDivElement>(null);

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

  const handleTransitionEnd = () => {
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

  if (!mounted) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backdropFilter: "blur(4px)" }}
    >
      {/* Overlay */}
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-[var(--duration-normal)] ${
          state === "open" ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      {/* Content */}
      <div
        ref={contentRef}
        data-state={state}
        className={[
          "relative bg-bg-surface rounded-lg shadow-[var(--shadow-lg)] flex flex-col max-h-[85vh]",
          width,
          state === "open"
            ? "animate-[dialog-in_250ms_var(--ease-bounce)_forwards]"
            : "animate-[dialog-out_180ms_var(--ease-in)_forwards]",
        ].join(" ")}
        onAnimationEnd={handleTransitionEnd}
      >
        {children}
      </div>
    </div>
  );
}
