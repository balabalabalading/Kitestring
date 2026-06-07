import { useState, useCallback } from "react";
import Sidebar from "./components/layout/Sidebar";
import DetailPanel from "./components/layout/DetailPanel";
import ProjectPanel from "./components/project/ProjectPanel";
import CreateProjectDialog from "./components/project/CreateProjectDialog";
import type { Skill, Project } from "./types";
import * as tauri from "./lib/tauri";
import { useTheme } from "./hooks/useTheme";
import { ToastProvider, useToast } from "./components/ui/Toast";

function AppInner() {
  useTheme();
  const { showToast } = useToast();
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [skillsCount, setSkillsCount] = useState(0);

  // Controlled import dialog — for empty state buttons
  const [controlledImportOpen, setControlledImportOpen] = useState(false);
  const [controlledImportTab, setControlledImportTab] = useState<"local" | "github">("local");

  // Create project dialog state
  const [showCreateProject, setShowCreateProject] = useState(false);

  const handleSkillsLoaded = useCallback((count: number) => {
    setSkillsCount(count);
  }, []);

  const handleSelectSkill = useCallback((skill: Skill | null) => {
    setSelectedSkill(skill);
    setSelectedProject(null);
  }, []);

  const handleSelectProject = useCallback((project: Project | null) => {
    setSelectedProject(project);
    setSelectedSkill(null);
  }, []);

  const handleSkillDeleted = useCallback((id: string) => {
    setSelectedSkill((prev) => (prev?.id === id ? null : prev));
    setRefreshKey((k) => k + 1);
  }, []);

  const handleSkillPulled = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const handleSkillsCleared = useCallback(() => {
    setSelectedSkill(null);
    setSelectedProject(null);
    setRefreshKey((k) => k + 1);
  }, []);

  const handleProjectDeleted = useCallback((id: string) => {
    setSelectedProject((prev) => (prev?.id === id ? null : prev));
    setRefreshKey((k) => k + 1);
  }, []);

  const handleSkillsUpdated = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const handleOpenImport = useCallback((tab: "local" | "github") => {
    setControlledImportTab(tab);
    setControlledImportOpen(true);
  }, []);

  const handleCloseImport = useCallback(() => {
    setControlledImportOpen(false);
  }, []);

  // Discover skills from tool paths
  const handleDiscover = useCallback(async () => {
    try {
      const skills = await tauri.discoverSkills();
      if (skills.length > 0) {
        showToast(`发现并导入了 ${skills.length} 个 Skill`);
        setRefreshKey((k) => k + 1);
      } else {
        showToast("未发现新 Skill（已全部导入或路径中没有 SKILL.md）");
      }
    } catch (e) {
      showToast(String(e), "error");
    }
  }, [showToast]);

  // Handle project created
  const handleProjectCreated = useCallback((project: Project) => {
    setShowCreateProject(false);
    setRefreshKey((k) => k + 1);
    setSelectedProject(project);
    setSelectedSkill(null);
    showToast(`项目「${project.name}」已创建`);
  }, [showToast]);

  return (
    <>
      <Sidebar
        key={refreshKey}
        selectedSkill={selectedSkill}
        onSelectSkill={handleSelectSkill}
        onSkillsCleared={handleSkillsCleared}
        onSkillsLoaded={handleSkillsLoaded}
        selectedProject={selectedProject}
        onSelectProject={handleSelectProject}
        controlledImportOpen={controlledImportOpen}
        controlledImportTab={controlledImportTab}
        onControlledImportClose={handleCloseImport}
      />
      {selectedProject && !selectedSkill ? (
        <ProjectPanel project={selectedProject} onProjectDeleted={handleProjectDeleted} onSelectSkill={handleSelectSkill} onSkillsUpdated={handleSkillsUpdated} />
      ) : (
        <DetailPanel
          skill={selectedSkill}
          totalSkillsCount={skillsCount}
          onSkillDeleted={handleSkillDeleted}
          onSkillPulled={handleSkillPulled}
          onImport={handleOpenImport}
          onDiscover={handleDiscover}
          onCreateProject={() => setShowCreateProject(true)}
        />
      )}
      <CreateProjectDialog
        open={showCreateProject}
        onCreated={handleProjectCreated}
        onClose={() => setShowCreateProject(false)}
      />
    </>
  );
}

function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}

export default App;
