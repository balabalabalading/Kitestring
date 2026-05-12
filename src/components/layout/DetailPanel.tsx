import { useState, useEffect } from "react";
import type { Skill, Distribution, GitInfo, Tool, DistStatus, AppConfig } from "../../types";
import { TOOL_DISPLAY_NAMES } from "../../types";
import * as tauri from "../../lib/tauri";
import FileTree from "../skill/FileTree";


interface DetailPanelProps {
  skill: Skill | null;
  onSkillDeleted: (id: string) => void;
  onSkillPulled: () => void;
}

const TOOLS: Tool[] = ["ClaudeCode", "CopilotCLI", "GeminiCLI", "Codex"];

export default function DetailPanel({ skill, onSkillDeleted, onSkillPulled }: DetailPanelProps) {
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
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [keepSymlinks, setKeepSymlinks] = useState(false);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

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
    }
  }, [skill]);

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
      setActionError(String(e));
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
      showToast(result.updated ? "更新成功" : "当前版本已是最新", true);
    } catch (e) {
      setActionError(String(e));
    } finally {
      setPulling(false);
    }
  }

  if (!skill) {
    return (
      <main className="flex-1 flex items-center justify-center text-[#86868b] text-sm">
        选择一个 Skill 查看详情
      </main>
    );
  }

  const skillDists = distributions.filter((d) => d.skill_id === skill.id);

  function statusColor(status: DistStatus | "none") {
    switch (status) {
      case "Linked":  return "bg-green-400";
      case "Broken":  return "bg-red-400";
      case "Pending": return "bg-yellow-400";
      default:        return "bg-gray-300";
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
    return skillDists.filter(
      (d) => d.tool === tool && d.target_path !== globalPath && !extraExpandedPaths.includes(d.target_path)
    );
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
      const dist = await tauri.distributeSkill(skill.id, tool, scope, skill.project_id ?? undefined);
      setDistributions((prev) => [...prev, dist]);
    } catch (e) {
      setDistError(String(e));
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

  const canPull = gitInfo?.is_git_repo === true;

  return (
    <>
      {/* Toast — outside main to avoid overflow-hidden clipping in WebView */}
      {toast && (
        <div className={`fixed top-5 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-lg shadow-lg text-sm font-medium pointer-events-none ${toast.ok ? "bg-[#1d1d1f] text-white" : "bg-red-500 text-white"}`}>
          {toast.msg}
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-2xl w-80 p-6">
            <h3 className="text-sm font-semibold text-[#1d1d1f] mb-2">删除 Skill</h3>
            <p className="text-xs text-[#424245] mb-1">
              确认从 AgentNexus 中移除「{skill.name}」？
            </p>
            <p className="text-xs text-[#86868b] mb-3">
              不会删除本地文件夹。
            </p>
            <label className="flex items-center gap-2 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={keepSymlinks}
                onChange={(e) => setKeepSymlinks(e.target.checked)}
                className="w-3.5 h-3.5 accent-[#1d1d1f]"
              />
              <span className="text-xs text-[#424245]">保留 symlink，仅删除 Skill 记录</span>
            </label>
            {actionError && (
              <div className="mb-3 text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-md">{actionError}</div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setConfirmDelete(false); setActionError(null); }}
                className="text-xs px-4 py-1.5 rounded-md border border-gray-300 text-[#424245] hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs px-4 py-1.5 rounded-md bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
              >
                {deleting ? "删除中..." : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}

    <main className="flex-1 flex flex-col p-8 min-h-0 overflow-y-auto">

      {/* Header */}
      <div className="mb-6 shrink-0">
        <div className="flex items-center flex-wrap gap-2 mb-1">
          {/* Skill name + badge */}
          <h2 className="text-xl font-semibold text-[#1d1d1f]">{skill.name}</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-[#f5f5f7] text-[#86868b]">
            {skill.source_type === "Github" ? "GitHub" : "本地"}
          </span>
          {/* Action buttons — inline, close to the name */}
          {canPull && (
            <button
              onClick={handlePull}
              disabled={pulling}
              className="text-xs px-3 py-1 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-[#424245] disabled:opacity-50 transition-colors"
            >
              {pulling ? "拉取中..." : "拉取更新"}
            </button>
          )}
          <button
            onClick={() => { setConfirmDelete(true); setKeepSymlinks(false); setActionError(null); }}
            className="text-xs px-3 py-1 rounded-md border border-red-200 bg-white hover:bg-red-50 text-red-500 transition-colors"
          >
            删除 Skill
          </button>
        </div>
        {skill.description && (
          <p className="text-sm text-[#424245] mt-1 leading-relaxed">{skill.description}</p>
        )}
        <p className="text-xs text-[#86868b] mt-2 font-mono">{skill.source_path}</p>
        {gitInfo?.is_git_repo && (
          <p className="text-xs text-[#86868b] mt-1">
            <span className="font-mono">{gitInfo.branch}</span>
            {" · "}
            <span>{gitInfo.commit_count} commits</span>
            {gitInfo.last_commit_time && (
              <>{" · "}<span>更新于 {gitInfo.last_commit_time.slice(0, 10)}</span></>
            )}
          </p>
        )}
      </div>

      {/* Content & Distribution — fills remaining height */}
      <div className="flex gap-6 flex-1 min-h-0">
        {/* Distribution Status — 3/4 */}
        <div className="flex-[3] flex flex-col min-w-0 min-h-0">
          <h3 className="text-sm font-medium text-[#1d1d1f] mb-3 shrink-0">分发状态</h3>
          {distError && (
            <div className="mb-2 text-xs text-red-500 bg-red-50 px-2 py-1.5 rounded-md shrink-0">
              {distError}
            </div>
          )}
          <div className="space-y-2 overflow-y-auto flex-1">
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
                <div key={tool} className="border border-gray-200 rounded-lg bg-white overflow-hidden">
                  {/* Tool header */}
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
                    <span className="text-xs font-medium text-[#1d1d1f]">{TOOL_DISPLAY_NAMES[tool]}</span>
                    <button
                      onClick={() => {
                        setAddingPathTool(isAddingForTool ? null : tool);
                        setCustomPathInput("");
                        setDistError(null);
                      }}
                      className="text-sm text-[#86868b] hover:text-[#1d1d1f] w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200"
                      title="添加自定义路径"
                    >
                      +
                    </button>
                  </div>

                  {/* Global path row (always shown) */}
                  <div className="px-3 py-2 flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusColor(globalDist?.status ?? "none")}`} />
                    <span className="text-[9px] text-[#86868b] bg-gray-100 px-1 py-0.5 rounded shrink-0">用户级</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-[#1d1d1f] font-medium truncate">{globalFolderName}</div>
                      <div className="text-[10px] text-[#86868b] font-mono truncate" title={globalGrandparentPath}>
                        {globalGrandparentPath}
                      </div>
                    </div>
                    {isFileSource(tool) ? (
                      <span className="text-[10px] text-[#86868b] bg-gray-100 px-1.5 py-0.5 rounded shrink-0">文件来源</span>
                    ) : globalDist ? (
                      <button onClick={() => handleRemoveDist(globalDist.id)} className="text-[10px] text-[#86868b] hover:text-red-500 shrink-0">取消</button>
                    ) : (
                      <button onClick={() => handleDistribute(tool, "Global")} className="text-[10px] text-blue-500 hover:text-blue-600 shrink-0">分发</button>
                    )}
                  </div>

                  {/* Extra global path rows */}
                  {extraGlobals.map((eg) => {
                    const egDist = skillDists.find((d) => d.tool === tool && d.target_path === eg.path + "/" + skill.name);
                    const egIsFileSource = isFileSourceForPath(eg.path);
                    return (
                      <div key={eg.path} className="px-3 py-2 flex items-center gap-2 border-t border-gray-100">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusColor(egIsFileSource ? "Linked" : egDist?.status ?? "none")}`} />
                        <span className="text-[9px] text-[#86868b] bg-gray-100 px-1 py-0.5 rounded shrink-0">用户级</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-[#1d1d1f] font-medium truncate">{eg.folderName}/*/skills</div>
                          <div className="text-[10px] text-[#86868b] font-mono truncate" title={eg.parentPath}>
                            {eg.parentPath}
                          </div>
                        </div>
                        {egIsFileSource ? (
                          <span className="text-[10px] text-[#86868b] bg-gray-100 px-1.5 py-0.5 rounded shrink-0">文件来源</span>
                        ) : egDist ? (
                          <button onClick={() => handleRemoveDist(egDist.id)} className="text-[10px] text-[#86868b] hover:text-red-500 shrink-0">取消</button>
                        ) : (
                          <button onClick={() => handleDistributeToDir(tool, eg.path)} className="text-[10px] text-blue-500 hover:text-blue-600 shrink-0">分发</button>
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
                      <div className="px-3 py-2 flex items-center gap-2 border-t border-gray-100">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-green-400" />
                        <span className="text-[9px] text-[#86868b] bg-gray-100 px-1 py-0.5 rounded shrink-0">项目级</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-[#1d1d1f] font-medium truncate">{folderName}</div>
                          <div className="text-[10px] text-[#86868b] font-mono truncate" title={parentPath}>
                            {parentPath}
                          </div>
                        </div>
                        <span className="text-[10px] text-[#86868b] bg-gray-100 px-1.5 py-0.5 rounded shrink-0">文件来源</span>
                      </div>
                    );
                  })()}

                  {/* Custom distribution rows */}
                  {customDists.map((dist) => {
                    const parts = dist.target_path.replace(/\/$/, "").split("/");
                    const containerName = parts[parts.length - 2] ?? parts[parts.length - 1] ?? "";
                    const grandparentPath = parts.slice(0, -2).join("/") + "/";
                    return (
                      <div key={dist.id} className="px-3 py-2 flex items-center gap-2 border-t border-gray-100">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusColor(dist.status)}`} />
                        <span className="text-[9px] text-[#86868b] bg-gray-100 px-1 py-0.5 rounded shrink-0">项目级</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-[#1d1d1f] font-medium truncate">{containerName}</div>
                          <div className="text-[10px] text-[#86868b] font-mono truncate" title={grandparentPath}>
                            {grandparentPath}
                          </div>
                        </div>
                        <button onClick={() => handleRemoveDist(dist.id)} className="text-[10px] text-[#86868b] hover:text-red-500 shrink-0">取消</button>
                      </div>
                    );
                  })}

                  {/* Add custom path input */}
                  {isAddingForTool && (
                    <div className="px-3 py-2 border-t border-gray-100">
                      <input
                        type="text"
                        value={customPathInput}
                        onChange={(e) => setCustomPathInput(e.target.value)}
                        placeholder="~/path/to/skills/"
                        className="w-full text-[10px] px-2 py-1 rounded border border-gray-300 font-mono mb-1.5 focus:outline-none focus:border-blue-400"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleDistributeToDir(tool, customPathInput);
                          if (e.key === "Escape") { setAddingPathTool(null); setCustomPathInput(""); }
                        }}
                      />
                      <div className="flex gap-1.5">
                        <button onClick={() => handleDistributeToDir(tool, customPathInput)} className="flex-1 text-[10px] py-1 bg-[#1d1d1f] text-white rounded">确认</button>
                        <button onClick={() => { setAddingPathTool(null); setCustomPathInput(""); }} className="text-[10px] px-2 py-1 rounded border border-gray-300 text-[#86868b]">取消</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* File Tree — 1/4 */}
        <div className="flex-[1] flex flex-col min-w-0 min-h-0 max-w-xs">
          <h3 className="text-sm font-medium text-[#1d1d1f] mb-3 shrink-0">文件结构</h3>
          <div className="border border-gray-200 rounded-lg overflow-hidden flex flex-1 min-h-0">
            {files.length > 0 ? (
              <div className="overflow-y-auto py-1 w-full">
                <FileTree
                  nodes={files}
                  onFileSelect={() => {}}
                  selectedPath={undefined}
                />
              </div>
            ) : (
              <div className="p-4 text-sm text-[#86868b]">加载文件结构中...</div>
            )}
          </div>
        </div>
      </div>
    </main>
  </>
  );
}

