import { useState, useEffect } from "react";
import type { ToolPaths } from "../../types";
import * as tauri from "../../lib/tauri";

interface SettingsPanelProps {
  onClose: () => void;
}

const TOOLS = ["ClaudeCode", "CopilotCLI", "GeminiCLI", "Codex"] as const;
const TOOL_LABELS: Record<string, string> = {
  ClaudeCode: "Claude Code",
  CopilotCLI: "Copilot CLI",
  GeminiCLI: "Gemini CLI",
  Codex: "Codex",
};

export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [paths, setPaths] = useState<Record<string, ToolPaths>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    tauri.getAppConfig().then((config) => {
      setPaths({ ...config.tool_paths });
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

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await tauri.updateToolPaths(paths);
      setSaved(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-2xl w-[520px] max-h-[80vh] flex flex-col">
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
