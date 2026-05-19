import { type ButtonHTMLAttributes, forwardRef } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "icon";
type ButtonSize = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "btn-ripple bg-accent-warm text-text-inverse hover:brightness-110 active:translate-y-[1px]",
  secondary:
    "border border-border-default text-text-secondary hover:bg-bg-elevated active:translate-y-[1px]",
  ghost:
    "text-accent-sky hover:bg-bg-elevated active:translate-y-[1px]",
  icon:
    "w-6 h-6 flex items-center justify-center rounded-radius-sm text-text-tertiary hover:bg-bg-elevated hover:text-text-primary active:translate-y-[1px]",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "text-xs px-3 py-1 rounded-radius-md",
  md: "text-sm px-4 py-1.5 rounded-radius-md",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className = "", children, ...props }, ref) => {
    const isIcon = variant === "icon";
    return (
      <button
        ref={ref}
        className={[
          "inline-flex items-center justify-center font-medium transition-all",
          "duration-[var(--duration-fast)] ease-[var(--ease-out)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent/30",
          "disabled:opacity-40 disabled:pointer-events-none",
          isIcon ? variantClasses.icon : `${variantClasses[variant]} ${sizeClasses[size]}`,
          variant === "ghost" && "border-0 bg-transparent",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
