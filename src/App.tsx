import { useState, useCallback } from "react";
import Sidebar from "./components/layout/Sidebar";
import DetailPanel from "./components/layout/DetailPanel";
import ProjectPanel from "./components/project/ProjectPanel";
import CreateProjectDialog from "./components/project/CreateProjectDialog";
import type { Skill, Project } from "./types";
import * as tauri from "./lib/tauri";
import { useTheme } from "./hooks/useTheme";
import { ToastProvider, useToast } from "./components/ui/Toast";
import { I18nProvider, useI18n } from "./i18n/I18nProvider";
import { translateError } from "./i18n/errors";

function AppInner() {
  useTheme();
  const { showToast } = useToast();
  const { locale, t } = useI18n();
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
        showToast(t("toast.discovered", { count: skills.length }));
        setRefreshKey((k) => k + 1);
      } else {
        showToast(t("toast.noNewSkills"));
      }
    } catch (e) {
      showToast(translateError(e, locale), "error");
    }
  }, [locale, showToast, t]);

  // Handle project created
  const handleProjectCreated = useCallback((project: Project) => {
    setShowCreateProject(false);
    setRefreshKey((k) => k + 1);
    setSelectedProject(project);
    setSelectedSkill(null);
    showToast(t("toast.projectCreated", { name: project.name }));
  }, [showToast, t]);

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
    <I18nProvider>
      <ToastProvider>
        <AppInner />
      </ToastProvider>
    </I18nProvider>
  );
}

export default App;
