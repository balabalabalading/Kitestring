import { useState, useCallback } from "react";
import Sidebar from "./components/layout/Sidebar";
import DetailPanel from "./components/layout/DetailPanel";
import ProjectPanel from "./components/project/ProjectPanel";
import type { Skill, Project } from "./types";
import { useTheme } from "./hooks/useTheme";
import { ToastProvider } from "./components/ui/Toast";

function App() {
  useTheme();
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

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

  return (
    <ToastProvider>
      <Sidebar
        key={refreshKey}
        selectedSkill={selectedSkill}
        onSelectSkill={handleSelectSkill}
        onSkillsCleared={handleSkillsCleared}
        selectedProject={selectedProject}
        onSelectProject={handleSelectProject}
      />
      {selectedProject && !selectedSkill ? (
        <ProjectPanel project={selectedProject} onProjectDeleted={handleProjectDeleted} onSelectSkill={handleSelectSkill} onSkillsUpdated={handleSkillsUpdated} />
      ) : (
        <DetailPanel
          skill={selectedSkill}
          onSkillDeleted={handleSkillDeleted}
          onSkillPulled={handleSkillPulled}
        />
      )}
    </ToastProvider>
  );
}

export default App;
