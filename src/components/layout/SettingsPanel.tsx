import { useState, useEffect } from "react";
import type { ToolPaths } from "../../types";
import * as tauri from "../../lib/tauri";

interface SettingsPanelProps {
  onClose: () => void;
  onSkillsCleared?: () => void;
}

const TOOLS = ["ClaudeCode", "CopilotCLI", "GeminiCLI", "Codex"] as const;
const TOOL_LABELS: Record<string, string> = {
  ClaudeCode: "Claude Code",
  CopilotCLI: "Copilot CLI",
  GeminiCLI: "Gemini CLI",
  Codex: "Codex",
};

export default function SettingsPanel({ onClose, onSkillsCleared }: SettingsPanelProps) {
  const [paths, setPaths] = useState<Record<string, ToolPaths>>({});
  const [ignoredPaths, setIgnoredPaths] = useState<string[]>([]);
  const [newIgnoredPath, setNewIgnoredPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
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

  const [keepSymlinksOnClear, setKeepSymlinksOnClear] = useState(false);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-2xl w-[520px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-[#1d1d1f]">设置</h2>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-md flex items-center justify-center text-[#86868b] hover:bg-gray-100 hover:text-[#1d1d1f] text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <p className="text-xs text-[#86868b] mb-4">
            配置各 AI 工具的 Skill 目录路径（支持 ~ 路径）
          </p>

          {loading ? (
            <div className="text-sm text-[#86868b] py-4">加载中...</div>
          ) : (
            <div className="space-y-5">
              {TOOLS.map((tool) => (
                <div key={tool}>
                  <div className="text-sm font-medium text-[#1d1d1f] mb-2">
                    {TOOL_LABELS[tool]}
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#86868b] w-12 shrink-0">全局</span>
                      <input
                        type="text"
                        value={paths[tool]?.global ?? ""}
                        onChange={(e) => updatePath(tool, "global", e.target.value)}
                        placeholder={`~/.${tool.toLowerCase()}/skills/`}
                        className="flex-1 text-xs px-2.5 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:border-blue-400 font-mono"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#86868b] w-12 shrink-0">项目</span>
                      <input
                        type="text"
                        value={paths[tool]?.project ?? ""}
                        onChange={(e) => updatePath(tool, "project", e.target.value)}
                        placeholder={`.${tool.toLowerCase()}/skills/`}
                        className="flex-1 text-xs px-2.5 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:border-blue-400 font-mono"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Ignored paths section */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="text-sm font-medium text-[#1d1d1f] mb-1">忽略路径</div>
            <p className="text-xs text-[#86868b] mb-3">
              以下路径将在发现扫描中被跳过（支持 ~ 路径）
            </p>
            <div className="space-y-1.5 mb-2">
              {ignoredPaths.map((p) => (
                <div key={p} className="flex items-center gap-2">
                  <span className="flex-1 text-xs font-mono text-[#424245] bg-gray-50 px-2.5 py-1.5 rounded-md border border-gray-200 truncate" title={p}>{p}</span>
                  <button
                    onClick={() => removeIgnoredPath(p)}
                    className="text-xs text-[#86868b] hover:text-red-500 shrink-0 px-1"
                    title="移除"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newIgnoredPath}
                onChange={(e) => setNewIgnoredPath(e.target.value)}
                placeholder="~/path/to/ignore/"
                className="flex-1 text-xs px-2.5 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:border-blue-400 font-mono"
                onKeyDown={(e) => e.key === "Enter" && addIgnoredPath()}
              />
              <button
                onClick={addIgnoredPath}
                className="text-xs px-3 py-1.5 rounded-md border border-gray-300 text-[#424245] hover:bg-gray-50"
              >
                添加
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-4 text-xs text-red-500 bg-red-50 px-3 py-2 rounded-md">
              {error}
            </div>
          )}
          {saved && (
            <div className="mt-4 text-xs text-green-600 bg-green-50 px-3 py-2 rounded-md">
              已保存
            </div>
          )}

          {/* Discover Section */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="text-xs font-medium text-[#1d1d1f] mb-1">初始化</div>
            <p className="text-xs text-[#86868b] mb-3">
              从各工具的全局 Skills 路径中发现并导入已有的 Skills（自动解析符号链接）
            </p>
            <button
              onClick={handleDiscover}
              disabled={discovering}
              className="text-xs px-3 py-1.5 rounded-md border border-gray-300 text-[#424245] hover:bg-gray-50 disabled:opacity-50"
            >
              {discovering ? "扫描中..." : "从工具路径发现并导入 Skills"}
            </button>
            {discoverResult && (
              <div className="mt-2 text-xs text-[#424245] bg-gray-50 px-3 py-2 rounded-md">
                {discoverResult}
              </div>
            )}
          </div>

          {/* Danger Zone */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="text-xs font-medium text-red-500 mb-2">危险操作</div>
            {!confirmClear ? (
              <button
                onClick={() => setConfirmClear(true)}
                className="text-xs px-3 py-1.5 rounded-md border border-red-200 text-red-500 hover:bg-red-50"
              >
                清空所有 Skills
              </button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-500">确认删除所有 Skills 及分发记录？</span>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={keepSymlinksOnClear}
                    onChange={(e) => setKeepSymlinksOnClear(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[#1d1d1f]"
                  />
                  <span className="text-xs text-[#424245]">保留 symlink，仅删除 Skill 记录</span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleClearAll}
                    disabled={clearing}
                    className="text-xs px-3 py-1.5 rounded-md bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
                  >
                    {clearing ? "清空中..." : "确认清空"}
                  </button>
                  <button
                    onClick={() => { setConfirmClear(false); setKeepSymlinksOnClear(false); }}
                    className="text-xs px-3 py-1.5 rounded-md border border-gray-300 text-[#86868b] hover:bg-gray-50"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="text-sm px-4 py-1.5 rounded-md border border-gray-300 text-[#424245] hover:bg-gray-50"
          >
            关闭
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="text-sm px-4 py-1.5 rounded-md bg-[#1d1d1f] text-white hover:bg-[#424245] disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
