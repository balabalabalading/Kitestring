import { useState, useEffect } from "react";
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


interface DetailPanelProps {
  skill: Skill | null;
  totalSkillsCount: number;
  onSkillDeleted: (id: string) => void;
  onSkillPulled: () => void;
}

const TOOLS: Tool[] = ["ClaudeCode", "CopilotCLI", "GeminiCLI", "Codex", "AgentFolder"];

export default function DetailPanel({ skill, totalSkillsCount, onSkillDeleted, onSkillPulled }: DetailPanelProps) {
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

  const { showToast } = useToast();

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
      showToast(result.updated ? "更新成功" : "当前版本已是最新");
    } catch (e) {
      setActionError(String(e));
    } finally {
      setPulling(false);
    }
  }

  if (!skill) {
    // 首次启动：没有任何 Skill
    if (totalSkillsCount === 0) {
      return (
        <main className="flex-1 flex flex-col items-center justify-center gap-5 text-text-tertiary px-8">
          <svg
            width="64" height="64" viewBox="0 0 56 56" fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="animate-[kite-float_4s_ease-in-out_infinite] opacity-80"
            style={{ color: "var(--accent-warm)" }}
          >
            <path d="M28 4 L50 28 L28 48 L6 28 Z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round" />
            <line x1="6" y1="28" x2="50" y2="28" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round" />
            <line x1="28" y1="4" x2="28" y2="48" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round" />
            <path d="M28 48 Q30 52 28 58" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          </svg>
          <div className="text-center">
            <p style={{ fontFamily: "var(--font-serif)", fontSize: "var(--font-size-h2)", color: "var(--text-primary)" }} className="mb-2">
              开始编织你的 AI 技能网络
            </p>
            <p className="text-sm text-text-tertiary leading-relaxed">
              从本地文件夹或 GitHub 仓库导入你的第一个 Skill
            </p>
          </div>
            <div className="flex gap-3 mt-1 text-xs text-text-tertiary">
              <Tag variant="default" size="md">📁 本地文件夹</Tag>
              <Tag variant="default" size="md">🐙 GitHub 仓库</Tag>
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
          选择一个 Skill 查看详情
        </p>
      </main>
    );
  }

  const skillDists = distributions.filter((d) => d.skill_id === skill.id);

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
      {/* Delete confirmation dialog */}
      <Dialog open={confirmDelete} onClose={() => { setConfirmDelete(false); setActionError(null); }}>
        <div className="p-6">
          <h3 className="text-sm font-semibold text-text-primary mb-2">删除 Skill</h3>
          <p className="text-xs text-text-secondary mb-1">
            确认从 Kitestring 中移除「{skill.name}」？
          </p>
          <p className="text-xs text-text-tertiary mb-4">
            不会删除本地文件夹。
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
                style={{ backgroundColor: "var(--status-broken)" }}
              >
                {deleting ? "删除中..." : `删除并清理 symlink（${distributions.filter((d) => d.entry_type === "Symlink").length} 个）`}
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { setKeepSymlinks(true); handleDelete(); }}
              disabled={deleting}
              className="w-full justify-start"
            >
              {deleting ? "删除中..." : "仅删除记录（保留 symlink）"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setConfirmDelete(false); setActionError(null); }}
              className="w-full justify-center"
            >
              取消
            </Button>
          </div>
        </div>
      </Dialog>

    <main key={skill.id} className="flex-1 flex flex-col p-4 min-h-0 overflow-y-auto gap-4 animate-[panel-enter_200ms_var(--ease-out)_both]">

      {/* Identity Card */}
      <Card variant="base" className="p-4 shrink-0">
        <div className="flex items-center flex-wrap gap-2 mb-1">
          <h2
            className="text-text-primary font-normal leading-tight"
            style={{ fontFamily: "var(--font-serif)", fontSize: "var(--font-size-h1)" }}
          >
            {skill.name}
          </h2>
          {skill.source_type === "Github" ? (
            <Tag variant="sky" size="md">GitHub</Tag>
          ) : (
            <>
              <Tag variant="earth" size="md">本地</Tag>
              {skill.has_git && <Tag variant="sky" size="md">GitHub</Tag>}
            </>
          )}
          {canPull && (
            <Button variant="secondary" size="sm" onClick={handlePull} disabled={pulling}>
              {pulling ? "拉取中..." : "拉取更新"}
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { setConfirmDelete(true); setKeepSymlinks(false); setActionError(null); }}
            className="!text-status-broken hover:!bg-status-broken/10 hover:!border-status-broken"
          >
            删除 Skill
          </Button>
        </div>
        {skill.description && (
          <p className="text-sm text-text-secondary mt-1 leading-relaxed">{skill.description}</p>
        )}
        <p className="text-xs text-text-tertiary mt-2 font-mono">{skill.source_path}</p>
        {gitInfo?.is_git_repo && (
          <p className="text-xs text-text-tertiary mt-1">
            <span className="font-mono">{gitInfo.branch}</span>
            {" · "}
            <span>{gitInfo.commit_count} commits</span>
            {gitInfo.last_commit_time && (
              <>{" · "}<span>更新于 {gitInfo.last_commit_time.slice(0, 10)}</span></>
            )}
          </p>
        )}
      </Card>

      {/* Content & Distribution — fills remaining height */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Distribution Status — 3/4 */}
        <div className="flex-[3] flex flex-col min-w-0 min-h-0">
          <h3 className="text-sm font-medium text-text-primary mb-3 shrink-0"
            style={{ fontFamily: "var(--font-serif)", fontSize: "var(--font-size-h2)", fontWeight: 400 }}
          >分发状态</h3>
          {distError && (
            <div className="mb-2 text-xs px-2 py-1.5 rounded-md shrink-0" style={{ color: "var(--status-broken)", backgroundColor: "color-mix(in srgb, var(--status-broken) 10%, transparent)" }}>
              {distError}
            </div>
          )}
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 overflow-y-auto flex-1 content-start">
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
                <Card key={tool} variant="tool">
                  {/* Tool header */}
                  <div className="flex items-center justify-between px-3 py-2 bg-bg-surface border-b border-dashed border-border-subtle">
                    <span className="text-xs font-medium text-text-primary">{TOOL_DISPLAY_NAMES[tool]}</span>
                    <Button
                      variant="icon"
                      onClick={() => {
                        setAddingPathTool(isAddingForTool ? null : tool);
                        setCustomPathInput("");
                        setDistError(null);
                      }}
                      title="添加自定义路径"
                    >
                      +
                    </Button>
                  </div>

                  {/* Global path row (always shown) */}
                  <div className="px-3 py-2 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={statusStyle(globalDist?.status ?? "none")} />
                    <Tag variant="default" size="xs">用户级</Tag>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-text-primary font-medium truncate">{globalFolderName}</div>
                      <div className="text-[10px] text-text-tertiary font-mono truncate" title={globalGrandparentPath}>
                        {globalGrandparentPath}
                      </div>
                    </div>
                    {isFileSource(tool) ? (
                      <Tag variant="default" size="sm">文件来源</Tag>
                    ) : globalDist ? (
                      <Button variant="secondary" size="sm" onClick={() => handleRemoveDist(globalDist.id)} className="!text-text-tertiary hover:!text-status-broken shrink-0 !px-2">取消</Button>
                    ) : (
                      <Button variant="primary" size="sm" onClick={() => handleDistribute(tool, "Global")} className="shrink-0">分发</Button>
                    )}
                  </div>

                  {/* Extra global path rows */}
                  {extraGlobals.map((eg) => {
                    const egDist = skillDists.find((d) => d.tool === tool && d.target_path === eg.path + "/" + skill.name);
                    const egIsFileSource = isFileSourceForPath(eg.path);
                    return (
                      <div key={eg.path} className="px-3 py-2 flex items-center gap-2 border-t border-dashed border-border-subtle">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={statusStyle(egIsFileSource ? "Linked" : egDist?.status ?? "none")} />
                        <Tag variant="default" size="xs">用户级</Tag>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-text-primary font-medium truncate">{eg.folderName}/*/skills</div>
                          <div className="text-[10px] text-text-tertiary font-mono truncate" title={eg.parentPath}>
                            {eg.parentPath}
                          </div>
                        </div>
                        {egIsFileSource ? (
                          <Tag variant="default" size="sm">文件来源</Tag>
                        ) : egDist ? (
                          <Button variant="secondary" size="sm" onClick={() => handleRemoveDist(egDist.id)} className="!text-text-tertiary hover:!text-status-broken shrink-0 !px-2">取消</Button>
                        ) : (
                          <Button variant="primary" size="sm" onClick={() => handleDistributeToDir(tool, eg.path)} className="shrink-0">分发</Button>
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
                      <div className="px-3 py-2 flex items-center gap-2 border-t border-dashed border-border-subtle">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: "var(--status-linked)" }} />
                        <Tag variant="default" size="xs">项目级</Tag>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-text-primary font-medium truncate">{folderName}</div>
                          <div className="text-[10px] text-text-tertiary font-mono truncate" title={parentPath}>
                            {parentPath}
                          </div>
                        </div>
                        <Tag variant="default" size="sm">文件来源</Tag>
                      </div>
                    );
                  })()}

                  {/* Custom distribution rows */}
                  {customDists.map((dist) => {
                    const parts = dist.target_path.replace(/\/$/, "").split("/");
                    const containerName = parts[parts.length - 2] ?? parts[parts.length - 1] ?? "";
                    const grandparentPath = parts.slice(0, -2).join("/") + "/";
                    return (
                      <div key={dist.id} className="px-3 py-2 flex items-center gap-2 border-t border-dashed border-border-subtle">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={statusStyle(dist.status)} />
                        <Tag variant="default" size="xs">项目级</Tag>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-text-primary font-medium truncate">{containerName}</div>
                          <div className="text-[10px] text-text-tertiary font-mono truncate" title={grandparentPath}>
                            {grandparentPath}
                          </div>
                        </div>
                        <Button variant="secondary" size="sm" onClick={() => handleRemoveDist(dist.id)} className="!text-text-tertiary hover:!text-status-broken shrink-0 !px-2">取消</Button>
                      </div>
                    );
                  })}

                  {/* Add custom path input */}
                  {isAddingForTool && (
                    <div className="px-3 py-2 border-t border-dashed border-border-subtle flex flex-col gap-1.5">
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
                        <Button variant="primary" size="sm" onClick={() => handleDistributeToDir(tool, customPathInput)} className="flex-1">确认</Button>
                        <Button variant="ghost" size="sm" onClick={() => { setAddingPathTool(null); setCustomPathInput(""); }}>取消</Button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>

        {/* File Tree — 1/4, hidden at narrow (<lg) */}
        <div className="hidden lg:flex lg:flex-[1] flex-col min-w-0 min-h-0 max-w-xs">
          <h3 className="text-sm font-medium text-text-primary mb-3 shrink-0"
            style={{ fontFamily: "var(--font-serif)", fontSize: "var(--font-size-h2)", fontWeight: 400 }}
          >文件结构</h3>
          <div className="border border-border-subtle rounded-lg overflow-hidden flex flex-1 min-h-0 bg-bg-elevated">
            {files.length > 0 ? (
              <div className="overflow-y-auto py-1 w-full">
                <FileTree
                  nodes={files}
                  onFileSelect={() => {}}
                  selectedPath={undefined}
                />
              </div>
            ) : (
              <div className="p-4 text-sm text-text-tertiary">加载文件结构中...</div>
            )}
          </div>
        </div>
      </div>
    </main>
  </>
  );
}

