import { invoke } from "@tauri-apps/api/core";
import type { Skill, Distribution, Project, GitInfo, AppConfig, Tool, DistStatus } from "../types";

export type { Tool, DistStatus };

export async function importLocalSkill(path: string): Promise<Skill[]> {
  return invoke("import_local_skill", { path });
}

export async function importGithubSkill(url: string): Promise<Skill[]> {
  return invoke("import_github_skill", { url });
}

export async function listSkills(projectId?: string): Promise<Skill[]> {
  return invoke("list_skills", { projectId: projectId ?? null });
}

export async function getSkillDetail(id: string): Promise<Skill> {
  return invoke("get_skill_detail", { id });
}

export async function pullGithubSkill(id: string): Promise<{ new_skills: string[]; removed_skills: string[] }> {
  return invoke("pull_github_skill", { id });
}

export async function distributeSkill(
  skillId: string,
  tool: string,
  scope: string,
  projectId?: string,
): Promise<Distribution> {
  return invoke("distribute_skill", { skillId, tool, scope, projectId: projectId ?? null });
}

export async function removeDistribution(id: string): Promise<void> {
  return invoke("remove_distribution", { id });
}

export async function checkDistributionStatus(): Promise<Distribution[]> {
  return invoke("check_distribution_status");
}

export async function createProject(name: string, path: string): Promise<Project> {
  return invoke("create_project", { name, path });
}

export async function listProjects(): Promise<Project[]> {
  return invoke("list_projects");
}

export async function addSkillToProject(projectId: string, skillId: string): Promise<void> {
  return invoke("add_skill_to_project", { projectId, skillId });
}

export async function getGitInfo(path: string): Promise<GitInfo> {
  return invoke("get_git_info", { path });
}

export async function getAppConfig(): Promise<AppConfig> {
  return invoke("get_app_config");
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

export async function readSkillFile(path: string): Promise<string> {
  return invoke("read_skill_file", { path });
}
