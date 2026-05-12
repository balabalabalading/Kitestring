import { invoke } from "@tauri-apps/api/core";
import type { Skill, Distribution, Project, GitInfo, AppConfig, Tool, DistStatus, ToolPaths } from "../types";

export type { Tool, DistStatus };

export interface GithubConflict {
  skill_name: string;
  existing_skill_id: string;
  /** true = same GitHub repo → offer pull; false = different repo → offer create new */
  has_git: boolean;
  source_path: string;
  github_url: string;
}

export interface ImportGithubResult {
  imported: Skill[];
  conflicts: GithubConflict[];
}

export async function importLocalSkill(path: string): Promise<Skill[]> {
  return invoke("import_local_skill", { path });
}

export async function importGithubSkill(url: string): Promise<ImportGithubResult> {
  return invoke("import_github_skill", { url });
}

export async function forceImportSkill(sourcePath: string, githubUrl: string): Promise<Skill> {
  return invoke("force_import_skill", { sourcePath, githubUrl });
}

export async function listSkills(projectId?: string): Promise<Skill[]> {
  return invoke("list_skills", { projectId: projectId ?? null });
}

export async function getSkillDetail(id: string): Promise<Skill> {
  return invoke("get_skill_detail", { id });
}

export async function pullGithubSkill(id: string): Promise<{ new_skills: string[]; removed_skills: string[]; updated: boolean }> {
  return invoke("pull_github_skill", { id });
}

export async function deleteSkill(id: string, keepSymlinks = false): Promise<void> {
  return invoke("delete_skill", { id, keepSymlinks });
}

export async function deleteAllSkills(keepSymlinks = false): Promise<void> {
  return invoke("delete_all_skills", { keepSymlinks });
}

export async function setSkillGroup(id: string, group: string | null): Promise<void> {
  return invoke("set_skill_group", { id, group });
}

export async function listGroups(): Promise<string[]> {
  return invoke("list_groups");
}

export async function createGroup(name: string): Promise<void> {
  return invoke("create_group", { name });
}

export async function deleteGroup(name: string): Promise<void> {
  return invoke("delete_group", { name });
}

export async function discoverSkills(): Promise<Skill[]> {
  return invoke("discover_skills");
}

export async function refreshSkill(id: string): Promise<Skill> {
  return invoke("refresh_skill", { id });
}

export async function distributeSkill(
  skillId: string,
  tool: string,
  scope: string,
  projectId?: string,
): Promise<Distribution> {
  return invoke("distribute_skill", { skillId, tool, scope, projectId: projectId ?? null });
}

export async function distributeToDir(skillId: string, tool: string, targetDir: string): Promise<Distribution> {
  return invoke("distribute_to_dir", { skillId, tool, targetDir });
}

export async function removeDistribution(id: string): Promise<void> {
  return invoke("remove_distribution", { id });
}

export async function checkDistributionStatus(): Promise<Distribution[]> {
  return invoke("check_distribution_status");
}

export async function createProject(name: string, path?: string): Promise<Project> {
  return invoke("create_project", { name, path: path ?? null });
}

export async function listProjects(): Promise<Project[]> {
  return invoke("list_projects");
}

export async function addSkillToProject(projectId: string, skillId: string): Promise<void> {
  return invoke("add_skill_to_project", { projectId, skillId });
}

export async function removeSkillFromProject(projectId: string, skillId: string): Promise<void> {
  return invoke("remove_skill_from_project", { projectId, skillId });
}

export async function deleteProject(id: string): Promise<void> {
  return invoke("delete_project", { id });
}

export async function rescanProject(projectId: string): Promise<Skill[]> {
  return invoke("rescan_project", { projectId });
}

export async function getGitInfo(path: string): Promise<GitInfo> {
  return invoke("get_git_info", { path });
}

export async function getAppConfig(): Promise<AppConfig> {
  return invoke("get_app_config");
}

export async function getHomeDir(): Promise<string> {
  return invoke("get_home_dir");
}

export async function updateToolPaths(toolPaths: Record<string, ToolPaths>): Promise<void> {
  return invoke("update_tool_paths", { toolPaths });
}

export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileNode[];
}

export async function listSkillFiles(skillId: string): Promise<FileNode[]> {
  return invoke("list_skill_files", { skillId });
}

export async function updateIgnoredPaths(ignoredPaths: string[]): Promise<void> {
  return invoke("update_ignored_paths", { ignoredPaths });
}

export async function readSkillFile(path: string): Promise<string> {
  return invoke("read_skill_file", { path });
}
