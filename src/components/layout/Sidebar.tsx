import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { Skill, Project } from "../../types";
import * as tauri from "../../lib/tauri";
import SettingsPanel from "./SettingsPanel";
import CreateProjectDialog from "../project/CreateProjectDialog";

interface SidebarProps {
  selectedSkill: Skill | null;
  onSelectSkill: (skill: Skill | null) => void;
}

export default function Sidebar({ selectedSkill, onSelectSkill }: SidebarProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showImportMenu, setShowImportMenu] = useState(false);
  const [importType, setImportType] = useState<"local" | "github" | null>(null);
  const [importUrl, setImportUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [skillList, projectList] = await Promise.all([
        tauri.listSkills(),
        tauri.listProjects(),
      ]);
      setSkills(skillList);
      setProjects(projectList);
    } catch (e) {
      console.error("Failed to load data:", e);
    }
  }

  async function handleLocalImport() {
    const selected = await open({ directory: true, multiple: false });
    if (!selected) return;

    const path = typeof selected === "string" ? selected : selected;
    if (!path) return;

    setLoading(true);
    setError(null);
    try {
      const newSkills = await tauri.importLocalSkill(path);
      if (newSkills.length === 0) {
        setError("未找到 SKILL.md，该文件夹可能不包含有效 Skill");
      } else {
        setSkills((prev) => [...prev, ...newSkills]);
        setImportType(null);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleGithubImport() {
    if (!importUrl.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const newSkills = await tauri.importGithubSkill(importUrl.trim());
      if (newSkills.length === 0) {
        setError("未在仓库中找到 SKILL.md");
      } else {
        setSkills((prev) => [...prev, ...newSkills]);
        setImportType(null);
        setImportUrl("");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handlePullGithub(skill: Skill) {
    try {
      const result = await tauri.pullGithubSkill(skill.id);
      if (result.new_skills.length > 0 || result.removed_skills.length > 0) {
        await loadData();
      }
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleDeleteSkill(skill: Skill) {
    try {
      await tauri.deleteSkill(skill.id);
      setSkills((prev) => prev.filter((s) => s.id !== skill.id));
      if (selectedSkill?.id === skill.id) {
        onSelectSkill(null);
      }
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleDeleteProject(project: Project) {
    try {
      await tauri.deleteProject(project.id);
      // Unassign skills in local state
      setSkills((prev) =>
        prev.map((s) => (s.project_id === project.id ? { ...s, project_id: null } : s))
      );
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
    } catch (e) {
      setError(String(e));
    }
  }

  function handleProjectCreated(project: Project) {
    setProjects((prev) => [...prev, project]);
    setShowCreateProject(false);
  }

  const projectSkills = projects.map((p) => ({
    project: p,
    skills: skills.filter((s) => s.project_id === p.id),
  }));

  const globalSkills = skills.filter((s) => !s.project_id);

  return (
    <>
      <aside className="w-[260px] min-w-[260px] border-r border-gray-200 flex flex-col bg-[#f5f5f7] h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h1 className="text-sm font-semibold text-[#1d1d1f] tracking-tight">
            AgentNexus
          </h1>
          <div className="relative">
            <button
              onClick={() => setShowImportMenu(!showImportMenu)}
              className="w-7 h-7 rounded-md hover:bg-gray-200 flex items-center justify-center text-[#86868b] hover:text-[#1d1d1f] transition-colors"
            >
              +
            </button>
            {showImportMenu && (
              <div className="absolute right-0 top-8 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10 w-40">
                <button
                  onClick={() => {
                    setImportType("local");
                    setShowImportMenu(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100"
                >
                  本地导入
                </button>
                <button
                  onClick={() => {
                    setImportType("github");
                    setShowImportMenu(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100"
                >
                  Github 导入
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Import Panel */}
        {importType && (
          <div className="px-3 py-3 border-b border-gray-200 bg-white">
            <div className="text-xs font-medium text-[#86868b] mb-2">
              {importType === "local" ? "本地文件夹导入" : "Github 项目导入"}
            </div>
            {importType === "local" ? (
              <button
                onClick={handleLocalImport}
                disabled={loading}
                className="w-full text-xs px-3 py-2 bg-[#1d1d1f] text-white rounded-md hover:bg-[#424245] disabled:opacity-50 transition-colors"
              >
                {loading ? "导入中..." : "选择文件夹"}
              </button>
            ) : (
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="https://github.com/..."
                  className="flex-1 text-xs px-2 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:border-blue-400"
                  onKeyDown={(e) => e.key === "Enter" && handleGithubImport()}
                />
                <button
                  onClick={handleGithubImport}
                  disabled={loading}
                  className="text-xs px-2.5 py-1.5 bg-[#1d1d1f] text-white rounded-md hover:bg-[#424245] disabled:opacity-50"
                >
                  {loading ? "..." : "导入"}
                </button>
              </div>
            )}
            {error && (
              <div className="mt-2 text-xs text-red-500 bg-red-50 px-2 py-1.5 rounded-md">
                {error}
              </div>
            )}
            <button
              onClick={() => {
                setImportType(null);
                setImportUrl("");
                setError(null);
              }}
              className="mt-2 text-xs text-[#86868b] hover:text-[#1d1d1f]"
            >
              取消
            </button>
          </div>
        )}

        {/* Skill List */}
        <nav className="flex-1 overflow-y-auto py-2">
          {/* Projects */}
          {projects.length > 0 && (
            <div className="mb-1">
              <div className="flex items-center justify-between px-4 py-1.5">
                <span className="text-xs font-medium text-[#86868b] uppercase tracking-wider">
                  项目
                </span>
                <button
                  onClick={() => setShowCreateProject(true)}
                  title="新建项目"
                  className="w-4 h-4 flex items-center justify-center text-[#86868b] hover:text-[#1d1d1f] text-base leading-none"
                >
                  +
                </button>
              </div>
              {projectSkills.map(({ project, skills: pSkills }) => (
                <ProjectSection
                  key={project.id}
                  project={project}
                  skills={pSkills}
                  selectedSkill={selectedSkill}
                  onSelectSkill={onSelectSkill}
                  onPullGithub={handlePullGithub}
                  onDeleteSkill={handleDeleteSkill}
                  onDeleteProject={handleDeleteProject}
                />
              ))}
            </div>
          )}

          {/* Global Skills */}
          <div>
            <div className="flex items-center justify-between px-4 py-1.5">
              <span className="text-xs font-medium text-[#86868b] uppercase tracking-wider">
                全局 Skills
              </span>
              {projects.length === 0 && (
                <button
                  onClick={() => setShowCreateProject(true)}
                  title="新建项目"
                  className="w-4 h-4 flex items-center justify-center text-[#86868b] hover:text-[#1d1d1f] text-base leading-none"
                >
                  +
                </button>
              )}
            </div>
            {globalSkills.map((skill) => (
              <SkillItem
                key={skill.id}
                skill={skill}
                selected={selectedSkill?.id === skill.id}
                onSelect={() => onSelectSkill(skill)}
                onPullGithub={handlePullGithub}
                onDelete={handleDeleteSkill}
              />
            ))}
          </div>

          {skills.length === 0 && !importType && (
            <div className="px-4 py-8 text-center text-xs text-[#86868b]">
              点击右上角 + 导入第一个 Skill
            </div>
          )}
        </nav>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-200 flex items-center justify-between">
          <span className="text-xs text-[#86868b]">v0.1.0</span>
          <button
            onClick={() => setShowSettings(true)}
            title="设置"
            className="w-6 h-6 rounded-md flex items-center justify-center text-[#86868b] hover:bg-gray-200 hover:text-[#1d1d1f] transition-colors"
          >
            ⚙
          </button>
        </div>
      </aside>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {showCreateProject && (
        <CreateProjectDialog
          onCreated={handleProjectCreated}
          onClose={() => setShowCreateProject(false)}
        />
      )}
    </>
  );
}

function ProjectSection({
  project,
  skills,
  selectedSkill,
  onSelectSkill,
  onPullGithub,
  onDeleteSkill,
  onDeleteProject,
}: {
  project: Project;
  skills: Skill[];
  selectedSkill: Skill | null;
  onSelectSkill: (skill: Skill | null) => void;
  onPullGithub: (skill: Skill) => void;
  onDeleteSkill: (skill: Skill) => void;
  onDeleteProject: (project: Project) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="mb-1">
      <div className="relative group flex items-center px-4 py-1">
        <span className="text-xs font-medium text-[#1d1d1f] flex-1 truncate">{project.name}</span>
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="w-5 h-5 rounded flex items-center justify-center text-[#86868b] hover:bg-gray-200 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
        >
          ...
        </button>
        {showMenu && (
          <div className="absolute right-2 top-5 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20 w-28">
            <button
              onClick={() => {
                onDeleteProject(project);
                setShowMenu(false);
              }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 text-red-500"
            >
              删除项目
            </button>
            <button
              onClick={() => setShowMenu(false)}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 text-[#86868b]"
            >
              关闭
            </button>
          </div>
        )}
      </div>
      {skills.map((skill) => (
        <SkillItem
          key={skill.id}
          skill={skill}
          selected={selectedSkill?.id === skill.id}
          onSelect={() => onSelectSkill(skill)}
          onPullGithub={onPullGithub}
          onDelete={onDeleteSkill}
          indent
        />
      ))}
    </div>
  );
}

function SkillItem({
  skill,
  selected,
  onSelect,
  onPullGithub,
  onDelete,
  indent = false,
}: {
  skill: Skill;
  selected: boolean;
  onSelect: () => void;
  onPullGithub: (skill: Skill) => void;
  onDelete: (skill: Skill) => void;
  indent?: boolean;
}) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="relative group">
      <button
        onClick={onSelect}
        className={`w-full text-left py-1.5 text-sm transition-colors flex items-center justify-between ${
          indent ? "px-7" : "px-5"
        } ${
          selected
            ? "bg-white text-[#1d1d1f] font-medium"
            : "text-[#424245] hover:bg-white/60"
        }`}
      >
        <span className="truncate">{skill.name}</span>
        <span className="text-[9px] text-[#86868b] opacity-0 group-hover:opacity-100 transition-opacity">
          {skill.source_type === "Github" ? "GH" : "LC"}
        </span>
      </button>
      {selected && (
        <div className="absolute right-1 top-1/2 -translate-y-1/2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="w-5 h-5 rounded flex items-center justify-center text-[#86868b] hover:bg-gray-200 text-xs"
          >
            ...
          </button>
          {showMenu && (
            <div className="absolute right-0 top-5 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20 w-36">
              {skill.source_type === "Github" && (
                <button
                  onClick={() => {
                    onPullGithub(skill);
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100"
                >
                  拉取更新
                </button>
              )}
              <button
                onClick={() => {
                  onDelete(skill);
                  setShowMenu(false);
                }}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 text-red-500"
              >
                删除
              </button>
              <button
                onClick={() => setShowMenu(false)}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 text-[#86868b]"
              >
                关闭
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

