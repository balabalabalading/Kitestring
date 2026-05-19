import { useState, useEffect } from "react";
import type { Project, Skill, Distribution, AppConfig } from "../../types";
import { TOOL_DISPLAY_NAMES } from "../../types";
import * as tauri from "../../lib/tauri";
import { Dialog } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import DistributionMatrix from "./DistributionMatrix";

type Tool = "ClaudeCode" | "CopilotCLI" | "GeminiCLI" | "Codex" | "AgentFolder";
const TOOLS: Tool[] = ["ClaudeCode", "CopilotCLI", "GeminiCLI", "Codex", "AgentFolder"];

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

  async function handleDistribute(skillId: string, tool: Tool) {
    const toolPath = getToolProjectPath(tool);
    if (!toolPath) {
      setDistError("未配置工具项目路径");
      return;
    }
    setDistError(null);
    try {
      await tauri.distributeToDir(skillId, tool, toolPath);
      await reload();
    } catch (e) {
      setDistError(String(e));
    }
  }

  async function handleRemoveDist(distId: string) {
    setDistError(null);
    try {
      await tauri.removeDistribution(distId);
      await reload();
    } catch (e) {
      setDistError(String(e));
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

  const distributedToolsCount = TOOLS.filter((t) => skillsInToolPath(t).length > 0).length;

  return (
    <main className="flex-1 flex flex-col p-8 min-h-0 overflow-y-auto">
      {/* Header */}
      <div className="mb-6 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-xl font-semibold text-text-primary">{folderName}</h2>
          {project.path && (
            <Button variant="secondary" size="sm" onClick={handleRedetect} disabled={redetecting}>
              {redetecting ? "检测中..." : "重新检测"}
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { setShowAddSkill(true); setAddSelectedSkillId(null); setAddSearch(""); }}
          >
            添加 Skill
          </Button>
          <Button variant="ghost" size="sm" className="!text-status-broken" onClick={() => setShowDeleteConfirm(true)}>
            删除项目
          </Button>
        </div>
        {project.path && (
          <p className="text-xs text-text-tertiary font-mono mt-0.5">{project.path}</p>
        )}
        <p className="text-xs text-text-tertiary mt-1">
          {detectedSkills.length} 个技能 · {distributedToolsCount} 个工具已分发
        </p>
        {distError && (
          <p
            className="mt-2 text-xs text-status-broken px-3 py-1.5 rounded-radius-md"
            style={{ backgroundColor: "color-mix(in srgb, var(--status-broken) 10%, transparent)" }}
          >
            {distError}
          </p>
        )}
      </div>

      {/* Distribution matrix */}
      {project.path && (
        <div className="mb-6 shrink-0">
          <h3 className="font-normal text-text-primary mb-3"
            style={{ fontFamily: "var(--font-serif)", fontSize: "var(--font-size-h2)" }}
          >分发状态</h3>
          <DistributionMatrix
            skills={detectedSkills}
            tools={TOOLS}
            allDists={allDists}
            getToolProjectPath={getToolProjectPath}
            onDistribute={handleDistribute}
            onRemoveDist={handleRemoveDist}
          />
        </div>
      )}

      {/* Skills list */}
      <div className="mb-6 shrink-0">
        <h3 className="text-sm font-medium text-text-primary mb-3">
          项目中的 Skills
          <span className="ml-2 text-xs font-normal text-text-tertiary">({detectedSkills.length})</span>
        </h3>

        {detectedSkills.length === 0 ? (
          <div className="text-sm text-text-tertiary py-2">
            {projectPath ? "暂未在此文件夹下检测到 Skill" : "暂无 Skill"}
          </div>
        ) : (
          <div className="space-y-2">
            {detectedSkills.map((skill) => (
              <button
                key={skill.id}
                onClick={() => onSelectSkill(skill)}
                className="w-full text-left border border-border-subtle rounded-radius-lg bg-bg-surface hover:border-accent-sky/40 hover:shadow-sm transition-all px-4 py-3"
              >
                <div className="text-sm font-medium text-text-primary truncate">{skill.name}</div>
                {skill.description && (
                  <div className="text-xs text-text-tertiary mt-0.5 line-clamp-2">{skill.description}</div>
                )}
                <div className="text-[10px] text-text-tertiary font-mono mt-1 truncate" title={skill.source_path}>
                  {skill.source_path}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Add Skill dialog */}
      <Dialog open={showAddSkill} onClose={() => setShowAddSkill(false)} width="w-[480px]">
        <div className="p-5 flex flex-col gap-4 overflow-y-auto">
          <h3 className="text-sm font-semibold text-text-primary shrink-0">添加 Skill 到项目</h3>

          {/* Skill picker */}
          <div className="flex flex-col min-h-0">
            <label className="text-xs font-medium text-text-primary mb-1.5">选择 Skill</label>
            <Input
              value={addSearch}
              onChange={(e) => setAddSearch(e.target.value)}
              placeholder="搜索..."
              autoFocus
              className="mb-2"
            />
            <div className="overflow-y-auto border border-border-subtle rounded-radius-md min-h-[120px] max-h-[200px]">
              {filteredAddSkills.length === 0 ? (
                <div className="p-3 text-xs text-text-tertiary">无匹配 Skill</div>
              ) : (
                filteredAddSkills.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setAddSelectedSkillId(s.id === addSelectedSkillId ? null : s.id)}
                    className={`w-full text-left px-3 py-2 border-b border-border-subtle last:border-b-0 transition-colors ${
                      addSelectedSkillId === s.id
                        ? "bg-bg-elevated"
                        : "hover:bg-bg-surface"
                    }`}
                  >
                    <div className="text-xs font-medium text-text-primary">{s.name}</div>
                    {s.description && (
                      <div className="text-[10px] text-text-tertiary truncate">{s.description}</div>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Tool selector */}
          <div>
            <label className="text-xs font-medium text-text-primary mb-1.5 block">分发到工具路径</label>
            <div className="flex flex-wrap gap-3">
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
                  <span className="text-text-secondary">{TOOL_DISPLAY_NAMES[tool]}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 shrink-0">
            <Button variant="secondary" size="sm" onClick={() => setShowAddSkill(false)}>取消</Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleAddSkill}
              disabled={!addSelectedSkillId || addSelectedTools.size === 0 || addLoading}
            >
              {addLoading ? "分发中..." : "分发"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteConfirm} onClose={() => { setShowDeleteConfirm(false); setDeleteError(null); }}>
        <div className="p-5 flex flex-col gap-4">
          <h3 className="text-base font-semibold text-text-primary">删除项目</h3>
          <p className="text-sm text-text-secondary">
            确认删除项目「{project.name}」？<br />
            <span className="text-text-tertiary">不会删除本地文件夹，仅从 Kitestring 中移除记录。</span>
          </p>
          {deleteError && <p className="text-xs text-status-broken">{deleteError}</p>}
          <div className="flex gap-2 justify-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { setShowDeleteConfirm(false); setDeleteError(null); }}
              disabled={deleting}
            >
              取消
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="!text-status-broken"
              onClick={handleDeleteProject}
              disabled={deleting}
            >
              {deleting ? "删除中…" : "确认删除"}
            </Button>
          </div>
        </div>
      </Dialog>
    </main>
  );
}
