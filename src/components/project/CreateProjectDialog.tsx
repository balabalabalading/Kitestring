import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { Project } from "../../types";
import * as tauri from "../../lib/tauri";

interface CreateProjectDialogProps {
  onCreated: (project: Project) => void;
  onClose: () => void;
}

export default function CreateProjectDialog({ onCreated, onClose }: CreateProjectDialogProps) {
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePickDir() {
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      const dir = typeof selected === "string" ? selected : selected;
      setPath(dir);
      if (!name) {
        // Auto-fill name from directory basename
        const parts = dir.replace(/\\/g, "/").split("/");
        setName(parts[parts.length - 1] ?? "");
      }
    }
  }

  async function handleCreate() {
    if (!path.trim()) {
      setError("请选择项目目录");
      return;
    }
    if (!name.trim()) {
      setError("请输入项目名称");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const project = await tauri.createProject(name.trim(), path.trim());
      onCreated(project);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-2xl w-96 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-[#1d1d1f]">新建项目</h2>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-md flex items-center justify-center text-[#86868b] hover:bg-gray-100 hover:text-[#1d1d1f] text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-[#424245] mb-1">
              项目目录
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="请输入项目路径，或点击按钮选择"
                className="flex-1 text-sm px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:border-blue-400 font-mono text-xs"
              />
              <button
                onClick={handlePickDir}
                className="text-xs px-3 py-2 rounded-md border border-gray-300 hover:bg-gray-50 text-[#424245] whitespace-nowrap"
              >
                选择
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#424245] mb-1">项目名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="我的项目"
              className="w-full text-sm px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:border-blue-400"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>

          {error && (
            <div className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-md">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="text-sm px-4 py-1.5 rounded-md border border-gray-300 text-[#424245] hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="text-sm px-4 py-1.5 rounded-md bg-[#1d1d1f] text-white hover:bg-[#424245] disabled:opacity-50"
          >
            {loading ? "创建中..." : "创建"}
          </button>
        </div>
      </div>
    </div>
  );
}
