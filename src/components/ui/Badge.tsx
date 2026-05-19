interface SourceBadgeProps {
  type: "github" | "local";
}

function SourceBadge({ type }: SourceBadgeProps) {
  const color = type === "github" ? "bg-accent-sky" : "bg-accent-earth";
  const label = type === "github" ? "GitHub" : "本地";
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-text-tertiary">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${color}`} />
      {label}
    </span>
  );
}

interface ScopeBadgeProps {
  scope: "用户级" | "项目级";
}

function ScopeBadge({ scope }: ScopeBadgeProps) {
  return (
    <span className="text-[10px] text-text-tertiary bg-text-tertiary/6 px-1 py-0.5 rounded-sm leading-none">
      {scope}
    </span>
  );
}

type StatusType = "linked" | "pending" | "broken" | "none";

interface StatusBadgeProps {
  status: StatusType;
  showText?: boolean;
}

const statusConfig: Record<StatusType, { color: string; label: string }> = {
  linked: { color: "bg-status-linked", label: "已连接" },
  pending: { color: "bg-status-pending", label: "等待中" },
  broken: { color: "bg-status-broken", label: "已断开" },
  none: { color: "bg-status-none", label: "未分发" },
};

function StatusBadge({ status, showText = false }: StatusBadgeProps) {
  const { color, label } = statusConfig[status];
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${color}`} />
      {showText && <span className="text-[11px] text-text-secondary">{label}</span>}
    </span>
  );
}

export { SourceBadge, ScopeBadge, StatusBadge };
export type { StatusType };
