import { useState, useEffect, useRef } from "react";
import type { ToolPaths } from "../../types";
import type { DiagnosticItem, DiagnosticReport, DiagnosticLevel } from "../../lib/tauri";
import * as tauri from "../../lib/tauri";
import { Dialog } from "../ui/Dialog";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { useTheme } from "../../hooks/useTheme";
import { useI18n } from "../../i18n/I18nProvider";
import { translateError } from "../../i18n/errors";
import type { Locale } from "../../i18n/types";
import type { TranslationKey } from "../../i18n/I18nProvider";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  onSkillsCleared?: () => void;
  onSkillsImported?: () => void;
  diagnosticReport: DiagnosticReport | null;
  diagnosing: boolean;
  onRunDiagnostics: () => Promise<DiagnosticReport>;
  onDiagnosticsChanged: () => Promise<DiagnosticReport>;
}

const TOOLS = ["ClaudeCode", "CopilotCLI", "GeminiCLI", "Codex", "AgentFolder"] as const;
const TOOL_LABELS: Record<string, string> = {
  ClaudeCode: "Claude Code",
  CopilotCLI: "Copilot CLI",
  GeminiCLI: "Gemini CLI",
  Codex: "Codex",
  AgentFolder: "Agent Folder",
};

type SettingsTab = "general" | "tools" | "ignored" | "data" | "about";

const NAV_ITEMS: { id: SettingsTab; labelKey: TranslationKey }[] = [
  { id: "general", labelKey: "settings.nav.general" },
  { id: "tools", labelKey: "settings.nav.tools" },
  { id: "ignored", labelKey: "settings.nav.ignored" },
  { id: "data", labelKey: "settings.nav.data" },
  { id: "about", labelKey: "settings.nav.about" },
];

export default function SettingsPanel({ open, onClose, onSkillsCleared, onSkillsImported, diagnosticReport, diagnosing, onRunDiagnostics, onDiagnosticsChanged }: SettingsPanelProps) {
  const { mode, setMode } = useTheme();
  const { locale, setLocale, t } = useI18n();
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [paths, setPaths] = useState<Record<string, ToolPaths>>({});
  const [ignoredPaths, setIgnoredPaths] = useState<string[]>([]);
  const [newIgnoredPath, setNewIgnoredPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [rawError, setRawError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [keepSymlinksOnClear, setKeepSymlinksOnClear] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoverResult, setDiscoverResult] = useState<string | null>(null);
  const [diagnosticExpanded, setDiagnosticExpanded] = useState(false);
  const didLoadPathsRef = useRef(false);
  const didLoadIgnoredPathsRef = useRef(false);
  const previousAbnormalIdsRef = useRef(new Set<string>());

  useEffect(() => {
    tauri.getAppConfig().then((config) => {
      setPaths({ ...config.tool_paths });
      setIgnoredPaths(config.ignored_paths ?? []);
      setLoading(false);
    }).catch((e) => {
      setRawError(String(e));
      setLoading(false);
    });
  }, []);

  // 实时保存：paths 变化时自动保存
  useEffect(() => {
    if (loading) return;
    if (!didLoadPathsRef.current) {
      didLoadPathsRef.current = true;
      return;
    }
    const timer = window.setTimeout(() => {
      tauri.updateToolPaths(paths)
        .then(() => {
          void onDiagnosticsChanged().catch((error) => console.error("Diagnostics failed:", error));
        })
        .catch((e) => setRawError(String(e)));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [paths, loading, onDiagnosticsChanged]);

  // 实时保存：ignoredPaths 变化时自动保存
  useEffect(() => {
    if (loading) return;
    if (!didLoadIgnoredPathsRef.current) {
      didLoadIgnoredPathsRef.current = true;
      return;
    }
    tauri.updateIgnoredPaths(ignoredPaths).catch((e) => setRawError(String(e)));
  }, [ignoredPaths, loading]);

  function updatePath(tool: string, field: "global" | "project", value: string) {
    setPaths((prev) => ({
      ...prev,
      [tool]: { ...prev[tool], [field]: value },
    }));
  }

  function addIgnoredPath() {
    const trimmed = newIgnoredPath.trim();
    if (!trimmed || ignoredPaths.includes(trimmed)) return;
    setIgnoredPaths((prev) => [...prev, trimmed]);
    setNewIgnoredPath("");
  }

  function removeIgnoredPath(path: string) {
    setIgnoredPaths((prev) => prev.filter((p) => p !== path));
  }

  async function handleDiscover() {
    setDiscovering(true);
    setDiscoverResult(null);
    setRawError(null);
    try {
      const skills = await tauri.discoverSkills();
      setDiscoverResult(skills.length > 0
        ? t("settings.discoverResult", { count: skills.length, names: skills.map((s) => s.name).join("、") })
        : t("settings.noDiscoverResult")
      );
      if (skills.length > 0) onSkillsImported?.();
      void onDiagnosticsChanged().catch((error) => console.error("Diagnostics failed:", error));
    } catch (e) {
      setRawError(String(e));
    } finally {
      setDiscovering(false);
    }
  }

  async function handleClearAll() {
    setClearing(true);
    setRawError(null);
    try {
      await tauri.deleteAllSkills(keepSymlinksOnClear);
      setConfirmClear(false);
      onSkillsCleared?.();
      void onDiagnosticsChanged().catch((error) => console.error("Diagnostics failed:", error));
    } catch (e) {
      setRawError(String(e));
    } finally {
      setClearing(false);
    }
  }

  async function handleRunDiagnostics() {
    setRawError(null);
    try {
      await onRunDiagnostics();
    } catch (e) {
      setRawError(String(e));
    }
  }

  useEffect(() => {
    if (!diagnosticReport) return;
    const abnormalIds = new Set(
      diagnosticReport.items
        .filter((item) => item.level !== "ok")
        .map((item) => item.id)
    );
    const hasNewAbnormality = [...abnormalIds].some((id) => !previousAbnormalIdsRef.current.has(id));
    if (hasNewAbnormality) setDiagnosticExpanded(true);
    if (abnormalIds.size === 0 && previousAbnormalIdsRef.current.size === 0) {
      setDiagnosticExpanded(false);
    }
    previousAbnormalIdsRef.current = abnormalIds;
  }, [diagnosticReport]);

  const THEME_LABELS: Record<typeof mode, TranslationKey> = {
    system: "settings.theme.system",
    light: "settings.theme.light",
    dark: "settings.theme.dark",
  };
  const LANGUAGE_LABELS: { id: Locale; labelKey: TranslationKey }[] = [
    { id: "zh-CN", labelKey: "settings.language.zh" },
    { id: "en-US", labelKey: "settings.language.en" },
  ];

  function diagnosticTitle(item: DiagnosticItem): string {
    return t(diagnosticTextKeys[item.code]?.title ?? "settings.diagnostic.unknownTitle", {
      tool: item.tool ?? "",
      skill: item.skill_name ?? "",
      status: item.status ?? "",
    });
  }

  function diagnosticMessage(item: DiagnosticItem): string {
    return t(diagnosticTextKeys[item.code]?.message ?? "settings.diagnostic.unknownMessage", {
      tool: item.tool ?? "",
      skill: item.skill_name ?? "",
      status: item.status ?? "",
    });
  }

  function diagnosticAction(item: DiagnosticItem): string | null {
    const actionKey = diagnosticTextKeys[item.code]?.action;
    return actionKey ? t(actionKey) : null;
  }

  const discoverContent = (
    <>
      <div className="text-[11px] font-semibold text-text-secondary">{t("settings.init")}</div>
      <div className="text-[11px] text-text-tertiary">
        {t("settings.discoverHint")}
      </div>
      <button
        onClick={handleDiscover}
        disabled={discovering}
        className="self-start text-[11px] text-text-tertiary px-[10px] h-7 rounded-md border border-border-default transition-colors hover:text-text-secondary disabled:opacity-50"
      >
        {discovering ? t("settings.scanning") : t("settings.discoverButton")}
      </button>
      {discoverResult && (
        <div className="text-[11px] text-text-secondary bg-bg-elevated px-3 py-2 rounded-sm">
          {discoverResult}
        </div>
      )}
    </>
  );

  return (
    <Dialog open={open} onClose={onClose} width="w-[800px] max-w-[calc(100vw-2rem)]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle shrink-0">
        <h2 className="text-sm font-bold text-text-primary">{t("settings.title")}</h2>
        <Button variant="icon" onClick={onClose}>×</Button>
      </div>

      {/* Body: left nav + right content */}
      <div className="flex overflow-hidden" style={{ height: "504px" }}>
        {/* Left nav */}
        <nav className="w-[180px] shrink-0 border-r border-border-subtle overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => { setSettingsTab(item.id); setRawError(null); setDiscoverResult(null); }}
              className={`w-full flex items-center text-left pl-5 pr-4 h-9 text-[13px] transition-colors border-l-2 ${
                settingsTab === item.id
                  ? "text-text-primary font-bold border-accent-sky"
                  : "text-text-tertiary hover:text-text-secondary border-transparent"
              }`}
              style={settingsTab === item.id ? { backgroundColor: "color-mix(in srgb, var(--accent-sky) 10%, transparent)" } : undefined}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </nav>

        {/* Right content — bg-base, p-5, flex-col gap-3 */}
        <div className="flex-1 overflow-y-auto bg-bg-base p-5 flex flex-col gap-3 min-w-0">

          {/* 通用 */}
          {settingsTab === "general" && (
            <>
              <div className="text-sm font-bold text-text-primary">{t("settings.general")}</div>
              <div className="text-[11px] font-semibold text-text-secondary">{t("settings.themeMode")}</div>
              <div className="grid grid-cols-3 gap-1.5">
                {(["system", "light", "dark"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`text-[11px] h-7 rounded-md flex items-center justify-center transition-colors border ${
                      mode === m
                        ? "text-accent-sky border-accent-sky"
                        : "text-text-tertiary border-border-default hover:text-text-secondary"
                    }`}
                    style={mode === m ? { backgroundColor: "color-mix(in srgb, var(--accent-sky) 8%, transparent)" } : undefined}
                  >
                    {t(THEME_LABELS[m])}
                  </button>
                ))}
              </div>
              <div className="text-[11px] font-semibold text-text-secondary">{t("settings.language")}</div>
              <div className="grid grid-cols-3 gap-1.5">
                {LANGUAGE_LABELS.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setLocale(item.id)}
                    className={`text-[11px] h-7 rounded-md flex items-center justify-center transition-colors border ${
                      locale === item.id
                        ? "text-accent-sky border-accent-sky"
                        : "text-text-tertiary border-border-default hover:text-text-secondary"
                    }`}
                    style={locale === item.id ? { backgroundColor: "color-mix(in srgb, var(--accent-sky) 8%, transparent)" } : undefined}
                  >
                    {t(item.labelKey)}
                  </button>
                ))}
              </div>
              <div className="h-px bg-border-subtle" />
              <div className="text-[11px] font-semibold text-text-secondary">{t("settings.diagnostic.title")}</div>
              <div className={`flex flex-col gap-2 rounded-md border px-3 py-[10px] ${diagnosticContainerClass(diagnosticReport)}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] text-text-tertiary">
                      {t("settings.diagnostic.hint")}
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleRunDiagnostics}
                    disabled={diagnosing}
                    className="shrink-0"
                  >
                    {diagnosing ? t("settings.diagnostic.running") : t("settings.diagnostic.run")}
                  </Button>
                </div>
                {diagnosticReport && (
                  <>
                    <div className="flex items-center gap-2 rounded-sm bg-bg-base/70 px-2 py-1.5">
                      <div className="flex gap-2 min-w-0">
                        <DiagnosticPill level="ok" label={t("settings.diagnostic.ok")} count={diagnosticReport.summary.ok} />
                        <DiagnosticPill level="warning" label={t("settings.diagnostic.warning")} count={diagnosticReport.summary.warning} />
                        <DiagnosticPill level="error" label={t("settings.diagnostic.error")} count={diagnosticReport.summary.error} />
                      </div>
                      <Button
                        variant="icon"
                        onClick={() => setDiagnosticExpanded((value) => !value)}
                        className="ml-auto shrink-0"
                        aria-expanded={diagnosticExpanded}
                        title={diagnosticExpanded ? t("settings.diagnostic.collapse") : t("settings.diagnostic.expand")}
                      >
                        <svg className={`w-3.5 h-3.5 transition-transform ${diagnosticExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9l6 6 6-6" />
                        </svg>
                      </Button>
                    </div>
                    {diagnosticExpanded && (
                    <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
                      {[...diagnosticReport.items].sort((a, b) => levelRank(b.level) - levelRank(a.level)).map((item) => {
                        const action = diagnosticAction(item);
                        return (
                          <div
                            key={item.id}
                            className="rounded-sm border border-border-subtle bg-bg-base px-3 py-2"
                          >
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${diagnosticDotClass(item.level)}`} />
                              <span className="text-[11px] font-semibold text-text-primary truncate">
                                {diagnosticTitle(item)}
                              </span>
                            </div>
                            <div className="text-[11px] text-text-tertiary mt-1">
                              {diagnosticMessage(item)}
                            </div>
                            {item.path && (
                              <div className="text-[10px] font-mono text-text-tertiary mt-1 truncate" title={item.path}>
                                {item.path}
                              </div>
                            )}
                            {item.detail && (
                              <div className="text-[10px] text-status-broken mt-1 truncate" title={item.detail}>
                                {item.detail}
                              </div>
                            )}
                            {action && (
                              <div className="text-[10px] text-text-secondary mt-1">
                                {action}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    )}
                  </>
                )}
              </div>
              {discoverContent}
            </>
          )}

          {/* 工具 */}
          {settingsTab === "tools" && (
            <>
              <div className="text-sm font-bold text-text-primary">{t("settings.toolPaths")}</div>
              <div className="text-[11px] text-text-tertiary">
                {t("settings.toolPathsHint")}
              </div>
              {loading ? (
                <div className="text-[11px] text-text-tertiary py-4">{t("common.loading")}</div>
              ) : (
                TOOLS.map((tool) => (
                  <div key={tool} className="flex flex-col gap-2 bg-bg-elevated rounded-md px-3 py-[10px]">
                    <div className="text-[12px] font-bold text-text-primary">{TOOL_LABELS[tool]}</div>
                    {(["global", "project"] as const).map((field) => (
                      <div
                        key={field}
                        className="flex items-center gap-2 bg-bg-base rounded-[5px] h-7 pl-2 pr-2"
                      >
                        <span className="text-[11px] text-text-tertiary shrink-0 w-7">
                          {field === "global" ? t("settings.global") : t("common.project")}
                        </span>
                        <input
                          value={paths[tool]?.[field] ?? ""}
                          onChange={(e) => updatePath(tool, field, e.target.value)}
                          placeholder={field === "global" ? `~/.${tool.toLowerCase()}/skills/` : `.${tool.toLowerCase()}/skills/`}
                          className="flex-1 min-w-0 text-[11px] font-mono text-text-secondary bg-transparent outline-none placeholder:text-text-tertiary"
                        />
                      </div>
                    ))}
                  </div>
                ))
              )}
            </>
          )}

          {/* 忽略路径 */}
          {settingsTab === "ignored" && (
            <>
              <div className="text-sm font-bold text-text-primary">{t("settings.ignoredPaths")}</div>
              <div className="text-[11px] text-text-tertiary">
                {t("settings.ignoredPathsHint")}
              </div>
              {ignoredPaths.map((p) => (
                <div key={p} className="flex items-center gap-2">
                  <span
                    className="flex-1 text-[11px] font-mono text-text-secondary bg-bg-elevated pl-[10px] pr-2 h-8 flex items-center rounded-sm truncate"
                    title={p}
                  >
                    {p}
                  </span>
                  <button
                    onClick={() => removeIgnoredPath(p)}
                    className="text-[14px] leading-none text-text-tertiary hover:text-status-broken shrink-0 px-1 transition-colors"
                    title={t("settings.remove")}
                  >
                    ×
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <Input
                  mono
                  value={newIgnoredPath}
                  onChange={(e) => setNewIgnoredPath(e.target.value)}
                  placeholder="~/path/to/ignore/"
                  className="flex-1"
                  onKeyDown={(e) => e.key === "Enter" && addIgnoredPath()}
                />
                <button
                  onClick={addIgnoredPath}
                  className="h-8 px-3 text-[11px] text-text-secondary bg-bg-elevated rounded-sm hover:text-text-primary transition-colors shrink-0"
                >
                  {t("common.add")}
                </button>
              </div>
            </>
          )}

          {/* 数据 */}
          {settingsTab === "data" && (
            <>
              <div className="text-sm font-bold text-text-primary">{t("settings.data")}</div>
              {discoverContent}
              <div className="h-px bg-border-subtle" />
              <div className="text-[11px] font-semibold text-status-broken">{t("settings.dangerZone")}</div>
              <div className="text-[11px] text-text-tertiary">
                {t("settings.clearHint")}
              </div>
              {!confirmClear ? (
                <button
                  onClick={() => {
                    setKeepSymlinksOnClear(true);
                    setConfirmClear(true);
                  }}
                  className="self-start text-[11px] text-status-broken px-[10px] h-7 rounded-md border border-status-broken transition-colors"
                  style={{ backgroundColor: "color-mix(in srgb, var(--status-broken) 8%, transparent)" }}
                >
                  {t("settings.clearAll")}
                </button>
              ) : (
                <>
                  <span className="text-[11px] text-status-broken">{t("settings.clearConfirm")}</span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={keepSymlinksOnClear}
                      onChange={(e) => setKeepSymlinksOnClear(e.target.checked)}
                      className="w-3.5 h-3.5 accent-current"
                    />
                    <span className="text-[11px] text-text-secondary">{t("settings.keepSymlinks")}</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleClearAll}
                      disabled={clearing}
                      className="text-[11px] text-status-broken px-[10px] h-6 rounded-sm disabled:opacity-50 transition-colors"
                      style={{ backgroundColor: "color-mix(in srgb, var(--status-broken) 8%, transparent)" }}
                    >
                      {clearing ? t("settings.clearing") : t("settings.confirmClear")}
                    </button>
                    <button
                      onClick={() => { setConfirmClear(false); setKeepSymlinksOnClear(false); }}
                      className="text-[11px] text-text-secondary px-[10px] h-6 rounded-sm bg-bg-elevated hover:text-text-primary transition-colors"
                    >
                      {t("common.cancel")}
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* 关于 */}
          {settingsTab === "about" && (
            <>
              <div className="text-sm font-bold text-text-primary">{t("settings.about")}</div>
              <div className="flex flex-col items-center gap-2 bg-bg-elevated rounded-lg px-5 pt-6 pb-6">
                <div className="text-[22px] font-bold text-text-primary">Kitestring</div>
                <div className="text-[12px] text-text-secondary">{t("settings.aboutDescription")}</div>
                <div className="text-[11px] text-text-tertiary">v0.1.1</div>
              </div>
              <div className="text-[11px] text-text-tertiary">Copyright 2026 Kitestring</div>
              <div className="text-sm font-bold text-text-primary">{t("settings.contact")}</div>
              <div className="text-[11px] font-semibold text-text-secondary whitespace-pre-line">
                {t("settings.contactInfo")}
              </div>
            </>
          )}

          {/* Feedback */}
          {rawError && (
            <div
              className="text-[11px] text-status-broken px-3 py-2 rounded-sm"
              style={{ backgroundColor: "color-mix(in srgb, var(--status-broken) 8%, transparent)" }}
            >
              {translateError(rawError, locale)}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function diagnosticContainerClass(report: DiagnosticReport | null) {
  if (!report) return "bg-bg-elevated border-transparent";
  if (report.summary.error > 0) return "bg-status-broken/5 border-status-broken/25";
  if (report.summary.warning > 0) return "bg-status-pending/5 border-status-pending/25";
  return "bg-status-linked/5 border-status-linked/20";
}

function levelRank(level: DiagnosticLevel) {
  if (level === "error") return 3;
  if (level === "warning") return 2;
  return 1;
}

function diagnosticDotClass(level: DiagnosticLevel) {
  if (level === "error") return "bg-status-broken";
  if (level === "warning") return "bg-status-pending";
  return "bg-status-linked";
}

function DiagnosticPill({ level, label, count }: { level: DiagnosticLevel; label: string; count: number }) {
  const colorClass = level === "error"
    ? "text-status-broken border-status-broken/40"
    : level === "warning"
      ? "text-status-pending border-status-pending/40"
      : "text-status-linked border-status-linked/40";
  return (
    <div className={`h-7 px-2 rounded-sm border bg-bg-base flex items-center gap-1.5 min-w-0 ${colorClass}`}>
      <span className="text-[11px] font-semibold">{label}</span>
      <span className="text-[11px] font-mono">{count}</span>
    </div>
  );
}

const diagnosticTextKeys: Record<string, { title: TranslationKey; message: TranslationKey; action?: TranslationKey }> = {
  config_readable: {
    title: "settings.diagnostic.configReadable.title",
    message: "settings.diagnostic.configReadable.message",
  },
  config_writable: {
    title: "settings.diagnostic.configWritable.title",
    message: "settings.diagnostic.configWritable.message",
  },
  config_unreadable: {
    title: "settings.diagnostic.configUnreadable.title",
    message: "settings.diagnostic.configUnreadable.message",
    action: "settings.diagnostic.actionCheckConfig",
  },
  config_dir_unwritable: {
    title: "settings.diagnostic.configDirUnwritable.title",
    message: "settings.diagnostic.configDirUnwritable.message",
    action: "settings.diagnostic.actionCheckPermission",
  },
  config_unwritable: {
    title: "settings.diagnostic.configUnwritable.title",
    message: "settings.diagnostic.configUnwritable.message",
    action: "settings.diagnostic.actionCheckPermission",
  },
  tool_path_expand_failed: {
    title: "settings.diagnostic.toolPathExpandFailed.title",
    message: "settings.diagnostic.toolPathExpandFailed.message",
    action: "settings.diagnostic.actionUpdateToolPath",
  },
  tool_path_missing: {
    title: "settings.diagnostic.toolPathMissing.title",
    message: "settings.diagnostic.toolPathMissing.message",
    action: "settings.diagnostic.actionCreatePath",
  },
  tool_path_not_directory: {
    title: "settings.diagnostic.toolPathNotDirectory.title",
    message: "settings.diagnostic.toolPathNotDirectory.message",
    action: "settings.diagnostic.actionUpdateToolPath",
  },
  tool_path_readable: {
    title: "settings.diagnostic.toolPathReadable.title",
    message: "settings.diagnostic.toolPathReadable.message",
  },
  tool_path_unreadable: {
    title: "settings.diagnostic.toolPathUnreadable.title",
    message: "settings.diagnostic.toolPathUnreadable.message",
    action: "settings.diagnostic.actionCheckPermission",
  },
  tool_path_writable: {
    title: "settings.diagnostic.toolPathWritable.title",
    message: "settings.diagnostic.toolPathWritable.message",
  },
  tool_path_unwritable: {
    title: "settings.diagnostic.toolPathUnwritable.title",
    message: "settings.diagnostic.toolPathUnwritable.message",
    action: "settings.diagnostic.actionCheckPermission",
  },
  skill_source_exists: {
    title: "settings.diagnostic.skillSourceExists.title",
    message: "settings.diagnostic.skillSourceExists.message",
  },
  skill_source_missing: {
    title: "settings.diagnostic.skillSourceMissing.title",
    message: "settings.diagnostic.skillSourceMissing.message",
    action: "settings.diagnostic.actionDeleteRecord",
  },
  distribution_linked: {
    title: "settings.diagnostic.distributionLinked.title",
    message: "settings.diagnostic.distributionLinked.message",
  },
  distribution_pending: {
    title: "settings.diagnostic.distributionPending.title",
    message: "settings.diagnostic.distributionPending.message",
    action: "settings.diagnostic.actionRedistribute",
  },
  distribution_broken: {
    title: "settings.diagnostic.distributionBroken.title",
    message: "settings.diagnostic.distributionBroken.message",
    action: "settings.diagnostic.actionRedistribute",
  },
};
