import { useI18n } from "../../i18n/I18nProvider";
import type { TranslationKey } from "../../i18n/I18nProvider";

interface SourceBadgeProps {
  type: "github" | "local";
}

function SourceBadge({ type }: SourceBadgeProps) {
  const { t } = useI18n();
  const color = type === "github" ? "bg-accent-sky" : "bg-accent-earth";
  const label = type === "github" ? t("common.github") : t("common.local");
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-text-tertiary">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${color}`} />
      {label}
    </span>
  );
}

type StatusType = "linked" | "pending" | "broken" | "none";

interface StatusBadgeProps {
  status: StatusType;
  showText?: boolean;
}

const statusConfig: Record<StatusType, { color: string; labelKey: TranslationKey }> = {
  linked: { color: "bg-status-linked", labelKey: "badge.status.linked" },
  pending: { color: "bg-status-pending", labelKey: "badge.status.pending" },
  broken: { color: "bg-status-broken", labelKey: "badge.status.broken" },
  none: { color: "bg-status-none", labelKey: "badge.status.none" },
};

function StatusBadge({ status, showText = false }: StatusBadgeProps) {
  const { t } = useI18n();
  const { color, labelKey } = statusConfig[status];
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${color}`} />
      {showText && <span className="text-[11px] text-text-secondary">{t(labelKey)}</span>}
    </span>
  );
}

export { SourceBadge, StatusBadge };
export type { StatusType };
