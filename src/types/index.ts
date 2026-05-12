export interface Skill {
  id: string;
  name: string;
  description: string;
  source_type: "Local" | "Github";
  source_path: string;
  github_url: string | null;
  has_git: boolean;
  created_at: string;
  updated_at: string;
  project_id: string | null;
  group: string | null;
}

export type Tool = "ClaudeCode" | "CopilotCLI" | "GeminiCLI" | "Codex";
export type Scope = "Global" | "Project";
export type DistStatus = "Linked" | "Broken" | "Pending";
export type EntryType = "Folder" | "Symlink";

export interface Distribution {
  id: string;
  skill_id: string;
  tool: Tool;
  scope: Scope;
  target_path: string;
  status: DistStatus;
  entry_type: EntryType;
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
  remote_url: string | null;
}

export interface ToolPaths {
  global: string;
  project: string;
  extra_globals: string[];
}

export interface AppConfig {
  version: string;
  skills: Skill[];
  distributions: Distribution[];
  projects: Project[];
  tool_paths: Record<string, ToolPaths>;
  ignored_paths: string[];
}

export const TOOL_DISPLAY_NAMES: Record<Tool, string> = {
  ClaudeCode: "Claude Code",
  CopilotCLI: "Copilot CLI",
  GeminiCLI: "Gemini CLI",
  Codex: "Codex",
};
