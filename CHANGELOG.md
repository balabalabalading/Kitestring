# Changelog

所有重要变更均由 `release-notes.json` 生成。

## v0.1.2 - 2026-06-22

引入应用内更新基础设施，并将 GitHub Release、更新清单与客户端版本新内容统一到同一份双语数据源。

### 新增

- 设置页「关于」新增手动检查更新入口和更新状态。
- 启动后静默检查新版本，发现更新时提供非阻塞提示。
- 安装更新并重启后首次展示当前版本的新内容。

### 改进

- GitHub Release 正文、CHANGELOG 和 updater notes 改为由结构化双语发布日志统一生成。
- 后续 Early Preview 版本使用普通 Release 通道，保证 latest.json 地址稳定可用。

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

Kitestring 首次公开发布，定位为 Early Preview。

### 新增

- 支持从本地文件夹或 GitHub 仓库导入包含 SKILL.md 的 Skill。
- 支持解析 SKILL.md 元数据并通过 symlink 分发到五类 AI 工具。
- 支持项目扫描、分发状态、文件预览、分组和中英文界面。

### 已知限制

- Windows 安装包暂未代码签名，Windows 10+ 需要 WebView2。
- Git 拉取仅支持干净工作区下的 fast-forward 更新。
- SKILL.md front matter 使用轻量解析器，不是完整 YAML 解析器。
