import { ReactNode } from "react";

export type TagVariant = "default" | "sky" | "earth" | "warning" | "error";
export type TagSize = "xs" | "sm" | "md";

interface TagProps {
  variant?: TagVariant;
  size?: TagSize;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}

const variantClasses: Record<TagVariant, string> = {
  default:
    "bg-bg-surface border-border-subtle text-text-tertiary",
  sky: "bg-accent-sky/10 border-accent-sky/20 text-accent-sky",
  earth: "bg-accent-earth/12 border-accent-earth/25 text-accent-earth",
  warning: "bg-status-pending/10 border-status-pending/25 text-status-pending",
  error: "bg-status-broken/10 border-status-broken/25 text-status-broken",
};

const dotClasses: Record<TagVariant, string> = {
  default: "bg-text-tertiary/40",
  sky: "bg-accent-sky",
  earth: "bg-accent-earth",
  warning: "bg-status-pending",
  error: "bg-status-broken",
};

const sizeClasses: Record<TagSize, string> = {
  xs: "text-[9px] px-1 py-[1px] rounded-[3px]",
  sm: "text-[10px] px-1.5 py-0.5 rounded",
  md: "text-xs px-2 py-0.5 rounded-sm",
};

export function Tag({
  variant = "default",
  size = "sm",
  dot = false,
  children,
  className,
}: TagProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 leading-none font-medium border shrink-0",
        variantClasses[variant],
        sizeClasses[size],
        className ?? "",
      ].join(" ")}
    >
      {dot && (
        <span className={`w-1 h-1 rounded-full ${dotClasses[variant]}`} />
      )}
      {children}
    </span>
  );
}
