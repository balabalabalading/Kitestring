import type { DiagnosticItem, DiagnosticReport } from "./tauri";

export type SkillDiagnosticState = "sourceMissing" | "distributionBroken" | "distributionPending";

const CRITICAL_CODES = new Set([
  "config_unreadable",
  "config_dir_unwritable",
  "config_unwritable",
  "tool_path_expand_failed",
  "tool_path_not_directory",
  "tool_path_unreadable",
  "tool_path_unwritable",
]);

const SKILL_STATE_RANK: Record<SkillDiagnosticState, number> = {
  sourceMissing: 3,
  distributionBroken: 2,
  distributionPending: 1,
};

export function getCriticalDiagnostics(report: DiagnosticReport | null): DiagnosticItem[] {
  return report?.items.filter((item) => CRITICAL_CODES.has(item.code)) ?? [];
}

export function getSkillDiagnosticStates(report: DiagnosticReport | null): Map<string, SkillDiagnosticState> {
  const states = new Map<string, SkillDiagnosticState>();
  if (!report) return states;

  for (const item of report.items) {
    if (!item.skill_id) continue;
    let next: SkillDiagnosticState | null = null;
    if (item.code === "skill_source_missing") next = "sourceMissing";
    if (item.code === "distribution_broken") next = "distributionBroken";
    if (item.code === "distribution_pending") next = "distributionPending";
    if (!next) continue;

    const current = states.get(item.skill_id);
    if (!current || SKILL_STATE_RANK[next] > SKILL_STATE_RANK[current]) {
      states.set(item.skill_id, next);
    }
  }

  return states;
}

export function getSkillDiagnostics(report: DiagnosticReport | null, skillId: string): DiagnosticItem[] {
  if (!report) return [];
  return report.items.filter((item) => (
    item.skill_id === skillId
    && item.level !== "ok"
    && (
      item.code === "skill_source_missing"
      || item.code === "distribution_broken"
      || item.code === "distribution_pending"
    )
  ));
}

export function skillDiagnosticRank(state: SkillDiagnosticState | undefined): number {
  return state ? SKILL_STATE_RANK[state] : 0;
}
