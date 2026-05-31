import { useState, useEffect, useCallback } from "react";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { open } from "@tauri-apps/plugin-dialog";
import type { Skill, Project } from "../../types";
import * as tauri from "../../lib/tauri";
import SettingsPanel from "./SettingsPanel";
import CreateProjectDialog from "../project/CreateProjectDialog";
import { Dialog } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

interface SidebarProps {
  selectedSkill: Skill | null;
  onSelectSkill: (skill: Skill | null) => void;
  onSkillsCleared?: () => void;
  onSkillsLoaded?: (count: number) => void;
  selectedProject: Project | null;
  onSelectProject: (project: Project | null) => void;
}

export default function Sidebar({ selectedSkill, onSelectSkill: onSelectSkillProp, onSkillsCleared, onSkillsLoaded, selectedProject, onSelectProject: onSelectProjectProp }: SidebarProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"skills" | "projects">("skills");
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importTab, setImportTab] = useState<"local" | "github">("local");
  const [importLocalPath, setImportLocalPath] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  // Grouping dialog
  const [pendingGroupSkills, setPendingGroupSkills] = useState<Skill[]>([]);
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [groupName, setGroupName] = useState("未命名");
  // Create group
  const [serverGroups, setServerGroups] = useState<string[]>([]);
  const [showCreateGroupDialog, setShowCreateGroupDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupSelectedSkills, setNewGroupSelectedSkills] = useState<Set<string>>(new Set());
  const [newGroupSearch, setNewGroupSearch] = useState("");
  // Per-group collapse state, persisted in localStorage
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("kitestring_collapsed_groups");
      return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });
  // Drag-over group
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);
  // GitHub import conflict handling
  const [pendingConflicts, setPendingConflicts] = useState<tauri.GithubConflict[]>([]);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [currentConflict, setCurrentConflict] = useState<tauri.GithubConflict | null>(null);

  // Responsive state
  const bp = useBreakpoint();
  const isNarrow = bp === "narrow";
  const [overlayOpen, setOverlayOpen] = useState(false);
  useEffect(() => {
    if (!isNarrow) setOverlayOpen(false);
  }, [isNarrow]);

  const onSelectSkill = useCallback((s: Skill | null) => {
    onSelectSkillProp(s);
    setOverlayOpen(false);
  }, [onSelectSkillProp]);
  const onSelectProject = useCallback((p: Project | null) => {
    onSelectProjectProp(p);
    setOverlayOpen(false);
  }, [onSelectProjectProp]);

  // Auto-switch tab when selection changes from parent
  useEffect(() => {
    if (selectedSkill) setActiveTab("skills");
  }, [selectedSkill]);
  useEffect(() => {
    if (selectedProject) setActiveTab("projects");
  }, [selectedProject]);

  function openNextConflict(queue: tauri.GithubConflict[]) {
    if (queue.length === 0) {
      setShowConflictDialog(false);
      setCurrentConflict(null);
      return;
    }
    const [first, ...rest] = queue;
    setPendingConflicts(rest);
    setCurrentConflict(first);
    setShowConflictDialog(true);
  }

  async function handleConflictPull() {
    if (!currentConflict) return;
    setShowConflictDialog(false);
    try {
      await tauri.pullGithubSkill(currentConflict.existing_skill_id);
      const existing = skills.find((s) => s.id === currentConflict.existing_skill_id);
      if (existing) onSelectSkill(existing);
      await loadData();
    } catch (e) {
      setError(String(e));
    }
    openNextConflict(pendingConflicts);
  }

  async function handleConflictCreate() {
    if (!currentConflict) return;
    setShowConflictDialog(false);
    try {
      const newSkill = await tauri.forceImportSkill(currentConflict.source_path, currentConflict.github_url);
      setSkills((prev) => [...prev, newSkill]);
      await loadData();
    } catch (e) {
      setError(String(e));
    }
    openNextConflict(pendingConflicts);
  }

  function handleConflictSkip() {
    openNextConflict(pendingConflicts);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [skillList, projectList, groupList] = await Promise.all([
        tauri.listSkills(),
        tauri.listProjects(),
        tauri.listGroups(),
      ]);
      setSkills(skillList);
      setProjects(projectList);
      setServerGroups(groupList);
      onSkillsLoaded?.(skillList.length);
    } catch (e) {
      console.error("Failed to load data:", e);
    }
  }

  function closeImportDialog() {
    setShowImportDialog(false);
    setImportLocalPath("");
    setImportUrl("");
    setError(null);
  }

  async function handleSelectFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string" && selected) setImportLocalPath(selected);
  }

  async function handleLocalImportConfirm() {
    if (!importLocalPath) return;
    setLoading(true);
    setError(null);
    try {
      const newSkills = await tauri.importLocalSkill(importLocalPath);
      if (newSkills.length === 0) {
        setError("未找到 SKILL.md，该文件夹可能不包含有效 Skill");
      } else {
        setSkills((prev) => {
          const existingIds = new Set(prev.map((s) => s.id));
          return [...prev, ...newSkills.filter((s) => !existingIds.has(s.id))];
        });
        closeImportDialog();
        if (newSkills.length > 1) {
          setPendingGroupSkills(newSkills);
          setGroupName("未命名");
          setShowGroupDialog(true);
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmGroup() {
    await Promise.all(pendingGroupSkills.map((s) => tauri.setSkillGroup(s.id, groupName.trim() || "未命名")));
    setShowGroupDialog(false);
    await loadData();
  }

  async function handleCreateGroup() {
    const name = newGroupName.trim();
    if (!name || newGroupSelectedSkills.size === 0) return;
    try {
      await tauri.createGroup(name);
      await Promise.all([...newGroupSelectedSkills].map((id) => tauri.setSkillGroup(id, name)));
      setServerGroups((prev) => prev.includes(name) ? prev : [...prev, name]);
      await loadData();
    } catch (e) {
      console.error("Failed to create group:", e);
    }
    setShowCreateGroupDialog(false);
    setNewGroupName("");
    setNewGroupSelectedSkills(new Set());
  }

  function toggleGroupCollapse(label: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      try {
        localStorage.setItem("kitestring_collapsed_groups", JSON.stringify([...next]));
      } catch { /* ignore */ }
      return next;
    });
  }

  async function handleDeleteGroup(name: string) {
    try {
      await tauri.deleteGroup(name);
      setServerGroups((prev) => prev.filter((g) => g !== name));
      await loadData();
    } catch (e) {
      console.error("Failed to delete group:", e);
    }
  }

  async function handleDropOnGroup(e: React.DragEvent, groupLabel: string) {
    e.preventDefault();
    const skillId = e.dataTransfer.getData("skill-id") || (window as unknown as Record<string, string>)["__draggedSkillId"];
    setDragOverGroup(null);
    if (!skillId) return;
    const skill = skills.find((s) => s.id === skillId);
    if (skill?.group === groupLabel) return;
    await tauri.setSkillGroup(skillId, groupLabel);
    await loadData();
  }

  async function handleGithubImport() {
    if (!importUrl.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await tauri.importGithubSkill(importUrl.trim());
      const { imported, conflicts } = result;
      if (imported.length === 0 && conflicts.length === 0) {
        setError("未在仓库中找到 SKILL.md");
      } else {
        if (imported.length > 0) {
          setSkills((prev) => {
            const existingIds = new Set(prev.map((s) => s.id));
            return [...prev, ...imported.filter((s) => !existingIds.has(s.id))];
          });
        }
        closeImportDialog();
        if (conflicts.length > 0) {
          openNextConflict(conflicts);
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleProjectCreated(_project: Project) {
    setShowCreateProject(false);
    await loadData();
  }

  // Sort and filter skills
  const sortedSkills = [...skills].sort((a, b) => a.name.localeCompare(b.name));
  const lowerQuery = query.toLowerCase();
  const filteredSkills = lowerQuery
    ? sortedSkills.filter((s) => s.name.toLowerCase().includes(lowerQuery))
    : sortedSkills;

  // Group skills
  const groupedSkills: Map<string, Skill[]> = new Map();
  const ungroupedSkills: Skill[] = [];
  for (const skill of filteredSkills) {
    if (skill.group) {
      if (!groupedSkills.has(skill.group)) groupedSkills.set(skill.group, []);
      groupedSkills.get(skill.group)!.push(skill);
    } else {
      ungroupedSkills.push(skill);
    }
  }
  const allGroupLabels = Array.from(new Set([
    ...Array.from(groupedSkills.keys()),
    ...serverGroups,
  ])).sort();

  const hasSkills = skills.length > 0;

  const sidebarInner = (
    <>
      {/* Brand strip */}
      <div
        className="h-[var(--brand-strip-height)] w-full shrink-0 animate-[brand-breathe_6s_ease-in-out_infinite]"
        style={{ background: "var(--gradient-skyline)" }}
      />

      {/* App title */}
      <div className="px-4 pt-4 pb-2 shrink-0">
        <div
          className="text-text-primary font-normal leading-tight"
          style={{ fontFamily: "var(--font-serif)", fontSize: "var(--font-size-h1)" }}
        >
          Kitestring
        </div>
        <div className="text-xs text-text-tertiary mt-0.5">AI 技能管理器</div>
      </div>

      {/* Tabs */}
      <div className="flex items-center px-4 gap-4 shrink-0 border-b border-border-subtle">
        {(["skills", "projects"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              if (tab === "skills") onSelectProject(null);
              else onSelectSkill(null);
            }}
            className={`py-2 text-[10px] font-semibold tracking-wider uppercase border-b-2 transition-colors ${
              activeTab === tab
                ? "border-accent-warm text-accent-warm"
                : "border-transparent text-text-tertiary hover:text-text-secondary"
            }`}
          >
            {tab === "skills" ? "Skills" : "Projects"}
          </button>
        ))}
      </div>

      {/* Content */}
      <nav className="flex-1 overflow-y-auto py-1">
        {activeTab === "skills" ? (
          <>
            {/* Search + create group toolbar */}
            <div className="px-3 py-1.5 flex items-center gap-2">
              <div className="relative flex-1">
                <svg
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-tertiary pointer-events-none"
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
                </svg>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索 Skills..."
                  className="w-full text-xs pl-6 pr-2 py-1 rounded-sm bg-bg-elevated border border-border-subtle focus:outline-none focus:border-border-accent text-text-primary placeholder-text-tertiary"
                />
              </div>
              <button
                onClick={() => { setNewGroupName(""); setNewGroupSelectedSkills(new Set()); setNewGroupSearch(""); setShowCreateGroupDialog(true); }}
                title="创建分组"
                className="w-6 h-6 rounded-sm hover:bg-bg-elevated flex items-center justify-center text-text-tertiary hover:text-text-primary transition-colors shrink-0"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                </svg>
              </button>
            </div>

            {/* Grouped skills */}
            {allGroupLabels.map((groupLabel) => {
              const groupSkills = groupedSkills.get(groupLabel) ?? [];
              const isOver = dragOverGroup === groupLabel;
              const isGroupCollapsed = collapsedGroups.has(groupLabel);
              return (
                <div key={groupLabel}>
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOverGroup(groupLabel); }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverGroup(null);
                    }}
                    onDrop={(e) => handleDropOnGroup(e, groupLabel)}
                    className={`px-3 pt-1.5 pb-0.5 text-[10px] font-semibold text-text-tertiary uppercase tracking-wide flex items-center gap-1 rounded-sm transition-colors border border-dashed ${
                      isOver ? "bg-accent-sky-soft text-accent-sky border-accent-sky" : "border-transparent"
                    }`}
                  >
                    <button
                      onClick={() => toggleGroupCollapse(groupLabel)}
                      className="shrink-0 text-text-tertiary hover:text-text-primary transition-colors"
                      title={isGroupCollapsed ? "展开分组" : "折叠分组"}
                    >
                      <svg className={`w-2.5 h-2.5 transition-transform ${isGroupCollapsed ? "" : "rotate-90"}`} fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5l8 7-8 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                      </svg>
                    </button>
                    <svg className="w-2.5 h-2.5 shrink-0 opacity-60" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                    </svg>
                    <span className="truncate">{groupLabel}</span>
                    {!isOver && (
                      <span className="ml-auto text-[9px] normal-case font-normal opacity-60 shrink-0">{groupSkills.length}</span>
                    )}
                    {isOver && <span className="ml-auto text-[9px] normal-case font-normal">拖入</span>}
                    {!isOver && groupSkills.length === 0 && (
                      <button
                        onClick={() => handleDeleteGroup(groupLabel)}
                        className="text-text-tertiary hover:text-status-broken transition-colors"
                        title="删除空分组"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  {!isGroupCollapsed && groupSkills.map((skill) => (
                    <SkillItem
                      key={skill.id}
                      skill={skill}
                      selected={selectedSkill?.id === skill.id}
                      onSelect={() => onSelectSkill(skill)}
                      indent
                    />
                  ))}
                </div>
              );
            })}

            {ungroupedSkills.map((skill) => (
              <SkillItem
                key={skill.id}
                skill={skill}
                selected={selectedSkill?.id === skill.id}
                onSelect={() => onSelectSkill(skill)}
              />
            ))}

            {!hasSkills && (
              <div className="px-5 py-4 text-xs text-text-tertiary">
                点击下方「+ 导入 Skill」开始
              </div>
            )}
            {hasSkills && filteredSkills.length === 0 && query && (
              <div className="px-5 py-3 text-xs text-text-tertiary leading-relaxed">
                <div>没有匹配的结果</div>
                <div className="text-[10px] mt-0.5">尝试更换关键词</div>
              </div>
            )}
          </>
        ) : (
          <>
            {projects.length === 0 ? (
              <div className="px-5 py-4 text-xs text-text-tertiary">
                点击下方「+ 导入项目」开始
              </div>
            ) : (
              projects.map((project) => {
                const isSelected = selectedProject?.id === project.id;
                return (
                  <button
                    key={project.id}
                    onClick={() => onSelectProject(project)}
                    className={`relative w-full text-left py-1.5 text-xs transition-colors ${
                      isSelected
                        ? "bg-bg-base text-text-primary font-medium before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[2px] before:bg-accent-warm before:rounded-r-full"
                        : "text-text-secondary hover:bg-bg-elevated/60"
                    }`}
                  >
                    <span className="truncate block px-5">{project.name}</span>
                  </button>
                );
              })
            )}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-border-subtle flex items-center justify-between shrink-0">
        <button
          onClick={() => setShowSettings(true)}
          className="text-xs text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          设置
        </button>
        {activeTab === "skills" ? (
          <button
            onClick={() => { setImportTab("local"); setShowImportDialog(true); setError(null); }}
            className="text-xs text-accent-warm hover:text-accent-warm/80 transition-colors"
          >
            + 导入 Skill
          </button>
        ) : (
          <button
            onClick={() => setShowCreateProject(true)}
            className="text-xs text-accent-warm hover:text-accent-warm/80 transition-colors"
          >
            + 导入项目
          </button>
        )}
      </div>
    </>
  );

  return (
    <>
      {isNarrow ? (
        <>
          {/* Collapsed 60px bar */}
          <aside className="w-[var(--sidebar-collapsed-width)] shrink-0 border-r border-border-subtle flex flex-col items-center py-3 gap-2 bg-bg-elevated h-full">
            <div className="w-8 h-1 rounded-full animate-[brand-breathe_6s_ease-in-out_infinite]" style={{ background: "var(--gradient-skyline)" }} />
            <button
              onClick={() => setOverlayOpen(true)}
              title="展开侧边栏"
              className="p-2 rounded-sm text-text-tertiary hover:bg-bg-deep hover:text-text-primary transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="mt-auto">
              <button
                onClick={() => setShowSettings(true)}
                title="设置"
                className="p-2 rounded-sm text-text-tertiary hover:bg-bg-deep hover:text-text-primary transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          </aside>
          {/* Backdrop */}
          <div
            className={`fixed inset-0 z-30 bg-black/30 transition-opacity ${overlayOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
            onClick={() => setOverlayOpen(false)}
          />
          {/* Overlay sidebar */}
          <aside className={`fixed inset-y-0 left-0 z-40 w-[var(--sidebar-width)] bg-bg-elevated border-r border-border-subtle flex flex-col overflow-hidden transition-transform duration-200 ${overlayOpen ? "translate-x-0" : "-translate-x-full"}`}>
            {sidebarInner}
          </aside>
        </>
      ) : (
        <aside
          style={{ width: bp === "wide" ? "var(--sidebar-width-wide)" : "var(--sidebar-width)" }}
          className="min-w-0 border-r border-border-subtle flex flex-col bg-bg-elevated h-full"
        >
          {sidebarInner}
        </aside>
      )}

      {/* Import Skill dialog */}
      <Dialog open={showImportDialog} onClose={closeImportDialog} width="w-[480px]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle shrink-0">
          <h3 className="text-sm font-semibold text-text-primary">导入 Skill</h3>
          <Button variant="icon" onClick={closeImportDialog}>×</Button>
        </div>

        {/* Tabs */}
        <div className="flex items-center px-5 gap-4 border-b border-border-subtle shrink-0">
          {(["local", "github"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => { setImportTab(tab); setError(null); }}
              className={`py-2 text-xs font-medium border-b-2 transition-colors ${
                importTab === tab
                  ? "border-accent-warm text-accent-warm"
                  : "border-transparent text-text-tertiary hover:text-text-secondary"
              }`}
            >
              {tab === "local" ? "本地文件夹" : "Github 仓库"}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-3">
          {importTab === "local" ? (
            <>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">文件夹路径</label>
                <div className="flex gap-2">
                  <Input
                    mono
                    value={importLocalPath}
                    readOnly
                    placeholder="选择文件夹..."
                    className="flex-1"
                  />
                  <Button variant="secondary" size="sm" onClick={handleSelectFolder}>
                    选择文件夹
                  </Button>
                </div>
                <p className="text-[10px] text-text-tertiary mt-1">Skill 文件夹需包含 SKILL.md 文件</p>
              </div>
              {error && (
                <div className="text-xs text-status-broken px-3 py-2 rounded-md" style={{ backgroundColor: "color-mix(in srgb, var(--status-broken) 8%, transparent)" }}>
                  {error}
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">仓库地址</label>
                <Input
                  type="text"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="https://github.com/..."
                  mono
                  onKeyDown={(e) => e.key === "Enter" && handleGithubImport()}
                  autoFocus
                />
              </div>
              {error && (
                <div className="text-xs text-status-broken px-3 py-2 rounded-md" style={{ backgroundColor: "color-mix(in srgb, var(--status-broken) 8%, transparent)" }}>
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border-subtle shrink-0">
          <Button variant="secondary" size="sm" onClick={closeImportDialog}>取消</Button>
          <Button
            variant="primary"
            size="sm"
            onClick={importTab === "local" ? handleLocalImportConfirm : handleGithubImport}
            disabled={loading || (importTab === "local" && !importLocalPath)}
          >
            {loading ? "导入中..." : "导入"}
          </Button>
        </div>
      </Dialog>

      {/* Create group dialog */}
      {(() => {
        const candidateSkills = skills.filter((s) => !s.group).sort((a, b) => a.name.localeCompare(b.name));
        const lowerSearch = newGroupSearch.trim().toLowerCase();
        let visibleSkills: typeof candidateSkills;
        if (lowerSearch) {
          visibleSkills = candidateSkills.filter((s) => s.name.toLowerCase().includes(lowerSearch));
        } else {
          const selected = candidateSkills.filter((s) => newGroupSelectedSkills.has(s.id));
          const unselected = candidateSkills.filter((s) => !newGroupSelectedSkills.has(s.id));
          visibleSkills = [...selected, ...unselected];
        }
        return (
          <Dialog
            open={showCreateGroupDialog}
            onClose={() => { setShowCreateGroupDialog(false); setNewGroupName(""); setNewGroupSelectedSkills(new Set()); setNewGroupSearch(""); }}
            width="w-80"
          >
            <div className="px-5 py-4 border-b border-border-subtle">
              <h3 className="text-sm font-semibold text-text-primary">创建分组</h3>
            </div>
            <div className="px-5 py-4 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">分组名称</label>
                <Input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="未命名"
                  autoFocus
                />
              </div>
              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <label className="text-xs font-medium text-text-secondary">
                    选择 Skills
                    <span className="ml-1 font-normal text-text-tertiary">（至少选一个）</span>
                  </label>
                  {newGroupSelectedSkills.size > 0 && (
                    <span className="text-[10px] text-accent-sky">{newGroupSelectedSkills.size} 已选</span>
                  )}
                </div>
                <div className="relative mb-1.5">
                  <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-tertiary pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
                  </svg>
                  <input
                    type="text"
                    value={newGroupSearch}
                    onChange={(e) => setNewGroupSearch(e.target.value)}
                    placeholder="搜索 Skills..."
                    className="w-full text-xs pl-6 pr-2 py-1.5 rounded-sm border border-border-subtle focus:outline-none focus:border-border-accent text-text-primary placeholder-text-tertiary bg-bg-elevated"
                  />
                  {newGroupSearch && (
                    <button
                      onClick={() => setNewGroupSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                <div className="rounded-md border border-border-subtle divide-y divide-border-subtle max-h-44 overflow-y-auto">
                  {visibleSkills.map((skill) => (
                    <label
                      key={skill.id}
                      className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-bg-elevated select-none"
                    >
                      <input
                        type="checkbox"
                        checked={newGroupSelectedSkills.has(skill.id)}
                        onChange={(e) => {
                          setNewGroupSelectedSkills((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(skill.id);
                            else next.delete(skill.id);
                            return next;
                          });
                        }}
                        className="w-3.5 h-3.5 rounded accent-accent-warm shrink-0"
                      />
                      <span className="text-xs text-text-primary truncate flex-1">{skill.name}</span>
                    </label>
                  ))}
                  {candidateSkills.length === 0 && (
                    <div className="px-3 py-3 text-xs text-text-tertiary">暂无未分组的 Skills</div>
                  )}
                  {candidateSkills.length > 0 && visibleSkills.length === 0 && lowerSearch && (
                    <div className="px-3 py-3 text-xs text-text-tertiary">没有匹配「{newGroupSearch}」的 Skill</div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-border-subtle">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setShowCreateGroupDialog(false); setNewGroupName(""); setNewGroupSelectedSkills(new Set()); setNewGroupSearch(""); }}
              >
                取消
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleCreateGroup}
                disabled={!newGroupName.trim() || newGroupSelectedSkills.size === 0}
              >
                创建
              </Button>
            </div>
          </Dialog>
        );
      })()}

      {/* Grouping dialog */}
      <Dialog open={showGroupDialog} onClose={() => setShowGroupDialog(false)} width="w-80">
        <div className="px-5 py-4 border-b border-border-subtle">
          <h3 className="text-sm font-semibold text-text-primary">将 Skills 分组</h3>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-text-secondary">
            检测到 <span className="font-medium">{pendingGroupSkills.length}</span> 个 Skills，是否将其归为一组？
          </p>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">组名</label>
            <Input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleConfirmGroup()}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border-subtle">
          <Button variant="secondary" size="sm" onClick={() => setShowGroupDialog(false)}>
            不分组
          </Button>
          <Button variant="primary" size="sm" onClick={handleConfirmGroup}>
            确认分组
          </Button>
        </div>
      </Dialog>

      {/* GitHub import conflict dialog */}
      <Dialog open={showConflictDialog && !!currentConflict} onClose={handleConflictSkip} width="w-96">
        {currentConflict && (
          <>
            <div className="px-5 py-4 border-b border-border-subtle">
              <h3 className="text-sm font-semibold text-text-primary">Skill 已存在</h3>
            </div>
            <div className="px-5 py-4 space-y-2">
              <p className="text-sm text-text-primary">
                <span className="font-medium">「{currentConflict.skill_name}」</span>
                {currentConflict.has_git
                  ? " 已存在，且包含 Git 仓库，要拉取最新版本吗？"
                  : " 已存在（无 Git 仓库），要创建为新 Skill 吗？"}
              </p>
              {pendingConflicts.length > 0 && (
                <p className="text-xs text-text-tertiary">还有 {pendingConflicts.length} 个冲突待处理</p>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-border-subtle">
              <Button variant="secondary" size="sm" onClick={handleConflictSkip}>跳过</Button>
              {currentConflict.has_git ? (
                <Button variant="primary" size="sm" onClick={handleConflictPull}>拉取更新</Button>
              ) : (
                <Button variant="primary" size="sm" onClick={handleConflictCreate}>创建新 Skill</Button>
              )}
            </div>
          </>
        )}
      </Dialog>

      <SettingsPanel
        open={showSettings}
        onClose={() => setShowSettings(false)}
        onSkillsCleared={() => {
          setShowSettings(false);
          loadData();
          onSkillsCleared?.();
        }}
        onSkillsImported={() => loadData()}
      />
      <CreateProjectDialog
        open={showCreateProject}
        onCreated={handleProjectCreated}
        onClose={() => setShowCreateProject(false)}
      />
    </>
  );
}

function SkillItem({
  skill,
  selected,
  onSelect,
  indent = false,
}: {
  skill: Skill;
  selected: boolean;
  onSelect: () => void;
  indent?: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);

  function getSourceLabel(): string {
    if (skill.source_type === "Github") return "Github";
    if (skill.has_git) return "本地 · Github";
    return "本地";
  }

  return (
    <button
      onClick={onSelect}
      draggable
      onDragStart={(e) => {
        setIsDragging(true);
        e.dataTransfer.setData("skill-id", skill.id);
        e.dataTransfer.effectAllowed = "copy";
        (window as unknown as Record<string, string>)["__draggedSkillId"] = skill.id;
      }}
      onDragEnd={() => setIsDragging(false)}
      className={`relative w-full text-left py-1.5 text-sm transition-colors flex flex-col ${
        indent ? "px-7" : "px-5"
      } ${
        selected
          ? "bg-bg-base text-text-primary font-medium before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[2px] before:bg-accent-warm before:rounded-r-full"
          : "text-text-secondary hover:bg-bg-elevated/60"
      } ${isDragging ? "animate-[drag-breathe_1.5s_ease-in-out_infinite]" : ""}`}
    >
      <span className="truncate text-xs">{skill.name}</span>
      <span className="text-[10px] text-text-tertiary leading-tight">{getSourceLabel()}</span>
    </button>
  );
}
