import { useState, useEffect, useRef } from "react";
import type { Skill, Distribution, GitInfo, Tool, DistStatus, AppConfig } from "../../types";
import { TOOL_DISPLAY_NAMES } from "../../types";
import * as tauri from "../../lib/tauri";
import FileTree from "../skill/FileTree";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Dialog } from "../ui/Dialog";
import { Input } from "../ui/Input";
import { Tag } from "../ui/Tag";
import { useToast } from "../ui/Toast";
import { useI18n } from "../../i18n/I18nProvider";
import { translateError } from "../../i18n/errors";
import type { DiagnosticItem, DiagnosticReport } from "../../lib/tauri";
import { getSkillDiagnostics } from "../../lib/diagnostics";


interface DetailPanelProps {
  skill: Skill | null;
  totalSkillsCount: number;
  onSkillDeleted: (id: string) => void;
  onSkillPulled: () => void;
  onImport?: (tab: "local" | "github") => void;
  onDiscover?: () => void;
  onCreateProject?: () => void;
  onDiagnosticsChanged: () => Promise<tauri.DiagnosticReport>;
  diagnosticReport: DiagnosticReport | null;
}

const TOOLS: Tool[] = ["ClaudeCode", "CopilotCLI", "GeminiCLI", "Codex", "AgentFolder"];

export default function DetailPanel({ skill, totalSkillsCount, onSkillDeleted, onSkillPulled, onImport, onDiscover, onCreateProject, onDiagnosticsChanged, diagnosticReport }: DetailPanelProps) {
  const [distributions, setDistributions] = useState<Distribution[]>([]);
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);
  const [files, setFiles] = useState<tauri.FileNode[]>([]);
  const [distError, setDistError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [homeDir, setHomeDir] = useState("");
  const [detailReloadKey, setDetailReloadKey] = useState(0);
  const [addingPathTool, setAddingPathTool] = useState<Tool | null>(null);
  const [customPathInput, setCustomPathInput] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [keepSymlinks, setKeepSymlinks] = useState(false);
  const [highlightedTool, setHighlightedTool] = useState<{ tool: Tool; level: "error" | "warning" } | null>(null);
  const toolCardRefs = useRef(new Map<Tool, HTMLDivElement>());
  const highlightTimerRef = useRef<number | null>(null);

  const { showToast } = useToast();
  const { locale, t } = useI18n();

  useEffect(() => {
    tauri.getAppConfig().then(setAppConfig).catch(console.error);
    tauri.getHomeDir().then(setHomeDir).catch(console.error);
  }, []);

  // Reset UI state when skill changes
  useEffect(() => {
    if (skill) {
      setDistError(null);
      setActionError(null);
      setAddingPathTool(null);
      setCustomPathInput("");
      setConfirmDelete(false);
      setHighlightedTool(null);
      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = null;
      }
    }
  }, [skill]);

  useEffect(() => () => {
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
  }, []);

  // Load data when skill changes or after a reload is triggered
  useEffect(() => {
    if (skill) {
      tauri.checkDistributionStatus().then(setDistributions).catch(console.error);
      tauri.getGitInfo(skill.source_path).then(setGitInfo).catch(console.error);
      tauri.listSkillFiles(skill.id).then(setFiles).catch(console.error);
    } else {
      setDistributions([]);
      setGitInfo(null);
      setFiles([]);
    }
  }, [skill, detailReloadKey]);


  async function handleDelete() {
    if (!skill) return;
    setDeleting(true);
    setActionError(null);
    try {
      await tauri.deleteSkill(skill.id, keepSymlinks);
      onSkillDeleted(skill.id);
    } catch (e) {
      setActionError(translateError(e, locale));
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  async function handlePull() {
    if (!skill || pulling) return;
    setPulling(true);
    setActionError(null);
    try {
      const result = await tauri.pullGithubSkill(skill.id);
      onSkillPulled();
      setDetailReloadKey((k) => k + 1);
      showToast(result.updated ? t("toast.pullUpdated") : t("toast.pullUpToDate"));
    } catch (e) {
      setActionError(translateError(e, locale));
    } finally {
      setPulling(false);
    }
  }

  if (!skill) {
    // 首次启动：没有任何 Skill
    if (totalSkillsCount === 0) {
      return (
        <main className="flex-1 flex flex-col items-center justify-center text-text-tertiary px-8 py-12 overflow-y-auto min-h-full">
          <div className="flex flex-col gap-8 w-[540px]">
            {/* header */}
            <div className="flex flex-col gap-1 w-[488px]">
              <div className="flex items-center gap-1">
                <svg
                  width="38" height="34" viewBox="0 0 56 56" fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="animate-[kite-float_4s_ease-in-out_infinite] opacity-80 shrink-0"
                  style={{ color: "var(--accent-warm)" }}
                >
                  <path d="M28 4 L50 28 L28 48 L6 28 Z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round" />
                  <line x1="6" y1="28" x2="50" y2="28" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round" />
                  <line x1="28" y1="4" x2="28" y2="48" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round" />
                  <path d="M28 48 Q30 52 28 58" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                </svg>
                <p style={{ fontFamily: "var(--font-serif)", fontSize: "24px", fontWeight: 500, color: "var(--text-primary)" }}>
                  {t("onboarding.title")}
                </p>
              </div>
              <p className="text-[13px] text-text-secondary">
                {t("onboarding.subtitle")}
              </p>
            </div>

            {/* skill import */}
            <div className="flex flex-col gap-3">
              <p style={{ fontFamily: "var(--font-serif)", fontSize: "18px", fontWeight: 500, color: "var(--text-primary)" }}>
                {t("onboarding.importTitle")}
              </p>

              <div className="flex flex-col gap-3">
                <p className="text-[14px] text-text-primary" style={{ fontFamily: "var(--font-serif)", fontWeight: 500 }}>
                  {t("onboarding.importIntro")}
                </p>

                {/* 方式 1：检索工具路径 */}
                <div className="flex flex-col gap-1">
                  <p className="text-[13px] text-text-secondary">{t("onboarding.discoverText")}</p>
                  <Button
                    variant="primary"
                    size="sm"
                    className="self-start"
                    onClick={onDiscover}
                  >
                    {t("onboarding.discoverButton")}
                  </Button>
                </div>

                {/* 方式 2：本地文件夹 */}
                <div className="flex flex-col gap-1">
                  <p className="text-[13px] text-text-secondary">{t("onboarding.localText")}</p>
                  <Button
                    variant="primary"
                    size="sm"
                    className="self-start"
                    onClick={() => onImport?.("local")}
                  >
                    {t("onboarding.localButton")}
                  </Button>
                </div>

                {/* 方式 3：GitHub */}
                <div className="flex flex-col gap-1">
                  <p className="text-[13px] text-text-secondary">{t("onboarding.githubText")}</p>
                  <Button
                    variant="primary"
                    size="sm"
                    className="self-start"
                    onClick={() => onImport?.("github")}
                  >
                    {t("onboarding.githubButton")}
                  </Button>
                </div>

                <div className="flex flex-col gap-1 pt-4">
                  <p className="text-[14px] text-text-primary" style={{ fontFamily: "var(--font-serif)", fontWeight: 500 }}>
                    {t("onboarding.projectIntro")}
                  </p>
                  <p className="text-[13px] text-text-secondary">{t("onboarding.projectText")}</p>
                  <Button
                    variant="primary"
                    size="sm"
                    className="self-start"
                    onClick={onCreateProject}
                  >
                    {t("onboarding.projectButton")}
                  </Button>
                </div>
              </div>
            </div>

            {/* skill export */}
            <div className="flex flex-col gap-3">
              <p style={{ fontFamily: "var(--font-serif)", fontSize: "18px", fontWeight: 500, color: "var(--text-primary)" }}>
                {t("onboarding.distributeTitle")}
              </p>
              <p className="text-[13px] text-text-secondary">
                {t("onboarding.distributeText")}
              </p>
            </div>
          </div>
        </main>
      );
    }
    // 有 Skill 但未选中
    return (
      <main className="flex-1 flex flex-col items-center justify-center gap-4 text-text-tertiary">
        <svg
          width="56" height="56" viewBox="0 0 56 56" fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="animate-[kite-float_4s_ease-in-out_infinite] opacity-70"
          style={{ color: "var(--accent-warm)" }}
        >
          <path d="M28 4 L50 28 L28 48 L6 28 Z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round" />
          <line x1="6" y1="28" x2="50" y2="28" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round" />
          <line x1="28" y1="4" x2="28" y2="48" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round" />
          <path d="M28 48 Q30 52 28 58" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        </svg>
        <p style={{ fontFamily: "var(--font-serif)", fontSize: "16px" }}>
          {t("detail.selectSkill")}
        </p>
      </main>
    );
  }

  const skillDists = distributions.filter((d) => d.skill_id === skill.id);
  const skillDiagnosticItems = getSkillDiagnostics(diagnosticReport, skill.id);
  const sourceMissingItem = skillDiagnosticItems.find((item) => item.code === "skill_source_missing") ?? null;
  const brokenDiagnosticItems = skillDiagnosticItems.filter((item) => item.code === "distribution_broken");
  const pendingDiagnosticItems = skillDiagnosticItems.filter((item) => item.code === "distribution_pending");
  const hasDiagnosticError = sourceMissingItem !== null || brokenDiagnosticItems.length > 0;

  function getDiagnosticTool(item: DiagnosticItem): Tool | null {
    const distribution = item.distribution_id
      ? skillDists.find((dist) => dist.id === item.distribution_id)
      : null;
    if (distribution) return distribution.tool;
    return TOOLS.find((tool) => tool === item.tool || TOOL_DISPLAY_NAMES[tool] === item.tool) ?? null;
  }

  function getDiagnosticTools(items: DiagnosticItem[]): Tool[] {
    const itemTools = new Set(items.map(getDiagnosticTool).filter((tool): tool is Tool => tool !== null));
    return TOOLS.filter((tool) => itemTools.has(tool));
  }

  const brokenTools = getDiagnosticTools(brokenDiagnosticItems);
  const pendingTools = getDiagnosticTools(pendingDiagnosticItems);
  const hasLocatableDistributionIssue = brokenTools.length > 0 || pendingTools.length > 0;

  function formatToolNames(tools: Tool[], items: DiagnosticItem[]): string {
    const names = tools.length > 0
      ? tools.map((tool) => TOOL_DISPLAY_NAMES[tool])
      : [...new Set(items.map((item) => item.tool).filter((tool): tool is string => Boolean(tool)))];
    return names.join(locale === "zh-CN" ? "、" : ", ");
  }

  function locateDistributionIssue() {
    const targetTool = brokenTools[0] ?? pendingTools[0];
    if (!targetTool) return;
    const level = brokenTools.includes(targetTool) ? "error" : "warning";
    toolCardRefs.current.get(targetTool)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedTool({ tool: targetTool, level });
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightedTool(null);
      highlightTimerRef.current = null;
    }, 1600);
  }

  function statusStyle(status: DistStatus | "none"): { backgroundColor: string } {
    switch (status) {
      case "Linked":  return { backgroundColor: "var(--status-linked)" };
      case "Broken":  return { backgroundColor: "var(--status-broken)" };
      case "Pending": return { backgroundColor: "var(--status-pending)" };
      default:        return { backgroundColor: "var(--text-tertiary)" };
    }
  }

  function getExpandedGlobalPath(tool: Tool): string {
    if (!homeDir || !appConfig || !skill) return "";
    const globalPath = appConfig.tool_paths[tool]?.global ?? "";
    const expanded = globalPath.replace(/^~/, homeDir);
    const withSlash = expanded.endsWith("/") ? expanded : expanded + "/";
    return withSlash + skill.name;
  }

  function getGlobalDist(tool: Tool): Distribution | null {
    const expanded = getExpandedGlobalPath(tool);
    if (!expanded) return null;
    return skillDists.find((d) => d.tool === tool && d.target_path === expanded) ?? null;
  }

  function getCustomDists(tool: Tool): Distribution[] {
    const globalPath = getExpandedGlobalPath(tool);
    const extraExpandedPaths = getExpandedExtraGlobals(tool).map((e) => e.path);
    const projPath = getProjectRelativeSourcePath(tool);
    return skillDists.filter((d) => {
      if (d.tool !== tool) return false;
      if (d.target_path === globalPath) return false;
      // Use startsWith to exclude distributions nested inside any extra_global path
      if (extraExpandedPaths.some((ep) => d.target_path.startsWith(ep + "/"))) return false;
      // Exclude distributions already represented by the project-relative source row
      if (projPath && d.target_path.startsWith(projPath + "/")) return false;
      return true;
    });
  }

  /** Expand extra_globals for a tool to absolute paths with folder/parent info */
  function getExpandedExtraGlobals(tool: Tool): Array<{ path: string; folderName: string; parentPath: string }> {
    if (!homeDir || !appConfig) return [];
    const tp = appConfig.tool_paths[tool];
    if (!tp?.extra_globals?.length) return [];
    return tp.extra_globals.map((eg) => {
      const expanded = eg.replace(/^~/, homeDir).replace(/\/$/, "");
      const parts = expanded.split("/");
      const folderName = parts[parts.length - 1] ?? "";
      const parentPath = parts.slice(0, -1).join("/") + "/";
      return { path: expanded, folderName, parentPath };
    });
  }

  /** Returns true if the skill source lives directly inside the given absolute path */
  function isFileSourceForPath(expandedPath: string): boolean {
    if (!skill) return false;
    const normalizedSkill = skill.source_path.replace(/\/$/, "");
    const normalizedPath = expandedPath.replace(/\/$/, "");
    return normalizedSkill.startsWith(normalizedPath + "/") || normalizedSkill === normalizedPath;
  }

  /** Returns true if the skill's source directory lives inside this tool's global path */
  function isFileSource(tool: Tool): boolean {
    if (!skill || !homeDir || !appConfig) return false;
    const globalExpanded = getExpandedGlobalPath(tool);
    if (isFileSourceForPath(globalExpanded.replace(/\/[^/]+$/, ""))) return true; // parent dir of target
    return false;
  }

  /**
   * For skills in project-relative paths not covered by global/extra_globals
   * (e.g., iCloud vault/.claude/skills/SkillName), returns the container dir path.
   */
  function getProjectRelativeSourcePath(tool: Tool): string | null {
    if (!skill || !homeDir || !appConfig) return null;
    const tp = appConfig.tool_paths[tool];
    if (!tp?.project) return null;

    // Check if already covered by global
    const globalDir = getExpandedGlobalPath(tool).replace(/\/[^/]+$/, "");
    if (isFileSourceForPath(globalDir)) return null;

    // Check if already covered by extra_globals
    for (const eg of getExpandedExtraGlobals(tool)) {
      if (isFileSourceForPath(eg.path)) return null;
    }

    // Check for project-relative pattern (e.g., "/.claude/skills/")
    const pattern = "/" + tp.project.replace(/^\//, "").replace(/\/$/, "") + "/";
    const idx = skill.source_path.indexOf(pattern);
    if (idx < 0) return null;
    return skill.source_path.substring(0, idx + pattern.length - 1);
  }

  function getGlobalDisplayPath(tool: Tool): string {
    const expanded = getExpandedGlobalPath(tool);
    if (expanded) {
      const parts = expanded.split("/");
      parts.pop();
      return parts.join("/") + "/";
    }
    // Fallback to config path before homeDir loaded
    const globalPath = appConfig?.tool_paths[tool]?.global ?? "";
    return globalPath.endsWith("/") ? globalPath : globalPath + "/";
  }

  async function handleDistribute(tool: Tool, scope: string) {
    if (!skill) return;
    setDistError(null);
    try {
      const dist = await tauri.distributeSkill(skill.id, tool, scope);
      setDistributions((prev) => [...prev, dist]);
      void onDiagnosticsChanged().catch((error) => console.error("Diagnostics failed:", error));
    } catch (e) {
      setDistError(translateError(e, locale));
    }
  }

  async function handleDistributeToDir(tool: Tool, dir: string) {
    if (!skill || !dir.trim()) return;
    setDistError(null);
    try {
      const dist = await tauri.distributeToDir(skill.id, tool, dir.trim());
      setDistributions((prev) => [...prev, dist]);
      setAddingPathTool(null);
      setCustomPathInput("");
      void onDiagnosticsChanged().catch((error) => console.error("Diagnostics failed:", error));
    } catch (e) {
      setDistError(translateError(e, locale));
    }
  }

  async function handleRemoveDist(distId: string) {
    try {
      await tauri.removeDistribution(distId);
      setDistributions((prev) => prev.filter((d) => d.id !== distId));
      void onDiagnosticsChanged().catch((error) => console.error("Diagnostics failed:", error));
    } catch (e) {
      console.error("Remove distribution failed:", e);
    }
  }

  const canPull = gitInfo?.is_git_repo === true;

  return (
    <>
      {/* Delete confirmation dialog */}
      <Dialog open={confirmDelete} onClose={() => { setConfirmDelete(false); setActionError(null); }}>
        <div className="p-6">
          <h3 className="text-[14px] font-normal text-text-primary mb-2">{t("detail.deleteSkill")}</h3>
          <p className="text-[13px] text-text-secondary mb-1">
            {t("detail.deleteConfirm", { name: skill.name })}
          </p>
          <p className="text-[13px] text-text-tertiary mb-4">
            {t("detail.deleteKeepsFolder")}
          </p>
          {actionError && (
            <div className="mb-3 text-xs px-3 py-1.5 rounded-md" style={{ color: "var(--status-broken)", backgroundColor: "color-mix(in srgb, var(--status-broken) 10%, transparent)" }}>{actionError}</div>
          )}
          <div className="flex flex-col gap-2">
            {distributions.filter((d) => d.entry_type === "Symlink").length > 0 && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => { setKeepSymlinks(false); handleDelete(); }}
                disabled={deleting}
                className="w-full justify-start"
                danger
              >
                {deleting ? t("common.deleting") : t("detail.deleteAndClean", { count: distributions.filter((d) => d.entry_type === "Symlink").length })}
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { setKeepSymlinks(true); handleDelete(); }}
              disabled={deleting}
              className="w-full justify-start"
            >
              {deleting ? t("common.deleting") : t("detail.deleteRecordOnly")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setConfirmDelete(false); setActionError(null); }}
              className="w-full justify-center"
            >
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      </Dialog>

    <main key={skill.id} className="flex-1 flex flex-col px-6 py-8 min-h-0 overflow-y-auto gap-6 animate-[panel-enter_200ms_var(--ease-out)_both]">

      {/* Identity Card */}
      <div className="bg-bg-elevated rounded-lg px-6 py-3 flex flex-col gap-3 shrink-0">
        {/* Head: title + tags + description */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h2 className="text-[22px] font-medium text-text-primary leading-tight">
              {skill.name}
            </h2>
            <div className="flex items-center gap-[7px]">
              {skill.source_type === "Github" ? (
                <Tag variant="sky" size="md">GitHub</Tag>
              ) : (
                <>
                  <Tag variant="earth" size="md">{t("common.local")}</Tag>
                  {skill.has_git && <Tag variant="sky" size="md">GitHub</Tag>}
                </>
              )}
            </div>
          </div>
          {skill.description && (
            <p className="text-[13px] text-text-secondary leading-relaxed">{skill.description}</p>
          )}
        </div>

        {/* Path + Git info */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-semibold text-text-tertiary shrink-0">{t("common.path")}</span>
            <span className="text-[10px] text-text-secondary font-mono truncate">{skill.source_path}</span>
          </div>
          {gitInfo?.is_git_repo && (
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-semibold text-text-tertiary shrink-0">Git</span>
              <span className="text-[10px] text-text-secondary">
                {gitInfo.branch}
                {gitInfo.commit_count ? ` · ${gitInfo.commit_count} commits` : ""}
                {gitInfo.last_commit_time ? ` · ${t("detail.updatedAt", { date: gitInfo.last_commit_time.slice(0, 10) })}` : ""}
              </span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          {canPull && (
            <Button variant="secondary" size="sm" onClick={handlePull} disabled={pulling}>
              {pulling ? t("detail.pulling") : t("detail.pullUpdate")}
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { setConfirmDelete(true); setKeepSymlinks(false); setActionError(null); }}
            danger
          >
            {t("common.delete")}
          </Button>
        </div>
      </div>

      {skillDiagnosticItems.length > 0 && (
        <div
          role="alert"
          className={`flex flex-wrap items-start gap-3 border-l-2 rounded-sm px-4 py-3 shrink-0 ${
            hasDiagnosticError
              ? "border-status-broken bg-status-broken/8"
              : "border-status-pending bg-status-pending/8"
          }`}
        >
          <svg
            className={`w-4 h-4 mt-0.5 shrink-0 ${hasDiagnosticError ? "text-status-broken" : "text-status-pending"}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.3 4.7L2.9 17.5A1.7 1.7 0 004.4 20h15.2a1.7 1.7 0 001.5-2.5L13.7 4.7a1.7 1.7 0 00-3.4 0z" />
          </svg>
          <div className="flex-1 min-w-[220px]">
            <div className={`text-[12px] font-semibold ${hasDiagnosticError ? "text-status-broken" : "text-status-pending"}`}>
              {sourceMissingItem
                ? t("detail.diagnostic.sourceMissingTitle")
                : brokenDiagnosticItems.length > 0
                  ? t("detail.diagnostic.brokenTitle")
                  : t("detail.diagnostic.pendingTitle")}
            </div>
            <div className="mt-1 flex flex-col gap-0.5 text-[11px] text-text-secondary leading-relaxed">
              {sourceMissingItem && (
                <div className="break-all">
                  {t("detail.diagnostic.sourcePath", { path: sourceMissingItem.path ?? skill.source_path })}
                </div>
              )}
              {brokenDiagnosticItems.length > 0 && (
                <div>
                  {t("detail.diagnostic.brokenSummary", {
                    count: brokenDiagnosticItems.length,
                    tools: formatToolNames(brokenTools, brokenDiagnosticItems),
                  })}
                </div>
              )}
              {pendingDiagnosticItems.length > 0 && (
                <div>
                  {t("detail.diagnostic.pendingSummary", {
                    count: pendingDiagnosticItems.length,
                    tools: formatToolNames(pendingTools, pendingDiagnosticItems),
                  })}
                </div>
              )}
            </div>
          </div>
          {hasLocatableDistributionIssue && (
            <Button variant="secondary" size="sm" onClick={locateDistributionIssue} className="shrink-0 ml-7 sm:ml-0">
              {t("detail.diagnostic.locate")}
            </Button>
          )}
        </div>
      )}

      {/* Tools section */}
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold text-text-primary">{t("common.tools")}</p>
        {distError && (
          <div className="text-xs px-3 py-1.5 rounded-md" style={{ color: "var(--status-broken)", backgroundColor: "color-mix(in srgb, var(--status-broken) 10%, transparent)" }}>
            {distError}
          </div>
        )}
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
          {TOOLS.map((tool) => {
            const globalDist = getGlobalDist(tool);
            const customDists = getCustomDists(tool);
            const globalParentPath = getGlobalDisplayPath(tool);
            const globalParentParts = globalParentPath.replace(/\/$/, "").split("/");
            const globalFolderName = globalParentParts[globalParentParts.length - 1] ?? "skills";
            const globalGrandparentPath = globalParentParts.slice(0, -1).join("/") + "/";
            const isAddingForTool = addingPathTool === tool;
            const extraGlobals = getExpandedExtraGlobals(tool);
            const projRelPath = getProjectRelativeSourcePath(tool);
            return (
              <Card
                key={tool}
                ref={(node) => {
                  if (node) toolCardRefs.current.set(tool, node);
                  else toolCardRefs.current.delete(tool);
                }}
                variant="tool"
                className={highlightedTool?.tool === tool
                  ? highlightedTool.level === "error"
                    ? "ring-2 ring-status-broken ring-offset-2 ring-offset-bg-base"
                    : "ring-2 ring-status-pending ring-offset-2 ring-offset-bg-base"
                  : ""
                }
              >
                {/* Tool card header */}
                <div className="flex items-center justify-between px-6 py-2 bg-bg-surface">
                  <span className="text-[13px] font-semibold text-text-primary">{TOOL_DISPLAY_NAMES[tool]}</span>
                  <Button
                    variant="icon"
                    onClick={() => {
                      setAddingPathTool(isAddingForTool ? null : tool);
                      setCustomPathInput("");
                      setDistError(null);
                    }}
                    title={t("detail.addCustomPath")}
                  >
                    +
                  </Button>
                </div>

                {/* Distribution rows container */}
                <div className="px-6 py-3 flex flex-col gap-3">
                  {/* Global path row */}
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={isFileSource(tool) ? { backgroundColor: "var(--status-linked)" } : statusStyle(globalDist?.status ?? "none")} />
                    <Tag variant="default" size="xs">{t("common.userLevel")}</Tag>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-text-primary truncate">{globalFolderName}</div>
                      <div className="text-[10px] text-text-tertiary truncate" title={globalGrandparentPath}>
                        {globalGrandparentPath}
                      </div>
                    </div>
                    {isFileSource(tool) ? (
                      <Tag variant="default" size="sm">{t("detail.fileSource")}</Tag>
                    ) : globalDist ? (
                      <Button variant="secondary" size="sm" onClick={() => handleRemoveDist(globalDist.id)} className="shrink-0">{t("common.cancel")}</Button>
                    ) : (
                      <Button variant="primary" size="sm" onClick={() => handleDistribute(tool, "Global")} className="shrink-0">{t("common.distribute")}</Button>
                    )}
                  </div>

                  {/* Extra global path rows */}
                  {extraGlobals.map((eg) => {
                    const egDist = skillDists.find((d) => d.tool === tool && d.target_path === eg.path + "/" + skill.name);
                    const egIsFileSource = isFileSourceForPath(eg.path);
                    return (
                      <div key={eg.path} className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={statusStyle(egIsFileSource ? "Linked" : egDist?.status ?? "none")} />
                        <Tag variant="default" size="xs">{t("common.userLevel")}</Tag>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] text-text-primary truncate">{eg.folderName}/*/skills</div>
                          <div className="text-[10px] text-text-tertiary truncate" title={eg.parentPath}>
                            {eg.parentPath}
                          </div>
                        </div>
                        {egIsFileSource ? (
                          <Tag variant="default" size="sm">{t("detail.fileSource")}</Tag>
                        ) : egDist ? (
                          <Button variant="secondary" size="sm" onClick={() => handleRemoveDist(egDist.id)} className="shrink-0">{t("common.cancel")}</Button>
                        ) : (
                          <Button variant="primary" size="sm" onClick={() => handleDistributeToDir(tool, eg.path)} className="shrink-0">{t("common.distribute")}</Button>
                        )}
                      </div>
                    );
                  })}

                  {/* Project-relative source path */}
                  {projRelPath && (() => {
                    const parts = projRelPath.replace(/\/$/, "").split("/");
                    const folderName = parts[parts.length - 1] ?? "";
                    const parentPath = parts.slice(0, -1).join("/") + "/";
                    return (
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: "var(--status-linked)" }} />
                        <Tag variant="default" size="xs">{t("common.projectLevel")}</Tag>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] text-text-primary truncate">{folderName}</div>
                          <div className="text-[10px] text-text-tertiary truncate" title={parentPath}>
                            {parentPath}
                          </div>
                        </div>
                        <Tag variant="default" size="sm">{t("detail.fileSource")}</Tag>
                      </div>
                    );
                  })()}

                  {/* Custom distribution rows */}
                  {customDists.map((dist) => {
                    const parts = dist.target_path.replace(/\/$/, "").split("/");
                    const containerName = parts[parts.length - 2] ?? parts[parts.length - 1] ?? "";
                    const grandparentPath = parts.slice(0, -2).join("/") + "/";
                    return (
                      <div key={dist.id} className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={statusStyle(dist.status)} />
                        <Tag variant="default" size="xs">{t("common.projectLevel")}</Tag>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] text-text-primary truncate">{containerName}</div>
                          <div className="text-[10px] text-text-tertiary truncate" title={grandparentPath}>
                            {grandparentPath}
                          </div>
                        </div>
                        <Button variant="secondary" size="sm" onClick={() => handleRemoveDist(dist.id)} className="shrink-0">{t("common.cancel")}</Button>
                      </div>
                    );
                  })}

                  {/* Add custom path input */}
                  {isAddingForTool && (
                    <div className="flex flex-col gap-1.5">
                      <Input
                        mono
                        value={customPathInput}
                        onChange={(e) => setCustomPathInput(e.target.value)}
                        placeholder="~/path/to/skills/"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleDistributeToDir(tool, customPathInput);
                          if (e.key === "Escape") { setAddingPathTool(null); setCustomPathInput(""); }
                        }}
                      />
                      <div className="flex gap-1.5">
                        <Button variant="primary" size="sm" onClick={() => handleDistributeToDir(tool, customPathInput)} className="flex-1">{t("common.confirm")}</Button>
                        <Button variant="ghost" size="sm" onClick={() => { setAddingPathTool(null); setCustomPathInput(""); }}>{t("common.cancel")}</Button>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Files section */}
      <div className="flex flex-col gap-2 shrink-0">
        <p className="text-[11px] font-semibold text-text-primary">{t("detail.files")}</p>
        <div className="rounded-lg bg-bg-elevated p-2 w-full max-w-[260px]">
          {files.length > 0 ? (
            <FileTree
              nodes={files}
              onFileSelect={() => {}}
              selectedPath={undefined}
            />
          ) : (
            <div className="py-1 px-2 text-[11px] text-text-tertiary">{t("common.loading")}</div>
          )}
        </div>
      </div>
    </main>
  </>
  );
}
