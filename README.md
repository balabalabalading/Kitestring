# AgentNexus

[English](#english) | 中文

AI 技能（Skill）管理与分发工具。从本地文件夹或 GitHub 仓库导入 Skill，通过符号链接一键分发到 Claude Code、Copilot CLI、Gemini CLI、Codex 等 AI 工具。

> ⚠️ **早期预览版**：项目正在积极开发中，API 和配置格式可能发生变化。

## 功能特性

- **导入 Skill**：支持本地文件夹导入，以及从 GitHub 仓库克隆导入
- **智能解析**：自动识别 `SKILL.md` 中的名称和描述，与文件夹名不一致时提示用户确认
- **一键分发**：通过符号链接将 Skill 分发到各 AI 工具的读取路径（全局或项目级别）
- **状态监控**：实时显示各工具的链接状态（已链接 / 断开 / 未分发）
- **Skill 管理**：浏览文件结构、查看文件内容、删除 Skill 及其所有分发记录
- **Git 集成**：自动检测 Git 版本信息

## 支持的工具

| 工具 | 全局路径 | 项目路径 |
|------|---------|---------|
| Claude Code | `~/.claude/skills/` | `.claude/skills/` |
| Copilot CLI | `~/.copilot/skills/` | `.copilot/skills/` |
| Gemini CLI | `~/.gemini/skills/` | `.gemini/skills/` |
| Codex | `~/.codex/skills/` | `.codex/skills/` |

## 安装

### 下载预构建版本

前往 [Releases](https://github.com/balabalabalading/AgentNexus/releases) 下载适合你平台的安装包。

### 从源码构建

**环境要求**：

- [Rust](https://rustup.rs/) stable
- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/)
- macOS 12+ 或 Windows 10+（需要 WebView2）

```bash
git clone https://github.com/balabalabalading/AgentNexus.git
cd AgentNexus
pnpm install
pnpm tauri build
```

## 快速开始

1. 启动 AgentNexus
2. 点击左下角 **「+ 导入 Skill」** 按钮
3. 选择「本地文件夹」或输入 GitHub 仓库地址
4. 在右侧详情面板，点击工具图标将 Skill 分发到对应工具

## 本地开发

```bash
pnpm install          # 安装前端依赖
pnpm tauri dev        # 启动开发模式（Vite 热重载 + Tauri 窗口）
cd src-tauri && cargo test --lib --quiet  # 运行 Rust 单元测试
```

## 贡献

欢迎提交 Issue 和 Pull Request！请先阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## License

[MIT](./LICENSE)

---

## English

A desktop app for managing and distributing AI agent skills. Import skills from local folders or GitHub repos, and distribute them via symlinks to Claude Code, Copilot CLI, Gemini CLI, Codex, and more.

> ⚠️ **Early Preview**: The project is under active development. APIs and config formats may change.

### Features

- **Import Skills**: from local folders or GitHub repositories
- **Smart parsing**: auto-detects `SKILL.md` metadata, prompts when folder name differs
- **One-click distribution**: symlink skills to AI tool paths (global or project scope)
- **Status monitoring**: shows link status per tool (Linked / Broken / Pending)
- **Skill management**: browse file tree, view content, delete skills and distributions
- **Git integration**: auto-detects version info from git repos

### Building from Source

```bash
git clone https://github.com/balabalabalading/AgentNexus.git
cd AgentNexus
pnpm install
pnpm tauri build
```

### License

[MIT](./LICENSE)
