import { type InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ mono = false, className = "", ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={[
          "w-full text-xs px-3 py-1.5 rounded-md",
          "bg-bg-elevated border border-border-subtle",
          "text-text-primary placeholder:text-text-tertiary",
          "transition-[border-color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-out)]",
          "focus-visible:outline-none focus-visible:border-border-accent focus-visible:ring-[3px] focus-visible:ring-border-accent/15",
          "disabled:opacity-40 disabled:pointer-events-none",
          mono ? "font-mono" : "font-sans",
          className,
        ].join(" ")}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";
