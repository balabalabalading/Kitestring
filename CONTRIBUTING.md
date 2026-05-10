# 贡献指南 / Contributing Guide

[English](#english) | 中文

## 开始贡献

感谢你的贡献！以下是参与项目的基本流程。

### 环境准备

```bash
# 克隆仓库
git clone https://github.com/balabalabalading/AgentNexus.git
cd AgentNexus

# 安装前端依赖
pnpm install

# 启动开发模式
pnpm tauri dev
```

### 开发流程

1. Fork 本仓库并创建你的功能分支
2. 实现功能或修复 bug
3. 如涉及 Rust 后端改动，运行单元测试确保通过：
   ```bash
   cd src-tauri && cargo test --lib --quiet
   ```
4. 提交 Pull Request，描述你的改动

### 提交规范

- 所有提交信息、PR 标题、Issue 和代码注释使用**中文**
- 提交格式：`类型: 简短描述`（例：`修复: 修复符号链接路径错误`）
- 类型：`功能`、`修复`、`重构`、`测试`、`文档`、`构建`、`杂项`

### 代码规范

- Rust：遵循 `cargo fmt` 格式
- TypeScript：开启严格模式（`noUnusedLocals`、`noUnusedParameters`）
- 新增 Rust 后端功能时，同步编写单元测试

### 报告问题

使用 [Issue 模板](./.github/ISSUE_TEMPLATE/) 提交 Bug 报告或功能请求。

---

## English

### Getting Started

```bash
git clone https://github.com/balabalabalading/AgentNexus.git
cd AgentNexus
pnpm install
pnpm tauri dev
```

### Development Workflow

1. Fork the repo and create a feature branch
2. Implement your change
3. For Rust backend changes, run unit tests:
   ```bash
   cd src-tauri && cargo test --lib --quiet
   ```
4. Submit a Pull Request describing your changes

### Commit Convention

- All commits, PR titles, Issues, and code comments should be in **Chinese**
- Format: `类型: 简短描述` (e.g., `修复: fix symlink path error`)

### Reporting Issues

Use the [Issue templates](./.github/ISSUE_TEMPLATE/) to report bugs or request features.
