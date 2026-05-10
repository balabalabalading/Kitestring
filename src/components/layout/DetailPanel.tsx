import { useState, useEffect, useCallback } from "react";
import type { Skill, Distribution, GitInfo, Tool, DistStatus } from "../../types";
import { TOOL_DISPLAY_NAMES } from "../../types";
import * as tauri from "../../lib/tauri";
import FileTree from "../skill/FileTree";
import FileViewer from "../skill/FileViewer";

interface DetailPanelProps {
  skill: Skill | null;
}

const TOOLS: Tool[] = ["ClaudeCode", "CopilotCLI", "GeminiCLI", "Codex"];

export default function DetailPanel({ skill }: DetailPanelProps) {
  const [distributions, setDistributions] = useState<Distribution[]>([]);
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);
  const [files, setFiles] = useState<tauri.FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [distError, setDistError] = useState<string | null>(null);

  useEffect(() => {
    if (skill) {
      setSelectedFile(null);
      setDistError(null);
      tauri.checkDistributionStatus().then(setDistributions).catch(console.error);
      tauri.getGitInfo(skill.source_path).then(setGitInfo).catch(console.error);
      tauri.listSkillFiles(skill.id).then(setFiles).catch(console.error);
    } else {
      setDistributions([]);
      setGitInfo(null);
      setFiles([]);
      setSelectedFile(null);
    }
  }, [skill]);

  const handleFileSelect = useCallback((path: string) => {
    setSelectedFile(path);
  }, []);

  if (!skill) {
    return (
      <main className="flex-1 flex items-center justify-center text-[#86868b] text-sm">
        选择一个 Skill 查看详情
      </main>
    );
  }

  const skillDists = distributions.filter((d) => d.skill_id === skill.id);

  function getDistStatus(tool: string): DistStatus | "none" {
    const dist = skillDists.find((d) => d.tool === tool);
    return dist ? dist.status : "none";
  }

  function statusColor(status: DistStatus | "none") {
    switch (status) {
      case "Linked":
        return "bg-green-400";
      case "Broken":
        return "bg-red-400";
      case "Pending":
        return "bg-yellow-400";
      default:
        return "bg-gray-300";
    }
  }

  async function handleDistribute(tool: string, scope: string) {
    if (!skill) return;
    setDistError(null);
    try {
      const dist = await tauri.distributeSkill(skill.id, tool, scope, skill.project_id ?? undefined);
      setDistributions((prev) => [...prev, dist]);
    } catch (e) {
      setDistError(String(e));
    }
  }

  async function handleRemoveDist(distId: string) {
    try {
      await tauri.removeDistribution(distId);
      setDistributions((prev) => prev.filter((d) => d.id !== distId));
    } catch (e) {
      console.error("Remove distribution failed:", e);
    }
  }

  return (
    <main className="flex-1 overflow-y-auto p-8">
      {/* Meta Info */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-xl font-semibold text-[#1d1d1f]">{skill.name}</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-[#f5f5f7] text-[#86868b]">
            {skill.source_type === "Github" ? "GitHub" : "本地"}
          </span>
        </div>
        {skill.description && (
          <p className="text-sm text-[#424245] mt-1 leading-relaxed">{skill.description}</p>
        )}
        <p className="text-xs text-[#86868b] mt-2 font-mono">{skill.source_path}</p>
      </div>

      {/* Content & Distribution */}
      <div className="flex gap-8">
        {/* File Tree + Viewer */}
        <div className="flex-1 flex flex-col min-w-0">
          <h3 className="text-sm font-medium text-[#1d1d1f] mb-3">文件结构</h3>
          <div className="border border-gray-200 rounded-lg overflow-hidden flex flex-col" style={{ minHeight: 200 }}>
            {files.length > 0 ? (
              <div className="flex flex-1 overflow-hidden">
                {/* Tree sidebar */}
                <div className="w-56 border-r border-gray-100 overflow-y-auto py-1 shrink-0">
                  <FileTree
                    nodes={files}
                    onFileSelect={handleFileSelect}
                    selectedPath={selectedFile ?? undefined}
                  />
                </div>
                {/* File content */}
                {selectedFile ? (
                  <FileViewer skillSourcePath={skill.source_path} relativePath={selectedFile} />
                ) : (
                  <div className="flex-1 flex items-center justify-center text-xs text-[#86868b]">
                    点击文件查看内容
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 text-sm text-[#86868b]">加载文件结构中...</div>
            )}
          </div>
        </div>

        {/* Distribution Status */}
        <div className="w-64 shrink-0">
          <h3 className="text-sm font-medium text-[#1d1d1f] mb-3">分发状态</h3>
          {distError && (
            <div className="mb-2 text-xs text-red-500 bg-red-50 px-2 py-1.5 rounded-md">
              {distError}
            </div>
          )}
          <div className="space-y-2">
            {TOOLS.map((tool) => {
              const status = getDistStatus(tool);
              const dist = skillDists.find((d) => d.tool === tool);
              return (
                <div
                  key={tool}
                  className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-200 bg-white"
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${statusColor(status)}`} />
                    <span className="text-sm text-[#1d1d1f]">
                      {TOOL_DISPLAY_NAMES[tool]}
                    </span>
                  </div>
                  {status === "none" && (
                    <button
                      onClick={() => handleDistribute(tool, "Global")}
                      className="text-xs text-blue-500 hover:text-blue-600"
                    >
                      分发
                    </button>
                  )}
                  {status === "Linked" && dist && (
                    <button
                      onClick={() => handleRemoveDist(dist.id)}
                      className="text-xs text-[#86868b] hover:text-red-500"
                    >
                      取消
                    </button>
                  )}
                  {status === "Broken" && (
                    <span className="text-xs text-red-400">断开</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Git Info */}
      {gitInfo && gitInfo.is_git_repo && (
        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="text-xs text-[#86868b]">
            <span className="font-mono">{gitInfo.branch}</span>
            {" · "}
            <span>{gitInfo.commit_count} commits</span>
            {gitInfo.last_commit_time && (
              <>
                {" · "}
                <span>Updated {gitInfo.last_commit_time}</span>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
