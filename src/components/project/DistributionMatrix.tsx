import { useState } from "react";
import type { Skill, Distribution } from "../../types";
import { TOOL_DISPLAY_NAMES } from "../../types";
import { Tag } from "../ui/Tag";

type Tool = "ClaudeCode" | "CopilotCLI" | "GeminiCLI" | "Codex" | "AgentFolder";
type CellType = "linked" | "broken" | "pending" | "folder" | "none" | "disabled";

const TOOL_SHORT_NAMES: Record<Tool, string> = {
  ClaudeCode: "Claude Code",
  CopilotCLI: "Copilot",
  GeminiCLI: "Gemini CLI",
  Codex: "Codex CLI",
  AgentFolder: "Agent Folder",
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
  onSelectSkill?: (skill: Skill) => void;
}

function ThreeDots() {
  return (
    <div className="flex flex-col items-center justify-center gap-[3px] w-[14px] h-[14px]">
      <span className="w-[3px] h-[3px] rounded-full bg-text-tertiary" />
      <span className="w-[3px] h-[3px] rounded-full bg-text-tertiary" />
      <span className="w-[3px] h-[3px] rounded-full bg-text-tertiary" />
    </div>
  );
}

export default function DistributionMatrix({
  skills, tools, allDists, getToolProjectPath, onDistribute, onRemoveDist, onSelectSkill,
}: Props) {
  const [openPopover, setOpenPopover] = useState<Tool | null>(null);

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

  function getSkillTag(skill: Skill): "symlink" | "folder" | null {
    const d = allDists.find((d) => d.skill_id === skill.id);
    if (!d) return null;
    return d.entry_type === "Symlink" ? "symlink" : "folder";
  }

  function handleDistributeAll(tool: Tool) {
    skills.forEach((skill) => {
      const { type } = getCell(skill, tool);
      if (type === "none") onDistribute(skill.id, tool);
    });
  }

  function handleRemoveAll(tool: Tool) {
    skills.forEach((skill) => {
      const { type, dist } = getCell(skill, tool);
      if ((type === "linked" || type === "broken") && dist?.id) onRemoveDist(dist.id);
    });
  }

  if (skills.length === 0) {
    return <div className="text-sm text-text-tertiary py-4">暂无 Skill</div>;
  }

  return (
    <>
      {/* Transparent backdrop to close popover */}
      {openPopover && (
        <div className="fixed inset-0 z-40" onClick={() => setOpenPopover(null)} />
      )}

      <div>
        {/* Header row */}
        <div className="flex h-[32px] bg-bg-elevated rounded-t-[6px]">
          <div className="w-[276px] shrink-0 flex items-center px-2">
            <span className="text-[10px] font-semibold text-text-tertiary">技能名称</span>
          </div>
          {tools.map((tool) => (
            <div key={tool} className="w-[140px] shrink-0 relative flex items-center px-2">
              {/* Centered tool name */}
              <span className="flex-1 text-center text-[10px] font-semibold text-text-tertiary">
                {TOOL_SHORT_NAMES[tool]}
              </span>
              {/* Three-dot menu button */}
              <button
                className="shrink-0 flex items-center justify-center w-[18px] h-[18px] rounded hover:bg-bg-surface transition-colors"
                onClick={(e) => { e.stopPropagation(); setOpenPopover(openPopover === tool ? null : tool); }}
              >
                <ThreeDots />
              </button>
              {/* Popover */}
              {openPopover === tool && (
                <div className="absolute top-full right-0 z-50 bg-bg-elevated border border-border-default rounded-[8px] shadow-md py-1 min-w-[108px]">
                  <button
                    className="w-full text-left px-3 py-1.5 text-[12px] text-text-secondary hover:bg-bg-surface hover:text-text-primary transition-colors"
                    onClick={(e) => { e.stopPropagation(); handleDistributeAll(tool); setOpenPopover(null); }}
                  >
                    全部分发
                  </button>
                  <button
                    className="w-full text-left px-3 py-1.5 text-[12px] text-text-secondary hover:bg-bg-surface hover:text-text-primary transition-colors"
                    onClick={(e) => { e.stopPropagation(); handleRemoveAll(tool); setOpenPopover(null); }}
                  >
                    全部取消
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Skill rows */}
        {skills.map((skill) => {
          const tag = getSkillTag(skill);
          return (
            <div key={skill.id} className="flex h-[40px]">
              {/* Skill name cell — full hot area */}
              <button
                className="w-[276px] shrink-0 h-full flex items-center justify-between px-2 text-left hover:bg-bg-surface transition-colors cursor-pointer"
                onClick={() => onSelectSkill?.(skill)}
              >
                <span className="text-[12px] text-text-primary truncate flex-1 min-w-0 mr-2">{skill.name}</span>
                {tag === "symlink" && <Tag variant="sky" size="sm" dot>symlink</Tag>}
                {tag === "folder" && <Tag variant="default" size="sm" dot>folder</Tag>}
              </button>

              {/* Tool cells */}
              {tools.map((tool) => {
                const { type, dist } = getCell(skill, tool);
                const canRemove = (type === "linked" || type === "broken") && dist?.id;
                const canAdd = type === "none";

                return (
                  <div key={tool} className="w-[140px] shrink-0 flex items-center justify-center">
                    {type === "disabled" ? (
                      <span className="w-2.5 h-2.5 rounded-full bg-bg-elevated" />
                    ) : canAdd ? (
                      <button
                        onClick={() => onDistribute(skill.id, tool)}
                        className="w-10 h-10 rounded-[6px] flex items-center justify-center hover:bg-bg-surface transition-colors"
                        title={`分发到 ${TOOL_DISPLAY_NAMES[tool]}`}
                      >
                        <span className="text-[16px] text-text-tertiary leading-none select-none">+</span>
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
          );
        })}
      </div>
    </>
  );
}
