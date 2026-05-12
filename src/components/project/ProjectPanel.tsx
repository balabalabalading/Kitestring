import { useState, useEffect } from "react";
import type { Project, Skill, Distribution, AppConfig } from "../../types";
import { TOOL_DISPLAY_NAMES } from "../../types";
import * as tauri from "../../lib/tauri";

type Tool = "ClaudeCode" | "CopilotCLI" | "GeminiCLI" | "Codex";
const TOOLS: Tool[] = ["ClaudeCode", "CopilotCLI", "GeminiCLI", "Codex"];

interface ProjectPanelProps {
  project: Project;
  onProjectDeleted: (id: string) => void;
  onSelectSkill: (skill: Skill) => void;
  onSkillsUpdated?: () => void;
}

export default function ProjectPanel({ project, onProjectDeleted, onSelectSkill, onSkillsUpdated }: ProjectPanelProps) {
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [allDists, setAllDists] = useState<Distribution[]>([]);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [redetecting, setRedetecting] = useState(false);
  const [distError, setDistError] = useState<string | null>(null);
  const [dragOverTool, setDragOverTool] = useState<Tool | null>(null);
  const [dropErrors, setDropErrors] = useState<Record<string, string>>({});
  // Add Skill modal
  const [showAddSkill, setShowAddSkill] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [addSelectedSkillId, setAddSelectedSkillId] = useState<string | null>(null);
  const [addSelectedTools, setAddSelectedTools] = useState<Set<Tool>>(new Set(TOOLS));
  const [addLoading, setAddLoading] = useState(false);

  useEffect(() => {
    tauri.getAppConfig().then(setAppConfig).catch(console.error);
  }, []);

  useEffect(() => {
    if (!project) return;
    reload();
  }, [project]);

  async function reload() {
    const [s, d] = await Promise.all([
      tauri.listSkills(),
      tauri.checkDistributionStatus(),
    ]);
    setAllSkills(s);
    setAllDists(d);
  }

  const folderName = project.path
    ? project.path.replace(/\/$/, "").split("/").pop() ?? project.name
    : project.name;

  const projectPath = project.path ? project.path.replace(/\/$/, "") : null;

  const detectedSkills = allSkills.filter((skill) => {
    if (project.skill_ids.includes(skill.id)) return true;
    if (projectPath) {
      if (skill.source_path.startsWith(projectPath + "/")) return true;
      if (allDists.some((d) => d.skill_id === skill.id && d.target_path.startsWith(projectPath + "/"))) return true;
    }
    return false;
  });

  function getToolProjectPath(tool: Tool): string {
    if (!appConfig || !project.path) return "";
    const tp = appConfig.tool_paths[tool];
    if (!tp) return "";
    const projectTemplate = tp.project.replace(/^\//, "").replace(/\/$/, "");
    return `${project.path.replace(/\/$/, "")}/${projectTemplate}`;
  }

  function skillsInToolPath(tool: Tool): Array<{ skill: Skill; dist: Distribution; isSymlink: boolean }> {
    const toolPath = getToolProjectPath(tool);
    if (!toolPath) return [];
    return detectedSkills.flatMap((skill): Array<{ skill: Skill; dist: Distribution; isSymlink: boolean }> => {
      // Prefer real Distribution records (created by scan_project_folder / discover_skills_from_tool_paths)
      const dist = allDists.find(
        (d) => d.skill_id === skill.id && d.target_path.startsWith(toolPath + "/")
      );
      if (dist) {
        return [{ skill, dist, isSymlink: dist.entry_type === "Symlink" }];
      }
      // Fallback heuristic: skill source is directly inside this tool path (no dist record yet)
      const isSourceInToolPath = skill.source_path.startsWith(toolPath + "/");
      if (isSourceInToolPath) {
        const fakeDist: Distribution = { id: "", skill_id: skill.id, tool, scope: "Project", target_path: toolPath + "/" + skill.name, status: "Linked", entry_type: "Folder" };        return [{ skill, dist: fakeDist, isSymlink: false }];
      }
      return [];
    });
  }

  const statusColor: Record<string, string> = {
    Linked: "bg-green-400",
    Broken: "bg-red-400",
    Pending: "bg-yellow-400",
  };

  async function handleRedetect() {
    if (!project.path || redetecting) return;
    setRedetecting(true);
    setDistError(null);
    try {
      await tauri.rescanProject(project.id);      await reload();
      onSkillsUpdated?.();
    } catch (e) {
      setDistError(String(e));
    } finally {
      setRedetecting(false);
    }
  }

  async function handleDropSkill(skillId: string, tool: Tool) {
    const toolPath = getToolProjectPath(tool);
    if (!toolPath) {
      setDropErrors((prev) => ({ ...prev, [tool]: "未配置工具项目路径" }));
      return;
    }
    setDropErrors((prev) => ({ ...prev, [tool]: "" }));
    try {
      await tauri.distributeToDir(skillId, tool, toolPath);
      await reload();
    } catch (e) {
      setDropErrors((prev) => ({ ...prev, [tool]: String(e) }));
    } finally {
      setDragOverTool(null);
    }
  }

  async function handleAddSkill() {
    if (!addSelectedSkillId || addSelectedTools.size === 0) return;
    setAddLoading(true);
    setDistError(null);
    try {
      await Promise.all(
        Array.from(addSelectedTools).map((tool) => {
          const toolPath = getToolProjectPath(tool);
          if (!toolPath) return Promise.resolve();
          return tauri.distributeToDir(addSelectedSkillId, tool, toolPath);
        })
      );
      await reload();
      setShowAddSkill(false);
      setAddSelectedSkillId(null);
      setAddSearch("");
    } catch (e) {
      setDistError(String(e));
    } finally {
      setAddLoading(false);
    }
  }

  async function handleDeleteProject() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await tauri.deleteProject(project.id);
      setShowDeleteConfirm(false);
      onProjectDeleted(project.id);
    } catch (e) {
      setDeleteError(String(e));
    } finally {
      setDeleting(false);
    }
  }

  const filteredAddSkills = allSkills.filter((s) =>
    s.name.toLowerCase().includes(addSearch.toLowerCase()) ||
    (s.description ?? "").toLowerCase().includes(addSearch.toLowerCase())
  );

  return (
    <main className="flex-1 flex flex-col p-8 min-h-0 overflow-y-auto">
      {/* Header */}
      <div className="mb-6 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-xl font-semibold text-[#1d1d1f]">{folderName}</h2>
          {project.path && (
            <button
              onClick={handleRedetect}
              disabled={redetecting}
              className="text-xs px-2.5 py-1 rounded-md border border-gray-200 text-[#424245] hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {redetecting ? "检测中..." : "重新检测"}
            </button>
          )}
          <button
            onClick={() => { setShowAddSkill(true); setAddSelectedSkillId(null); setAddSearch(""); }}
            className="text-xs px-2.5 py-1 rounded-md border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors"
          >
            添加 Skill
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="text-xs px-2.5 py-1 rounded-md border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
          >
            删除项目
          </button>
        </div>
        {project.path && (
          <p className="text-xs text-[#86868b] font-mono mt-0.5">{project.path}</p>
        )}
        {distError && (
          <p className="mt-2 text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-md">{distError}</p>
        )}
      </div>

      {/* Distribution status — per-tool project paths */}
      {project.path && (
        <div className="mb-6 shrink-0">
          <h3 className="text-sm font-medium text-[#1d1d1f] mb-3">分发状态</h3>
          <p className="text-[10px] text-[#86868b] mb-2">可从左侧导航拖拽 Skill 到工具卡片中分发</p>
          <div className="grid grid-cols-2 gap-3">
            {TOOLS.map((tool) => {
              const toolPath = getToolProjectPath(tool);
              const toolSkills = skillsInToolPath(tool);
              const toolPathParts = toolPath.split("/");
              const toolFolderName = toolPathParts[toolPathParts.length - 1] ?? "";
              const toolParentPath = toolPathParts.slice(0, -1).join("/") + "/";
              const isDragOver = dragOverTool === tool;

              return (
                <div
                  key={tool}
                  className={`relative border rounded-lg bg-white overflow-hidden transition-all ${
                    isDragOver ? "border-blue-400 shadow-md" : "border-gray-200"
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                    if (dragOverTool !== tool) setDragOverTool(tool);
                  }}
                  onDragEnter={(e) => { e.preventDefault(); setDragOverTool(tool); }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setDragOverTool(null);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const skillId = e.dataTransfer.getData("skill-id") || (window as unknown as Record<string, string>)["__draggedSkillId"];
                    setDragOverTool(null);
                    if (skillId) handleDropSkill(skillId, tool);
                  }}
                >
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                    <div className="text-xs font-medium text-[#1d1d1f]">{TOOL_DISPLAY_NAMES[tool]}</div>
                    {toolPath && (
                      <div className="flex flex-col mt-0.5">
                        <span className="text-[10px] text-[#1d1d1f] font-mono truncate">{toolFolderName}</span>
                        <span className="text-[10px] text-[#86868b] font-mono truncate" title={toolParentPath}>{toolParentPath}</span>
                      </div>
                    )}
                  </div>
                  {toolSkills.length === 0 ? (
                    <div className="px-3 py-3 text-[11px] text-[#86868b]">暂无</div>
                  ) : (
                    toolSkills.map(({ skill, dist, isSymlink }) => (
                      <button
                        key={skill.id}
                        onClick={() => onSelectSkill(skill)}
                        className="w-full px-3 py-2 flex items-center gap-2 border-t border-gray-100 hover:bg-gray-50 transition-colors text-left"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusColor[dist.status] ?? "bg-gray-300"}`} />
                        <span className="text-xs text-[#1d1d1f] truncate flex-1">{skill.name}</span>
                        <span className={`text-[9px] px-1 py-0.5 rounded leading-none shrink-0 ${isSymlink ? "bg-blue-50 text-blue-500" : "bg-gray-100 text-[#86868b]"}`}>
                          {isSymlink ? "symlink" : "文件夹"}
                        </span>
                      </button>
                    ))
                  )}
                  {dropErrors[tool] && (
                    <div className="px-3 py-1.5 text-[10px] text-red-500 border-t border-gray-100">{dropErrors[tool]}</div>
                  )}
                  {/* Drag overlay */}
                  {isDragOver && (
                    <div className="absolute inset-0 bg-blue-50/80 flex items-center justify-center pointer-events-none">
                      <span className="text-[11px] text-blue-600 font-medium">松开以分发</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Skills list */}
      <div className="mb-6 shrink-0">
        <h3 className="text-sm font-medium text-[#1d1d1f] mb-3">
          项目中的 Skills
          <span className="ml-2 text-xs font-normal text-[#86868b]">({detectedSkills.length})</span>
        </h3>

        {detectedSkills.length === 0 ? (
          <div className="text-sm text-[#86868b] py-2">
            {projectPath ? "暂未在此文件夹下检测到 Skill" : "暂无 Skill"}
          </div>
        ) : (
          <div className="space-y-2">
            {detectedSkills.map((skill) => (
              <button
                key={skill.id}
                onClick={() => onSelectSkill(skill)}
                className="w-full text-left border border-gray-200 rounded-lg bg-white hover:border-blue-200 hover:shadow-sm transition-all px-4 py-3"
              >
                <div className="text-sm font-medium text-[#1d1d1f] truncate">{skill.name}</div>
                {skill.description && (
                  <div className="text-xs text-[#86868b] mt-0.5 line-clamp-2">{skill.description}</div>
                )}
                <div className="text-[10px] text-[#86868b] font-mono mt-1 truncate" title={skill.source_path}>
                  {skill.source_path}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Add Skill modal */}
      {showAddSkill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-2xl w-[480px] max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-[#1d1d1f]">添加 Skill 到项目</h3>
              <button onClick={() => setShowAddSkill(false)} className="text-[#86868b] hover:text-[#1d1d1f] text-lg leading-none w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100">×</button>
            </div>
            <div className="flex flex-col gap-4 px-5 py-4 flex-1 overflow-hidden min-h-0">
              {/* Skill picker */}
              <div className="flex flex-col min-h-0">
                <label className="text-xs font-medium text-[#1d1d1f] mb-1.5">选择 Skill</label>
                <input
                  type="text"
                  value={addSearch}
                  onChange={(e) => setAddSearch(e.target.value)}
                  placeholder="搜索..."
                  className="text-xs px-2.5 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:border-blue-400 mb-2"
                  autoFocus
                />
                <div className="overflow-y-auto flex-1 border border-gray-200 rounded-md min-h-[120px] max-h-[220px]">
                  {filteredAddSkills.length === 0 ? (
                    <div className="p-3 text-xs text-[#86868b]">无匹配 Skill</div>
                  ) : (
                    filteredAddSkills.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setAddSelectedSkillId(s.id === addSelectedSkillId ? null : s.id)}
                        className={`w-full text-left px-3 py-2 border-b border-gray-100 last:border-b-0 transition-colors ${
                          addSelectedSkillId === s.id
                            ? "bg-blue-50 border-blue-100"
                            : "hover:bg-gray-50"
                        }`}
                      >
                        <div className="text-xs font-medium text-[#1d1d1f]">{s.name}</div>
                        {s.description && (
                          <div className="text-[10px] text-[#86868b] truncate">{s.description}</div>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
              {/* Tool selector */}
              <div>
                <label className="text-xs font-medium text-[#1d1d1f] mb-1.5 block">分发到工具路径</label>
                <div className="flex flex-wrap gap-2">
                  {TOOLS.map((tool) => (
                    <label key={tool} className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={addSelectedTools.has(tool)}
                        onChange={(e) => {
                          const next = new Set(addSelectedTools);
                          if (e.target.checked) next.add(tool);
                          else next.delete(tool);
                          setAddSelectedTools(next);
                        }}
                        className="rounded"
                      />
                      <span>{TOOL_DISPLAY_NAMES[tool]}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200">
              <button
                onClick={() => setShowAddSkill(false)}
                className="text-xs px-4 py-1.5 rounded-md border border-gray-300 text-[#424245] hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleAddSkill}
                disabled={!addSelectedSkillId || addSelectedTools.size === 0 || addLoading}
                className="text-xs px-4 py-1.5 rounded-md bg-[#1d1d1f] text-white hover:bg-[#424245] disabled:opacity-40"
              >
                {addLoading ? "分发中..." : "分发"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-xl p-6 w-80 flex flex-col gap-4">
            <h3 className="text-base font-semibold text-[#1d1d1f]">删除项目</h3>
            <p className="text-sm text-[#424245]">
              确认删除项目「{project.name}」？<br />
              <span className="text-[#86868b]">不会删除本地文件夹，仅从 AgentNexus 中移除记录。</span>
            </p>
            {deleteError && <p className="text-xs text-red-500">{deleteError}</p>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeleteError(null); }}
                disabled={deleting}
                className="px-3 py-1.5 text-sm rounded-md border border-gray-200 text-[#424245] hover:bg-gray-50 disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleDeleteProject}
                disabled={deleting}
                className="px-3 py-1.5 text-sm rounded-md bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
              >
                {deleting ? "删除中…" : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
