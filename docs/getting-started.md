# 安装与更新

## 前置条件

- 已安装并可运行 Claude Code CLI。
- 能访问 GitHub 仓库 `ZaunEkko/claude-plugins`。
- 目标插件的额外依赖已安装；例如 `commit-push-pr` 需要 GitHub CLI `gh`。

## 添加 marketplace

```bash
claude plugin marketplace add ZaunEkko/claude-plugins
```

可选地将 marketplace 声明在指定作用域：

```bash
claude plugin marketplace add ZaunEkko/claude-plugins --scope project
```

查看与刷新市场：

```bash
claude plugin marketplace list --json
claude plugin marketplace update zaunekko
```

`zaunekko` 来自 `.claude-plugin/marketplace.json` 的 `name` 字段，不是 GitHub 仓库名。

## 安装插件

```bash
claude plugin install commit-commands@zaunekko --scope user
```

作用域：

| Scope | 用途 | 设置文件 |
|---|---|---|
| `user` | 当前用户默认启用 | `~/.claude/settings.json` |
| `project` | 与仓库协作者共享 | `.claude/settings.json` |
| `local` | 当前仓库本机试用 | `.claude/settings.local.json` |

本地开发建议使用：

```bash
claude plugin marketplace add --scope local "D:/path/to/claude-plugins"
claude plugin install commit-commands@zaunekko --scope local
```

## 同名兼容分发

`commit-commands@zaunekko` 与 `commit-commands@claude-plugins-official` 使用相同命令命名空间。同一作用域只启用一个：

```bash
claude plugin disable commit-commands@claude-plugins-official --scope user
claude plugin enable commit-commands@zaunekko --scope user
```

如果你在 `local` 作用域测试，也应在 `local` 作用域禁用官方版本，不要改动用户级设置。

## 更新

刷新 marketplace 只会更新可用插件清单；已安装插件要显式更新：

```bash
claude plugin marketplace update zaunekko
claude plugin update commit-commands@zaunekko --scope user
```

查看当前状态：

```bash
claude plugin list --json
claude plugin details commit-commands@zaunekko
```

## 重新加载

在运行中的 Claude Code 会话内安装、启用、禁用或更新插件后执行：

```text
/reload-plugins
```

该命令会重新加载 skills、agents、hooks、插件 MCP 与 LSP 配置。若 MCP 工具变化会破坏 prompt cache，Claude Code 可能要求使用 `/reload-plugins --force`；仅在接受该代价时使用。

某些 monitor 类型变化仍可能需要开启新会话。

## 卸载

```bash
claude plugin uninstall commit-commands@zaunekko --scope user
```

移除 marketplace：

```bash
claude plugin marketplace remove zaunekko --scope user
```

从最后一个作用域移除 marketplace 时，Claude Code 还会卸载从该市场安装的插件。执行前先检查 `claude plugin marketplace list --json`。

## 下一步

- [`commit-commands` 使用指南](commit-commands/README.md)
- [故障排查](troubleshooting.md)
- [Trust & Safety](../README.md#️-trust--safety)
