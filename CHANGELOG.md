# Changelog

所有重要变更都会记录在此文件中。

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
