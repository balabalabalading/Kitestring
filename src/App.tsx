import { useState, useCallback } from "react";
import Sidebar from "./components/layout/Sidebar";
import DetailPanel from "./components/layout/DetailPanel";
import type { Skill } from "./types";

function App() {
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);

  const handleSelectSkill = useCallback((skill: Skill) => {
    setSelectedSkill(skill);
  }, []);

  return (
    <>
      <Sidebar selectedSkill={selectedSkill} onSelectSkill={handleSelectSkill} />
      <DetailPanel skill={selectedSkill} />
    </>
  );
}

export default App;
