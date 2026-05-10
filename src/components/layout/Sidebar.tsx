import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { Skill, Project } from "../../types";
import * as tauri from "../../lib/tauri";

interface SidebarProps {
  selectedSkill: Skill | null;
  onSelectSkill: (skill: Skill) => void;
}

export default function Sidebar({ selectedSkill, onSelectSkill }: SidebarProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showImportMenu, setShowImportMenu] = useState(false);
  const [importType, setImportType] = useState<"local" | "github" | null>(null);
  const [importUrl, setImportUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const msg = [];
      if (result.new_skills.length > 0) msg.push(`新增: ${result.new_skills.join(", ")}`);
      if (result.removed_skills.length > 0) msg.push(`移除: ${result.removed_skills.join(", ")}`);
      if (msg.length === 0) {
        setError(null);
      }
    } catch (e) {
      setError(String(e));
    }
  }

  const projectSkills = projects.map((p) => ({
    project: p,
    skills: skills.filter((s) => s.project_id === p.id),
  }));

  const globalSkills = skills.filter((s) => !s.project_id);

  return (
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
        {projectSkills.map(({ project, skills: pSkills }) => (
          <div key={project.id} className="mb-1">
            <div className="px-4 py-1.5 text-xs font-medium text-[#86868b] uppercase tracking-wider">
              {project.name}
            </div>
            {pSkills.map((skill) => (
              <SkillItem
                key={skill.id}
                skill={skill}
                selected={selectedSkill?.id === skill.id}
                onSelect={() => onSelectSkill(skill)}
                onPullGithub={handlePullGithub}
              />
            ))}
          </div>
        ))}

        {globalSkills.length > 0 && (
          <div className="mt-2">
            <div className="px-4 py-1.5 text-xs font-medium text-[#86868b] uppercase tracking-wider">
              全局 Skills
            </div>
            {globalSkills.map((skill) => (
              <SkillItem
                key={skill.id}
                skill={skill}
                selected={selectedSkill?.id === skill.id}
                onSelect={() => onSelectSkill(skill)}
                onPullGithub={handlePullGithub}
              />
            ))}
          </div>
        )}

        {skills.length === 0 && !importType && (
          <div className="px-4 py-8 text-center text-xs text-[#86868b]">
            点击右上角 + 导入第一个 Skill
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-200 text-xs text-[#86868b]">
        v0.1.0
      </div>
    </aside>
  );
}

function SkillItem({
  skill,
  selected,
  onSelect,
  onPullGithub,
}: {
  skill: Skill;
  selected: boolean;
  onSelect: () => void;
  onPullGithub: (skill: Skill) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="relative group">
      <button
        onClick={onSelect}
        className={`w-full text-left px-5 py-1.5 text-sm transition-colors flex items-center justify-between ${
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
