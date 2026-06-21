# Changelog

所有重要变更都会记录在此文件中。

## v0.1.1 - 2026-06-21

首个稳定性与诊断维护版本，继续定位为 Early Preview。

### 新增

- 在设置页「通用」中新增环境诊断，检查配置文件、工具路径、Skill 来源和分发状态。
- 在 Skill 侧边栏和详情页展示来源缺失、分发断开与目标缺失状态，并支持定位异常工具。
- 新增持久错误 Toast，对配置和工具路径的严重问题提供全局提示。
- 新增排障指南，并完善 Bug、功能建议与 Discussions 的 GitHub Issue 入口。

### 改进

- 补充导入、分发、配置和 Git 操作的中英文错误提示。
- 工具路径、Skill 和 Distribution 发生变化后自动刷新诊断结果。
- 配置可写诊断与实际的临时文件替换保存机制保持一致。

### 修复

- 修复项目级分发变化后侧边栏与诊断状态未及时刷新的问题。
- 修复 Git 工作区状态检查失败时被误报为存在未提交改动的问题。

## v0.1.0 - 2026-06-09

首次公开发布，定位为 Early Preview。

### 新增

- 支持从本地文件夹导入包含 `SKILL.md` 的 Skill。
- 支持从 GitHub 仓库克隆导入 Skill，并对 Git 仓库执行 fast-forward 拉取。
- 支持解析 `SKILL.md` front matter 中的 `name` 和 `description`。
- 支持将 Skill 通过 symlink 分发到 Claude Code、Copilot CLI、Gemini CLI、Codex 和自定义 Agent Folder 路径。
- 支持全局路径、项目路径和额外全局路径配置。
- 支持扫描项目内工具目录并生成分发记录。
- 支持分发状态检查、取消分发和删除 Skill 时清理 symlink。
- 支持 Skill 文件树浏览与文件内容预览。
- 支持 Skill 分组、搜索和项目管理。
- 支持中文和英文界面文本。
- 提供 macOS、Windows 和 Linux 预构建安装包。

### 已知限制

- Windows 安装包暂未代码签名，Windows 10+ 需要系统已安装 WebView2。
- 配置文件 `~/.kitestring/config.json` 在 Early Preview 阶段不承诺格式稳定。
- Git 拉取仅支持干净工作区下的 fast-forward 更新。
- `SKILL.md` front matter 使用轻量解析器，不是完整 YAML 解析器。
