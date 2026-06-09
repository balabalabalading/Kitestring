import type { Locale } from "./types";

type ErrorRule = {
  match: string | RegExp;
  zh: string;
  en: string;
};

const ERROR_RULES: ErrorRule[] = [
  {
    match: "该路径已分发",
    zh: "该路径已分发",
    en: "This path has already been distributed.",
  },
  {
    match: /^目标路径已存在实体目录: (.+)$/,
    zh: "目标路径已存在实体目录: {path}",
    en: "The target path already contains a real folder: {path}",
  },
  {
    match: "No SKILL.md found in the specified directory",
    zh: "未在指定目录中找到 SKILL.md",
    en: "No SKILL.md was found in the selected directory.",
  },
  {
    match: "No SKILL.md found in the cloned repository",
    zh: "未在克隆的仓库中找到 SKILL.md",
    en: "No SKILL.md was found in the cloned repository.",
  },
  {
    match: /^Path does not exist or is not a directory: (.+)$/,
    zh: "路径不存在或不是文件夹: {path}",
    en: "The path does not exist or is not a directory: {path}",
  },
  {
    match: "Cannot determine home directory",
    zh: "无法获取用户主目录",
    en: "Unable to determine the home directory.",
  },
  {
    match: "Skill not found",
    zh: "未找到 Skill",
    en: "Skill not found.",
  },
  {
    match: "Project not found",
    zh: "未找到项目",
    en: "Project not found.",
  },
  {
    match: "Project scope requires a project_id",
    zh: "项目级分发需要项目 ID",
    en: "Project-scope distribution requires a project ID.",
  },
  {
    match: /worktree|untracked|dirty|commit or clean/i,
    zh: "Git 工作区存在未提交或未跟踪改动，请先提交或清理后再拉取。",
    en: "The Git working tree has uncommitted or untracked changes. Commit or clean them before pulling.",
  },
  {
    match: /^Failed to read config: (.+)$/,
    zh: "读取配置失败: {message}",
    en: "Failed to read config: {message}",
  },
  {
    match: /^Failed to parse config: (.+)$/,
    zh: "解析配置失败: {message}",
    en: "Failed to parse config: {message}",
  },
  {
    match: /^Failed to write config temp file: (.+)$/,
    zh: "写入配置临时文件失败: {message}",
    en: "Failed to write the config temp file: {message}",
  },
  {
    match: /^Failed to replace config: (.+)$/,
    zh: "替换配置文件失败: {message}",
    en: "Failed to replace the config file: {message}",
  },
  {
    match: /^Failed to create symlink: (.+)$/,
    zh: "创建 symlink 失败: {message}",
    en: "Failed to create symlink: {message}",
  },
  {
    match: /^Failed to create directory (.+): (.+)$/,
    zh: "创建目录失败: {path}: {message}",
    en: "Failed to create directory {path}: {message}",
  },
];

function fill(template: string, values: string[]) {
  const names = ["path", "message"];
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const index = names.indexOf(key);
    return index >= 0 && values[index] !== undefined ? values[index] : match;
  });
}

export function translateError(error: unknown, locale: Locale): string {
  const raw = String(error);
  for (const rule of ERROR_RULES) {
    if (typeof rule.match === "string") {
      if (raw.includes(rule.match)) return locale === "zh-CN" ? rule.zh : rule.en;
      continue;
    }
    const match = raw.match(rule.match);
    if (match) {
      const template = locale === "zh-CN" ? rule.zh : rule.en;
      return fill(template, match.slice(1));
    }
  }
  return raw;
}

