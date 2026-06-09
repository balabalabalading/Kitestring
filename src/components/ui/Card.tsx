import { type HTMLAttributes, forwardRef, type ReactNode } from "react";

type CardVariant = "base" | "tool" | "drag-over";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  statusDot?: ReactNode;
}

const baseClasses =
  "transition-all duration-[var(--duration-fast)] ease-[var(--ease-out)]";

const variantClasses: Record<CardVariant, string> = {
  base: "rounded-lg bg-bg-elevated border border-border-subtle hover:border-border-default",
  tool: "rounded-[10px] bg-bg-elevated relative overflow-hidden",
  "drag-over":
    "rounded-lg border-2 border-dashed border-accent-sky bg-accent-sky-soft shadow-[var(--shadow-md)] animate-[brand-breathe_2s_ease-in-out_infinite]",
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = "base", statusDot, className = "", children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`${baseClasses} ${variantClasses[variant]} ${className}`}
        {...props}
      >
        {variant === "tool" && statusDot && (
          <div className="absolute top-2.5 left-2.5">{statusDot}</div>
        )}
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";
