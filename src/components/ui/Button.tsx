import { type ButtonHTMLAttributes, forwardRef } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "icon";
type ButtonSize = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 危险操作样式，适用于 primary / ghost / secondary variant */
  danger?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "btn-ripple bg-accent-warm text-text-inverse border border-transparent hover:brightness-110 active:translate-y-[1px]",
  secondary:
    "border border-border-default text-text-secondary hover:bg-bg-elevated active:translate-y-[1px]",
  ghost:
    "text-accent-sky border border-transparent hover:bg-bg-surface active:translate-y-[1px]",
  icon:
    "w-6 h-6 flex items-center justify-center rounded-sm text-text-tertiary hover:bg-bg-elevated hover:text-text-primary active:translate-y-[1px]",
};

const dangerOverrides: Partial<Record<ButtonVariant, string>> = {
  primary: "bg-status-broken hover:bg-status-broken/90 text-white border-transparent",
  ghost: "text-status-broken hover:bg-status-broken/10 border-transparent",
  secondary: "border-status-broken text-status-broken hover:bg-status-broken/10",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "text-xs px-3 py-1 rounded-md",
  md: "text-sm px-4 py-1.5 rounded-md",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", danger = false, className = "", children, ...props }, ref) => {
    const isIcon = variant === "icon";
    const baseVariant = isIcon ? variantClasses.icon : variantClasses[variant];
    const dangerClass = !isIcon && danger ? dangerOverrides[variant] : undefined;
    return (
      <button
        ref={ref}
        className={[
          "inline-flex items-center justify-center font-medium transition-all",
          "duration-[var(--duration-fast)] ease-[var(--ease-out)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent/30",
          "disabled:opacity-40 disabled:pointer-events-none",
          isIcon ? baseVariant : `${baseVariant} ${sizeClasses[size]}`,
          !isIcon && variant === "ghost" && !danger && "bg-transparent",
          dangerClass,
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
