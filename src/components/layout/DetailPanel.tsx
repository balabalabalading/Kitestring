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
  onImport?: (tab: "local" | "github") => void;
  onDiscover?: () => void;
  onCreateProject?: () => void;
}

const TOOLS: Tool[] = ["ClaudeCode", "CopilotCLI", "GeminiCLI", "Codex", "AgentFolder"];

export default function DetailPanel({ skill, totalSkillsCount, onSkillDeleted, onSkillPulled, onImport, onDiscover, onCreateProject }: DetailPanelProps) {
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
                  开始编织你的 Skill 网络
                </p>
              </div>
              <p className="text-[13px] text-text-secondary">
                支持 Git 版本追踪 • symlink 链接分发 • Claude / Copilot / Gemini / Codex / Agent
              </p>
            </div>

            {/* skill import */}
            <div className="flex flex-col gap-3">
              <p style={{ fontFamily: "var(--font-serif)", fontSize: "18px", fontWeight: 500, color: "var(--text-primary)" }}>
                导入 Skill
              </p>

              <div className="flex flex-col gap-3">
                <p className="text-[14px] text-text-primary" style={{ fontFamily: "var(--font-serif)", fontWeight: 500 }}>
                  创建 Skill 实例。适用于全局型的 Skill，创建实例后可以分发至任意路径：
                </p>

                {/* 方式 1：检索工具路径 */}
                <div className="flex flex-col gap-1">
                  <p className="text-[13px] text-text-secondary">从 Claude/Copilot/Gemini/Codex/Agent 的默认用户路径中检索已存在的 skills 并导入：</p>
                  <Button
                    variant="primary"
                    size="sm"
                    className="self-start"
                    onClick={onDiscover}
                  >
                    检索工具默认用户路径并导入
                  </Button>
                </div>

                {/* 方式 2：本地文件夹 */}
                <div className="flex flex-col gap-1">
                  <p className="text-[13px] text-text-secondary">选择本地文件夹并导入该文件夹包含的所有 skills：</p>
                  <Button
                    variant="primary"
                    size="sm"
                    className="self-start"
                    onClick={() => onImport?.("local")}
                  >
                    选择本地文件夹并导入
                  </Button>
                </div>

                {/* 方式 3：GitHub */}
                <div className="flex flex-col gap-1">
                  <p className="text-[13px] text-text-secondary">从 GitHub 导入：</p>
                  <Button
                    variant="primary"
                    size="sm"
                    className="self-start"
                    onClick={() => onImport?.("github")}
                  >
                    输入 GitHub 链接并导入
                  </Button>
                </div>

                <div className="flex flex-col gap-1 pt-4">
                  <p className="text-[14px] text-text-primary" style={{ fontFamily: "var(--font-serif)", fontWeight: 500 }}>
                    创建项目。适用于多工具同时使用的场景，支持将同一 Skill 分发至多个工具：
                  </p>
                  <p className="text-[13px] text-text-secondary">选择本地文件夹并导入，同时创建项目，以项目维度管理：</p>
                  <Button
                    variant="primary"
                    size="sm"
                    className="self-start"
                    onClick={onCreateProject}
                  >
                    选择本地文件夹并导入，同时创建项目
                  </Button>
                </div>
              </div>
            </div>

            {/* skill export */}
            <div className="flex flex-col gap-3">
              <p style={{ fontFamily: "var(--font-serif)", fontSize: "18px", fontWeight: 500, color: "var(--text-primary)" }}>
                分发 Skill
              </p>
              <p className="text-[13px] text-text-secondary">
                成功导入 Skill 后，即可在 Skill 或项目详情页创建指向 Skill 的 symlink。
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
          <h3 className="text-[14px] font-normal text-text-primary mb-2">删除技能</h3>
          <p className="text-[13px] text-text-secondary mb-1">
            确认从 Kitestring 中移除「{skill.name}」？
          </p>
          <p className="text-[13px] text-text-tertiary mb-4">
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
                danger
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
                  <Tag variant="earth" size="md">本地</Tag>
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
            <span className="text-[10px] font-semibold text-text-tertiary shrink-0">路径</span>
            <span className="text-[10px] text-text-secondary font-mono truncate">{skill.source_path}</span>
          </div>
          {gitInfo?.is_git_repo && (
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-semibold text-text-tertiary shrink-0">Git</span>
              <span className="text-[10px] text-text-secondary">
                {gitInfo.branch}
                {gitInfo.commit_count ? ` · ${gitInfo.commit_count} commits` : ""}
                {gitInfo.last_commit_time ? ` · 更新于 ${gitInfo.last_commit_time.slice(0, 10)}` : ""}
              </span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          {canPull && (
            <Button variant="secondary" size="sm" onClick={handlePull} disabled={pulling}>
              {pulling ? "拉取中..." : "拉取更新"}
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { setConfirmDelete(true); setKeepSymlinks(false); setActionError(null); }}
            danger
          >
            删除
          </Button>
        </div>
      </div>

      {/* Tools section */}
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold text-text-primary">工具</p>
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
              <Card key={tool} variant="tool">
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
                    title="添加自定义路径"
                  >
                    +
                  </Button>
                </div>

                {/* Distribution rows container */}
                <div className="px-6 py-3 flex flex-col gap-3">
                  {/* Global path row */}
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={isFileSource(tool) ? { backgroundColor: "var(--status-linked)" } : statusStyle(globalDist?.status ?? "none")} />
                    <Tag variant="default" size="xs">用户级</Tag>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-text-primary truncate">{globalFolderName}</div>
                      <div className="text-[10px] text-text-tertiary truncate" title={globalGrandparentPath}>
                        {globalGrandparentPath}
                      </div>
                    </div>
                    {isFileSource(tool) ? (
                      <Tag variant="default" size="sm">文件来源</Tag>
                    ) : globalDist ? (
                      <Button variant="secondary" size="sm" onClick={() => handleRemoveDist(globalDist.id)} className="shrink-0">取消</Button>
                    ) : (
                      <Button variant="primary" size="sm" onClick={() => handleDistribute(tool, "Global")} className="shrink-0">分发</Button>
                    )}
                  </div>

                  {/* Extra global path rows */}
                  {extraGlobals.map((eg) => {
                    const egDist = skillDists.find((d) => d.tool === tool && d.target_path === eg.path + "/" + skill.name);
                    const egIsFileSource = isFileSourceForPath(eg.path);
                    return (
                      <div key={eg.path} className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={statusStyle(egIsFileSource ? "Linked" : egDist?.status ?? "none")} />
                        <Tag variant="default" size="xs">用户级</Tag>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] text-text-primary truncate">{eg.folderName}/*/skills</div>
                          <div className="text-[10px] text-text-tertiary truncate" title={eg.parentPath}>
                            {eg.parentPath}
                          </div>
                        </div>
                        {egIsFileSource ? (
                          <Tag variant="default" size="sm">文件来源</Tag>
                        ) : egDist ? (
                          <Button variant="secondary" size="sm" onClick={() => handleRemoveDist(egDist.id)} className="shrink-0">取消</Button>
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
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: "var(--status-linked)" }} />
                        <Tag variant="default" size="xs">项目级</Tag>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] text-text-primary truncate">{folderName}</div>
                          <div className="text-[10px] text-text-tertiary truncate" title={parentPath}>
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
                      <div key={dist.id} className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={statusStyle(dist.status)} />
                        <Tag variant="default" size="xs">项目级</Tag>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] text-text-primary truncate">{containerName}</div>
                          <div className="text-[10px] text-text-tertiary truncate" title={grandparentPath}>
                            {grandparentPath}
                          </div>
                        </div>
                        <Button variant="secondary" size="sm" onClick={() => handleRemoveDist(dist.id)} className="shrink-0">取消</Button>
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
                        <Button variant="primary" size="sm" onClick={() => handleDistributeToDir(tool, customPathInput)} className="flex-1">确认</Button>
                        <Button variant="ghost" size="sm" onClick={() => { setAddingPathTool(null); setCustomPathInput(""); }}>取消</Button>
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
        <p className="text-[11px] font-semibold text-text-primary">文件</p>
        <div className="rounded-lg bg-bg-elevated p-2 w-full max-w-[260px]">
          {files.length > 0 ? (
            <FileTree
              nodes={files}
              onFileSelect={() => {}}
              selectedPath={undefined}
            />
          ) : (
            <div className="py-1 px-2 text-[11px] text-text-tertiary">加载中...</div>
          )}
        </div>
      </div>
    </main>
  </>
  );
}
