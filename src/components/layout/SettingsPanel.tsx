import { useState, useEffect } from "react";
import type { ToolPaths } from "../../types";
import * as tauri from "../../lib/tauri";
import { Drawer } from "../ui/Drawer";
import { Card } from "../ui/Card";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { useTheme } from "../../hooks/useTheme";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  onSkillsCleared?: () => void;
}

const TOOLS = ["ClaudeCode", "CopilotCLI", "GeminiCLI", "Codex", "AgentFolder"] as const;
const TOOL_LABELS: Record<string, string> = {
  ClaudeCode: "Claude Code",
  CopilotCLI: "Copilot CLI",
  GeminiCLI: "Gemini CLI",
  Codex: "Codex",
  AgentFolder: "Agent Folder",
};

export default function SettingsPanel({ open, onClose, onSkillsCleared }: SettingsPanelProps) {
  const { mode, setMode } = useTheme();
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
      if (skills.length > 0) onSkillsCleared?.();
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

  return (
    <Drawer open={open} onClose={onClose}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle shrink-0">
        <h2 className="text-base font-semibold text-text-primary">设置</h2>
        <Button variant="icon" onClick={onClose}>×</Button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <p className="text-xs text-text-tertiary">
          配置各 AI 工具的 Skill 目录路径（支持 ~ 路径）
        </p>

        {loading ? (
          <div className="text-sm text-text-tertiary py-4">加载中...</div>
        ) : (
          <div className="space-y-3">
            {TOOLS.map((tool) => (
              <Card key={tool} variant="base" className="p-3">
                <div className="text-xs font-semibold text-text-primary mb-2">
                  {TOOL_LABELS[tool]}
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-tertiary w-10 shrink-0">全局</span>
                    <Input
                      mono
                      value={paths[tool]?.global ?? ""}
                      onChange={(e) => updatePath(tool, "global", e.target.value)}
                      placeholder={`~/.${tool.toLowerCase()}/skills/`}
                      className="flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-tertiary w-10 shrink-0">项目</span>
                    <Input
                      mono
                      value={paths[tool]?.project ?? ""}
                      onChange={(e) => updatePath(tool, "project", e.target.value)}
                      placeholder={`.${tool.toLowerCase()}/skills/`}
                      className="flex-1"
                    />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Ignored paths */}
        <div className="pt-4 border-t border-dashed border-border-subtle">
          <div className="text-xs font-semibold text-text-primary mb-1">忽略路径</div>
          <p className="text-xs text-text-tertiary mb-3">
            以下路径将在发现扫描中被跳过
          </p>
          <div className="space-y-1.5 mb-2">
            {ignoredPaths.map((p) => (
              <div key={p} className="flex items-center gap-2">
                <span
                  className="flex-1 text-xs font-mono text-text-secondary bg-bg-base px-2.5 py-1.5 rounded-md border border-border-subtle truncate"
                  title={p}
                >
                  {p}
                </span>
                <button
                  onClick={() => removeIgnoredPath(p)}
                  className="text-xs text-text-tertiary hover:text-status-broken shrink-0 px-1 transition-colors"
                  title="移除"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              mono
              value={newIgnoredPath}
              onChange={(e) => setNewIgnoredPath(e.target.value)}
              placeholder="~/path/to/ignore/"
              className="flex-1"
              onKeyDown={(e) => e.key === "Enter" && addIgnoredPath()}
            />
            <Button variant="secondary" size="sm" onClick={addIgnoredPath}>添加</Button>
          </div>
        </div>

        {/* Feedback */}
        {error && (
          <div
            className="text-xs text-status-broken px-3 py-2 rounded-md"
            style={{ backgroundColor: "color-mix(in srgb, var(--status-broken) 8%, transparent)" }}
          >
            {error}
          </div>
        )}
        {saved && (
          <div
            className="text-xs text-status-linked px-3 py-2 rounded-md"
            style={{ backgroundColor: "color-mix(in srgb, var(--status-linked) 8%, transparent)" }}
          >
            已保存
          </div>
        )}

        {/* Discover */}
        <div className="pt-4 border-t border-dashed border-border-subtle">
          <div className="text-xs font-semibold text-text-primary mb-1">初始化</div>
          <p className="text-xs text-text-tertiary mb-3">
            从各工具的全局 Skills 路径中发现并导入已有的 Skills
          </p>
          <Button variant="secondary" size="sm" onClick={handleDiscover} disabled={discovering}>
            {discovering ? "扫描中..." : "从工具路径发现并导入 Skills"}
          </Button>
          {discoverResult && (
            <div className="mt-2 text-xs text-text-secondary bg-bg-base px-3 py-2 rounded-md border border-border-subtle">
              {discoverResult}
            </div>
          )}
        </div>

        {/* Danger zone */}
        <div className="pt-4 border-t border-dashed border-border-subtle">
          <div className="text-xs font-semibold text-status-broken mb-2">危险操作</div>
          {!confirmClear ? (
            <Button variant="ghost" size="sm" className="!text-status-broken" onClick={() => setConfirmClear(true)}>
              清空所有 Skills
            </Button>
          ) : (
            <div className="space-y-2">
              <span className="text-xs text-status-broken">确认删除所有 Skills 及分发记录？</span>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={keepSymlinksOnClear}
                  onChange={(e) => setKeepSymlinksOnClear(e.target.checked)}
                  className="w-3.5 h-3.5 accent-current"
                />
                <span className="text-xs text-text-secondary">保留 symlink，仅删除 Skill 记录</span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleClearAll}
                  disabled={clearing}
                  className="text-xs px-3 py-1 rounded-md text-white disabled:opacity-50 transition-colors"
                  style={{ backgroundColor: "var(--status-broken)" }}
                >
                  {clearing ? "清空中..." : "确认清空"}
                </button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { setConfirmClear(false); setKeepSymlinksOnClear(false); }}
                >
                  取消
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 px-5 py-4 border-t border-border-subtle space-y-3">
        {/* Theme toggle */}
        <div>
          <div className="text-xs font-semibold text-text-secondary mb-2">主题</div>
          <div className="flex gap-1.5">
            {(["system", "light", "dark"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 text-xs py-1.5 rounded-md border transition-colors ${
                  mode === m
                    ? "border-accent-sky text-accent-sky"
                    : "border-border-subtle text-text-tertiary hover:text-text-secondary"
                }`}
                style={mode === m ? { backgroundColor: "color-mix(in srgb, var(--accent-sky) 8%, transparent)" } : undefined}
              >
                {m === "system" ? "跟随系统" : m === "light" ? "亮色" : "暗色"}
              </button>
            ))}
          </div>
        </div>
        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>关闭</Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saving || loading}>
            {saving ? "保存中..." : "保存"}
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
