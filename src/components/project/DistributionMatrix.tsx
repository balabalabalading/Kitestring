import type { Skill, Distribution } from "../../types";
import { TOOL_DISPLAY_NAMES } from "../../types";

type Tool = "ClaudeCode" | "CopilotCLI" | "GeminiCLI" | "Codex" | "AgentFolder";
type CellType = "linked" | "broken" | "pending" | "folder" | "none" | "disabled";

const TOOL_SHORT_NAMES: Record<Tool, string> = {
  ClaudeCode: "Claude",
  CopilotCLI: "Copilot",
  GeminiCLI: "Gemini",
  Codex: "Codex",
  AgentFolder: "Agent",
};

interface CellInfo {
  type: CellType;
  dist: Distribution | null;
}

interface Props {
  skills: Skill[];
  tools: Tool[];
  allDists: Distribution[];
  getToolProjectPath: (tool: Tool) => string;
  onDistribute: (skillId: string, tool: Tool) => void;
  onRemoveDist: (distId: string) => void;
}

export default function DistributionMatrix({
  skills, tools, allDists, getToolProjectPath, onDistribute, onRemoveDist,
}: Props) {
  function getCell(skill: Skill, tool: Tool): CellInfo {
    const toolPath = getToolProjectPath(tool);
    if (!toolPath) return { type: "disabled", dist: null };

    const dist = allDists.find(
      (d) => d.skill_id === skill.id && d.tool === tool && d.target_path.startsWith(toolPath + "/")
    );
    if (dist) {
      const type = dist.status === "Linked" ? "linked" : dist.status === "Broken" ? "broken" : "pending";
      return { type, dist };
    }

    if (skill.source_path.startsWith(toolPath + "/")) {
      return { type: "folder", dist: null };
    }

    return { type: "none", dist: null };
  }

  function dotStyle(type: CellType): Record<string, string> {
    if (type === "linked" || type === "folder") return { backgroundColor: "var(--status-linked)" };
    if (type === "broken") return { backgroundColor: "var(--status-broken)" };
    if (type === "pending") return { backgroundColor: "var(--status-pending)" };
    return {};
  }

  if (skills.length === 0) {
    return <div className="text-sm text-text-tertiary py-4">暂无 Skill</div>;
  }

  return (
    <div className="overflow-x-auto">
      {/* Header row */}
      <div className="flex items-center gap-1 pb-2 border-b border-border-subtle mb-1">
        <div className="flex-1 min-w-0 text-[10px] font-medium text-text-tertiary uppercase tracking-wide pl-0.5">技能</div>
        {tools.map((tool) => (
          <div key={tool} className="w-[52px] text-center text-[10px] text-text-tertiary font-medium shrink-0 leading-tight">
            {TOOL_SHORT_NAMES[tool]}
          </div>
        ))}
      </div>

      {/* Skill rows */}
      {skills.map((skill) => (
        <div
          key={skill.id}
          className="flex items-center gap-1 py-1.5 border-b border-dashed border-border-subtle last:border-b-0 group"
        >
          <div className="flex-1 min-w-0 text-xs text-text-primary truncate pl-0.5">{skill.name}</div>
          {tools.map((tool) => {
            const { type, dist } = getCell(skill, tool);
            const canRemove = (type === "linked" || type === "broken") && dist?.id;
            const canAdd = type === "none";

            return (
              <div key={tool} className="w-[52px] flex items-center justify-center shrink-0">
                {type === "disabled" ? (
                  <span className="w-2 h-2 rounded-full bg-bg-elevated" />
                ) : canAdd ? (
                  <button
                    onClick={() => onDistribute(skill.id, tool)}
                    className="w-5 h-5 rounded-full border border-dashed border-border-subtle flex items-center justify-center opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:border-accent-sky transition-opacity"
                    title={`分发到 ${TOOL_DISPLAY_NAMES[tool]}`}
                  >
                    <span className="text-[10px] text-text-tertiary leading-none select-none">+</span>
                  </button>
                ) : (
                  <button
                    onClick={() => canRemove && dist?.id && onRemoveDist(dist.id)}
                    disabled={type === "folder" || type === "pending"}
                    className={`w-2.5 h-2.5 rounded-full transition-all disabled:cursor-default ${
                      canRemove ? "hover:opacity-60 hover:scale-125 cursor-pointer" : ""
                    }`}
                    style={dotStyle(type)}
                    title={
                      type === "folder" ? `文件夹来源（${TOOL_DISPLAY_NAMES[tool]}）`
                        : type === "linked" ? "已链接 · 点击取消"
                        : type === "broken" ? "链接断开 · 点击取消"
                        : "待处理"
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
