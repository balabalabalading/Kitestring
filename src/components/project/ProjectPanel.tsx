import { useState, useEffect } from "react";
import type { Project, Skill, Distribution, AppConfig } from "../../types";
import { TOOL_DISPLAY_NAMES } from "../../types";
import * as tauri from "../../lib/tauri";
import { Dialog } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import DistributionMatrix from "./DistributionMatrix";
import { useI18n } from "../../i18n/I18nProvider";
import { translateError } from "../../i18n/errors";

type Tool = "ClaudeCode" | "CopilotCLI" | "GeminiCLI" | "Codex" | "AgentFolder";
const TOOLS: Tool[] = ["ClaudeCode", "CopilotCLI", "GeminiCLI", "Codex", "AgentFolder"];

interface ProjectPanelProps {
  project: Project;
  onProjectDeleted: (id: string) => void;
  onSelectSkill: (skill: Skill) => void;
  onSkillsUpdated?: () => void;
}

export default function ProjectPanel({ project, onProjectDeleted, onSelectSkill, onSkillsUpdated }: ProjectPanelProps) {
  const { locale, t } = useI18n();
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
      setDistError(translateError(e, locale));
    } finally {
      setRedetecting(false);
    }
  }

  async function handleDistribute(skillId: string, tool: Tool) {
    const toolPath = getToolProjectPath(tool);
    if (!toolPath) {
      setDistError(t("project.errorToolPathMissing"));
      return;
    }
    setDistError(null);
    try {
      await tauri.distributeToDir(skillId, tool, toolPath);
      await reload();
    } catch (e) {
      setDistError(translateError(e, locale));
    }
  }

  async function handleRemoveDist(distId: string) {
    setDistError(null);
    try {
      await tauri.removeDistribution(distId);
      await reload();
    } catch (e) {
      setDistError(translateError(e, locale));
    }
  }

  async function handleAddSkill() {
    if (!addSelectedSkillId || addSelectedTools.size === 0) return;
    setAddLoading(true);
    setDistError(null);
    try {
      for (const tool of Array.from(addSelectedTools)) {
        const toolPath = getToolProjectPath(tool);
        if (!toolPath) continue;
        await tauri.distributeToDir(addSelectedSkillId, tool, toolPath);
      }
      await reload();
      setShowAddSkill(false);
      setAddSelectedSkillId(null);
      setAddSearch("");
    } catch (e) {
      setDistError(translateError(e, locale));
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
      setDeleteError(translateError(e, locale));
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
    <main className="flex-1 flex flex-col px-6 py-8 gap-5 min-h-0 overflow-y-auto">
      {/* Identity Card/Project */}
      <div className="bg-bg-elevated rounded-[12px] px-6 py-3 flex flex-col gap-3 shrink-0">
        {/* Head: title + desc */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3 h-8">
            <h2 className="text-[22px] font-medium text-text-primary leading-none">
              {folderName}
            </h2>
          </div>
        </div>

        {/* Meta rows */}
        <div className="flex flex-col gap-1">
          {project.path && (
            <div className="flex items-center gap-3 h-[14px]">
              <span className="text-[10px] font-semibold text-text-tertiary w-5 shrink-0">{t("project.path")}</span>
              <span className="text-[10px] text-text-secondary font-mono truncate">{project.path}</span>
            </div>
          )}
          <div className="flex items-center gap-3 h-[14px]">
            <span className="text-[10px] font-semibold text-text-tertiary w-5 shrink-0">{t("project.skills")}</span>
            <span className="text-[10px] text-text-secondary">
              {t("project.summary", { skills: detectedSkills.length, tools: distributedToolsCount })}
            </span>
          </div>
        </div>

        {distError && (
          <p
            className="text-xs text-status-broken px-3 py-1.5 rounded-sm"
            style={{ backgroundColor: "color-mix(in srgb, var(--status-broken) 10%, transparent)" }}
          >
            {distError}
          </p>
        )}

        {/* Buttons */}
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { setShowAddSkill(true); setAddSelectedSkillId(null); setAddSearch(""); }}
          >
            {t("project.addSkill")}
          </Button>
          {project.path && (
            <Button variant="secondary" size="sm" onClick={handleRedetect} disabled={redetecting}>
              {redetecting ? t("project.detecting") : t("project.rescan")}
            </Button>
          )}
          <Button variant="ghost" size="sm" danger onClick={() => setShowDeleteConfirm(true)}>
            {t("common.delete")}
          </Button>
        </div>
      </div>

      {/* Project Skills List (matrix) */}
      {project.path && (
        <div className="shrink-0">
          <DistributionMatrix
            skills={detectedSkills}
            tools={TOOLS}
            allDists={allDists}
            getToolProjectPath={getToolProjectPath}
            onDistribute={handleDistribute}
            onRemoveDist={handleRemoveDist}
            onSelectSkill={onSelectSkill}
          />
        </div>
      )}

      {/* No path: simple skills list */}
      {!project.path && (
        <div className="shrink-0">
          {detectedSkills.length === 0 ? (
            <div className="text-sm text-text-tertiary py-2">{t("project.noSkill")}</div>
          ) : (
            <div className="flex flex-col gap-2">
              {detectedSkills.map((skill) => (
                <button
                  key={skill.id}
                  onClick={() => onSelectSkill(skill)}
                  className="w-full text-left h-[40px] flex items-center gap-2 px-2 hover:bg-bg-surface transition-colors rounded"
                >
                  <span className="text-[12px] text-text-primary truncate">{skill.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Skill dialog */}
      <Dialog open={showAddSkill} onClose={() => setShowAddSkill(false)} width="w-[480px]">
        <div className="p-5 flex flex-col gap-4 overflow-y-auto">
          <h3 className="text-sm font-normal text-text-primary shrink-0">{t("project.addSkillTitle")}</h3>

          {/* Skill picker */}
          <div className="flex flex-col min-h-0">
            <label className="text-xs font-normal text-text-secondary mb-1.5">{t("project.selectSkill")}</label>
            <Input
              value={addSearch}
              onChange={(e) => setAddSearch(e.target.value)}
              placeholder={t("common.search")}
              autoFocus
              className="mb-2"
            />
            <div className="overflow-y-auto border border-border-subtle rounded-md min-h-[120px] max-h-[200px]">
              {filteredAddSkills.length === 0 ? (
                <div className="p-3 text-xs text-text-tertiary">{t("project.noMatchedSkill")}</div>
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
            <label className="text-xs font-normal text-text-secondary mb-1.5 block">{t("project.distributeToToolPath")}</label>
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
            <Button variant="secondary" size="sm" onClick={() => setShowAddSkill(false)}>{t("common.cancel")}</Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleAddSkill}
              disabled={!addSelectedSkillId || addSelectedTools.size === 0 || addLoading}
            >
              {addLoading ? t("common.distributing") : t("common.distribute")}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteConfirm} onClose={() => { setShowDeleteConfirm(false); setDeleteError(null); }}>
        <div className="p-6 flex flex-col gap-4">
          <h3 className="text-[14px] font-normal text-text-primary">{t("project.deleteTitle")}</h3>
          <p className="text-[13px] text-text-secondary">
            {t("project.deleteConfirm", { name: project.name })}<br />
            <span className="text-text-tertiary">{t("project.deleteKeepsFolder")}</span>
          </p>
          {deleteError && <p className="text-xs text-status-broken">{deleteError}</p>}
          <div className="flex gap-2 justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setShowDeleteConfirm(false); setDeleteError(null); }}
              disabled={deleting}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              danger
              onClick={handleDeleteProject}
              disabled={deleting}
            >
              {deleting ? t("common.deleting") : t("project.confirmDelete")}
            </Button>
          </div>
        </div>
      </Dialog>
    </main>
  );
}
