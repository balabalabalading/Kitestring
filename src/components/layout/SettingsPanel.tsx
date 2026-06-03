import { useState, useEffect } from "react";
import type { ToolPaths } from "../../types";
import * as tauri from "../../lib/tauri";
import { Dialog } from "../ui/Dialog";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { useTheme } from "../../hooks/useTheme";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  onSkillsCleared?: () => void;
  onSkillsImported?: () => void;
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

const NAV_ITEMS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "通用" },
  { id: "tools", label: "工具" },
  { id: "ignored", label: "忽略路径" },
  { id: "data", label: "数据" },
  { id: "about", label: "关于" },
];

export default function SettingsPanel({ open, onClose, onSkillsCleared, onSkillsImported }: SettingsPanelProps) {
  const { mode, setMode } = useTheme();
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [paths, setPaths] = useState<Record<string, ToolPaths>>({});
  const [ignoredPaths, setIgnoredPaths] = useState<string[]>([]);
  const [newIgnoredPath, setNewIgnoredPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [keepSymlinksOnClear, setKeepSymlinksOnClear] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoverResult, setDiscoverResult] = useState<string | null>(null);

  useEffect(() => {
    tauri.getAppConfig().then((config) => {
      setPaths({ ...config.tool_paths });
      setIgnoredPaths(config.ignored_paths ?? []);
      setLoading(false);
    }).catch((e) => {
      setError(String(e));
      setLoading(false);
    });
  }, []);

  function updatePath(tool: string, field: "global" | "project", value: string) {
    setPaths((prev) => ({
      ...prev,
      [tool]: { ...prev[tool], [field]: value },
    }));
    setSaved(false);
  }

  function addIgnoredPath() {
    const trimmed = newIgnoredPath.trim();
    if (!trimmed || ignoredPaths.includes(trimmed)) return;
    setIgnoredPaths((prev) => [...prev, trimmed]);
    setNewIgnoredPath("");
    setSaved(false);
  }

  function removeIgnoredPath(path: string) {
    setIgnoredPaths((prev) => prev.filter((p) => p !== path));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await tauri.updateToolPaths(paths);
      await tauri.updateIgnoredPaths(ignoredPaths);
      setSaved(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDiscover() {
    setDiscovering(true);
    setDiscoverResult(null);
    setError(null);
    try {
      const skills = await tauri.discoverSkills();
      setDiscoverResult(skills.length > 0
        ? `发现并导入了 ${skills.length} 个 Skill：${skills.map((s) => s.name).join("、")}`
        : "未发现新 Skill（已全部导入或路径中没有 SKILL.md）"
      );
      if (skills.length > 0) onSkillsImported?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setDiscovering(false);
    }
  }

  async function handleClearAll() {
    setClearing(true);
    setError(null);
    try {
      await tauri.deleteAllSkills(keepSymlinksOnClear);
      setConfirmClear(false);
      onSkillsCleared?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setClearing(false);
    }
  }

  const THEME_LABELS = { system: "跟随系统", light: "亮色", dark: "暗色" } as const;

  const discoverContent = (
    <>
      <div className="text-[11px] font-semibold text-text-secondary">初始化</div>
      <div className="text-[11px] text-text-tertiary">
        从各工具的全局 Skills 路径中发现并导入已有的 Skills
      </div>
      <button
        onClick={handleDiscover}
        disabled={discovering}
        className="self-start text-[11px] text-text-secondary px-[10px] h-6 rounded-sm transition-colors hover:text-text-primary disabled:opacity-50"
      >
        {discovering ? "扫描中..." : "从工具路径发现并导入 Skills"}
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
        <h2 className="text-sm font-bold text-text-primary">设置</h2>
        <Button variant="icon" onClick={onClose}>×</Button>
      </div>

      {/* Body: left nav + right content */}
      <div className="flex overflow-hidden" style={{ height: "504px" }}>
        {/* Left nav */}
        <nav className="w-[180px] shrink-0 border-r border-border-subtle overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => { setSettingsTab(item.id); setSaved(false); setError(null); setDiscoverResult(null); }}
              className={`w-full flex items-center text-left pl-5 pr-4 h-9 text-[13px] transition-colors border-l-2 ${
                settingsTab === item.id
                  ? "text-text-primary font-bold border-accent-sky"
                  : "text-text-tertiary hover:text-text-secondary border-transparent"
              }`}
              style={settingsTab === item.id ? { backgroundColor: "#212335" } : undefined}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Right content — bg-base, p-5, flex-col gap-3 */}
        <div className="flex-1 overflow-y-auto bg-bg-base p-5 flex flex-col gap-3 min-w-0">

          {/* 通用 */}
          {settingsTab === "general" && (
            <>
              <div className="text-sm font-bold text-text-primary">通用</div>
              <div className="text-[11px] font-semibold text-text-secondary">主题模式</div>
              <div className="flex gap-1.5">
                {(["system", "light", "dark"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`flex-1 text-[11px] h-7 rounded-sm flex items-center justify-center transition-colors ${
                      mode === m
                        ? "text-accent-sky"
                        : "text-text-tertiary hover:text-text-secondary"
                    }`}
                    style={mode === m ? { backgroundColor: "color-mix(in srgb, var(--accent-sky) 8%, transparent)" } : undefined}
                  >
                    {THEME_LABELS[m]}
                  </button>
                ))}
              </div>
              {discoverContent}
            </>
          )}

          {/* 工具 */}
          {settingsTab === "tools" && (
            <>
              <div className="text-sm font-bold text-text-primary">工具路径</div>
              <div className="text-[11px] text-text-tertiary">
                配置各 AI 工具的 Skill 目录路径（支持 ~ 路径）
              </div>
              {loading ? (
                <div className="text-[11px] text-text-tertiary py-4">加载中...</div>
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
                          {field === "global" ? "全局" : "项目"}
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
              <div className="flex justify-end">
                <Button variant="primary" size="sm" onClick={handleSave} disabled={saving || loading}>
                  {saving ? "保存中..." : "保存"}
                </Button>
              </div>
            </>
          )}

          {/* 忽略路径 */}
          {settingsTab === "ignored" && (
            <>
              <div className="text-sm font-bold text-text-primary">忽略路径</div>
              <div className="text-[11px] text-text-tertiary">
                以下路径在扫描时将被跳过（支持 glob 通配符，如 **/cache/**）
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
                    title="移除"
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
                  className="h-8 px-3 text-[11px] text-text-secondary bg-bg-raised rounded-sm hover:text-text-primary transition-colors shrink-0"
                >
                  添加
                </button>
              </div>
              <div className="flex justify-end">
                <Button variant="primary" size="sm" onClick={handleSave} disabled={saving || loading}>
                  {saving ? "保存中..." : "保存"}
                </Button>
              </div>
            </>
          )}

          {/* 数据 */}
          {settingsTab === "data" && (
            <>
              <div className="text-sm font-bold text-text-primary">数据</div>
              {discoverContent}
              <div className="h-px bg-border-subtle" />
              <div className="text-[11px] font-semibold text-status-broken">危险操作</div>
              <div className="text-[11px] text-text-tertiary">
                清除所有已导入的 Skills 记录（不删除文件系统内容）
              </div>
              {!confirmClear ? (
                <button
                  onClick={() => setConfirmClear(true)}
                  className="self-start text-[11px] text-status-broken px-[10px] h-6 rounded-sm transition-colors"
                  style={{ backgroundColor: "color-mix(in srgb, var(--status-broken) 8%, transparent)" }}
                >
                  清空所有 Skills
                </button>
              ) : (
                <>
                  <span className="text-[11px] text-status-broken">确认删除所有 Skills 及分发记录？</span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={keepSymlinksOnClear}
                      onChange={(e) => setKeepSymlinksOnClear(e.target.checked)}
                      className="w-3.5 h-3.5 accent-current"
                    />
                    <span className="text-[11px] text-text-secondary">保留 symlink，仅删除 Skill 记录</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleClearAll}
                      disabled={clearing}
                      className="text-[11px] text-status-broken px-[10px] h-6 rounded-sm disabled:opacity-50 transition-colors"
                      style={{ backgroundColor: "color-mix(in srgb, var(--status-broken) 8%, transparent)" }}
                    >
                      {clearing ? "清空中..." : "确认清空"}
                    </button>
                    <button
                      onClick={() => { setConfirmClear(false); setKeepSymlinksOnClear(false); }}
                      className="text-[11px] text-text-secondary px-[10px] h-6 rounded-sm bg-bg-elevated hover:text-text-primary transition-colors"
                    >
                      取消
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* 关于 */}
          {settingsTab === "about" && (
            <>
              <div className="text-sm font-bold text-text-primary">关于</div>
              <div className="flex flex-col gap-2 bg-bg-elevated rounded-md px-5 pt-6 pb-6">
                <div className="text-[22px] font-bold text-text-primary">Kitestring</div>
                <div className="text-[12px] text-text-secondary">AI Agent 技能包管理工具</div>
                <div className="text-[11px] text-text-tertiary">v0.1.0</div>
              </div>
              <div className="text-[11px] text-text-tertiary">© 2025 Kitestring. 基于 Tauri 2 构建</div>
              <div className="text-sm font-bold text-text-primary">联系我</div>
              <div className="text-[11px] font-semibold text-text-secondary whitespace-pre-line">
                {"我的邮箱：huz00036@gmail.com\nGithub 仓库地址：https://github.com/balabalabalading/Kitestring"}
              </div>
            </>
          )}

          {/* Feedback */}
          {error && (
            <div
              className="text-[11px] text-status-broken px-3 py-2 rounded-sm"
              style={{ backgroundColor: "color-mix(in srgb, var(--status-broken) 8%, transparent)" }}
            >
              {error}
            </div>
          )}
          {saved && (
            <div
              className="text-[11px] text-status-linked px-3 py-2 rounded-sm"
              style={{ backgroundColor: "color-mix(in srgb, var(--status-linked) 8%, transparent)" }}
            >
              已保存
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
