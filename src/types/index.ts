export interface Skill {
  id: string;
  name: string;
  description: string;
  source_type: "Local" | "Github";
  source_path: string;
  github_url: string | null;
  created_at: string;
  updated_at: string;
  project_id: string | null;
}

export type Tool = "ClaudeCode" | "CopilotCLI" | "GeminiCLI" | "Codex";
export type Scope = "Global" | "Project";
export type DistStatus = "Linked" | "Broken" | "Pending";

export interface Distribution {
  id: string;
  skill_id: string;
  tool: Tool;
  scope: Scope;
  target_path: string;
  status: DistStatus;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  skill_ids: string[];
  created_at: string;
}

export interface GitInfo {
  branch: string | null;
  commit_count: number;
  last_commit_time: string | null;
  is_git_repo: boolean;
}

export interface ToolPaths {
  global: string;
  project: string;
}

export interface AppConfig {
  version: string;
  skills: Skill[];
  distributions: Distribution[];
  projects: Project[];
  tool_paths: Record<string, ToolPaths>;
}

export const TOOL_DISPLAY_NAMES: Record<Tool, string> = {
  ClaudeCode: "Claude Code",
  CopilotCLI: "Copilot CLI",
  GeminiCLI: "Gemini CLI",
  Codex: "Codex",
};
