# Kitestring 排障指南

本文档适用于 Kitestring v0.1.x。

## 运行诊断

打开 **设置 → 通用 → 诊断**，点击 **运行诊断**。

诊断会检查：

- `~/.kitestring/config.json` 是否可读写；
- 各工具的全局路径是否存在、是否可写；
- 已导入 Skill 的源目录是否仍然存在；
- Distribution 记录是否处于 Linked、Pending 或 Broken 状态。

## 配置文件

Kitestring 使用单一 JSON 文件保存本地状态：

```text
~/.kitestring/config.json
```

手动编辑该文件前，建议先退出 Kitestring 并复制一份备份。

## 分发状态含义

| 状态 | 含义 | 处理方式 |
|------|------|----------|
| Linked | 真实目录或 symlink 有效 | 无需处理 |
| Pending | 目标路径不存在 | 创建目标目录，或重新分发 |
| Broken | symlink 存在，但没有指向预期 Skill 来源 | 删除该分发记录后重新分发 |

## 工具路径不存在

如果某个工具路径不存在，可以：

- 手动创建该目录；
- 打开 **设置 → 工具**，将路径改为已存在的目录。

## 工具路径不可写

请确认当前用户对工具目录有写入权限。

Windows 上创建 symlink 可能需要开启 Developer Mode，或使用管理员权限运行。

## GitHub 拉取失败

Kitestring 只执行安全的 fast-forward 更新。

以下情况会拒绝拉取：

- 仓库存在未提交改动；
- 仓库存在未跟踪文件；
- 本地分支和远端分支已经分叉；
- 无法连接远端仓库。

请先提交或清理本地改动，再重新拉取。

## 未找到 `SKILL.md`

Kitestring 只导入包含 `SKILL.md` 的目录。若导入失败：

- 确认选择的文件夹或 GitHub 仓库中存在 `SKILL.md`；
- 如果 Skill 位于子目录，确认子目录层级未超过扫描深度；
- 确认文件名严格为 `SKILL.md`。
