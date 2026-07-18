<div align="center">

# 🧩 Claude Code Plugins

### 个性化 Claude Code 插件市场

*把顺手的 skills、agents、hooks、MCP 配置与兼容命令，打包成可安装、可验证、可协作维护的 Claude Code 能力*

[简体中文](README.md) · [English](i18n/en/README.md) · [繁體中文](i18n/zh-TW/README.md) · [日本語](i18n/ja/README.md) · [한국어](i18n/ko/README.md)

[![Claude Code](https://img.shields.io/badge/Claude_Code-plugin_marketplace-D97757?style=flat-square&logo=anthropic&logoColor=white)](https://code.claude.com/docs/en/plugins)
[![Marketplace](https://img.shields.io/badge/marketplace-zaunekko-6f42c1?style=flat-square)](.claude-plugin/marketplace.json)
[![License](https://img.shields.io/badge/license-MIT%20%2B%20Apache--2.0-blue?style=flat-square)](#-许可证)
[![Status](https://img.shields.io/badge/status-public--release--ready-brightgreen?style=flat-square)](#-这个仓库是什么)

</div>

## ✨ 这个仓库是什么

这是 ZaunEkko 的 Claude Code 插件市场容器。仓库负责维护市场目录、可安装插件、使用文档、验证流程与社区协作文件；Claude Code 通过根目录的 [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json) 读取市场内容。

仓库按公开分发标准维护：变更先在 feature/develop 分支完成实现、安全审查、跨平台测试与文档同步，再集成到稳定的 `main`。

市场名称为 `zaunekko`，预期 GitHub 源为 `ZaunEkko/claude-plugins`。

## 🧰 收录范围

仓库可以收录以下 Claude Code 插件组件：

- `skills/<skill-name>/SKILL.md`：面向用户或模型按需加载的能力；新功能优先使用 skills。
- `agents/*.md`：可复用的专用子代理。
- `hooks/hooks.json`：Claude Code 生命周期与工具事件 hooks。
- `.mcp.json`：插件级 MCP server 配置。
- `scripts/`：由 skills、hooks 或兼容命令调用的脚本。
- `commands/*.md`：仅用于上游接口兼容；Claude Code 已将自定义 commands 统一到 skills 语义。

原创可安装插件通常采用 `ekko-<specific-purpose>` 命名。只有为了保留上游安装名和运行时命名空间的已授权兼容分发，才允许使用同名例外。

## 📦 当前内容

| 插件 | 状态 | 说明 | 文档 |
|---|---|---|---|
| `commit-commands` | 可用 · 兼容分发 | 基于 Anthropic 官方同名插件，保留三个命令，提供当前会话模型 attribution、Bash 与已知 Playwright unsafe 提交防绕过保护、显式 detached session 绑定，以及确认式安全分支/worktree 清理。 | [使用指南](docs/commit-commands/README.md) · [实现与上游说明](plugins/commit-commands/README.md) |
| `ekko-image-gen` | 本地可用 · 原创 | 使用一个命令调用本地图片服务，支持文生图、粘贴图片后的图生图、项目上下文感知落盘、受控并发叶子 worker、主代理视觉验收和可点击本地输出。 | [使用指南](docs/ekko-image-gen/README.md) · [实现说明](plugins/ekko-image-gen/README.md) |

`commit-commands` 与官方分发暴露相同命名空间。请在同一作用域内只启用一个版本。

## 🚀 快速开始

### 已经打开 Claude Code

在当前会话中直接运行：

```text
/plugin marketplace add ZaunEkko/claude-plugins
/plugin install commit-commands@zaunekko
/reload-plugins
```

`/plugin` 会使用 Claude Code 内置的插件管理界面；需要精确控制 scope、自动化或排查时，再使用下面的 CLI 命令。

### 让 Agent 帮你安装

把仓库链接和下面这段指令交给你的 Claude Code Agent：

```text
请帮我安装这个 Claude Code 插件市场：
https://github.com/ZaunEkko/claude-plugins

目标插件：commit-commands@zaunekko

要求：
1. 先确认我要使用 user、project 还是 local scope；如果我已经明确说明，就不要重复询问。
2. 只修改我选择的 scope，不要改动其他 scope 的插件设置。
3. 添加并更新 zaunekko marketplace，然后安装并启用目标插件。
4. 如果同一 scope 已启用 commit-commands@claude-plugins-official，先说明命名空间冲突，再禁用官方版本；不要卸载或删除它。
5. 完成后在当前会话运行 /reload-plugins，并汇报实际执行的命令与结果。
6. 遇到权限、认证或安全确认时停下来让我决定，不要绕过确认。
```

### 使用 CLI

#### 1. 添加市场

```bash
claude plugin marketplace add ZaunEkko/claude-plugins
claude plugin marketplace update zaunekko
```

#### 2. 安装插件

```bash
claude plugin install commit-commands@zaunekko --scope user
```

如果同一作用域已经启用官方版本，请先禁用官方分发，再启用本版本：

```bash
claude plugin disable commit-commands@claude-plugins-official --scope user
claude plugin enable commit-commands@zaunekko --scope user
```

在正在运行的 Claude Code 会话中安装、启用、禁用或更新插件后，执行：

```text
/reload-plugins
```

已安装插件要获取新版本时，市场更新与插件更新是两件事：

```bash
claude plugin marketplace update zaunekko
claude plugin update commit-commands@zaunekko --scope user
```

#### 3. 选择作用域

| 作用域 | 适合场景 | 设置位置 |
|---|---|---|
| `user` | 当前用户的默认安装 | `~/.claude/settings.json` |
| `project` | 与仓库协作者共享 | `.claude/settings.json` |
| `local` | 只在当前仓库本机试用 | `.claude/settings.local.json` |

本地开发和兼容分发测试优先使用 `--scope local`，避免改动用户级插件设置。

## 🎯 使用方式

安装 `commit-commands@zaunekko` 后，可使用：

| 命令 | 作用 |
|---|---|
| `/commit-commands:commit` | 检查改动、暂存相关文件并创建一个 commit。 |
| `/commit-commands:commit-push-pr` | 按顺序 commit、push 并创建 Pull Request。 |
| `/commit-commands:clean_gone` | 先显示确定性计划并请求确认，再安全清理上游已消失、提交仍被保留的分支及干净 worktree。 |
| `/ekko-image-gen:generate` | 调用本地图片服务完成文生图或图生图，并按当前项目上下文保存、展示和验收图片。 |

生成的 attribution 形如：

```text
Generated with [Claude Code](https://claude.ai/code)

Model: gpt-5.6-sol xhigh

Co-Authored-By: Claude <noreply@anthropic.com>
```

模型无法可靠解析时会移除 `Model:` 行，而不是保留过期值或写入 `unknown`。

## 📚 插件文档

- [文档中心](docs/README.md)
- [安装与更新](docs/getting-started.md)
- [插件开发指南](docs/plugin-authoring.md)
- [插件目录结构](docs/plugin-layout.md)
- [故障排查](docs/troubleshooting.md)
- [`commit-commands` 使用指南](docs/commit-commands/README.md)
- [`commit-commands` 实现、测试与上游同步](plugins/commit-commands/README.md)
- [`ekko-image-gen` 使用指南](docs/ekko-image-gen/README.md)
- [`ekko-image-gen` 实现、配置与测试](plugins/ekko-image-gen/README.md)
- [贡献指南](CONTRIBUTING.md)
- [支持渠道](SUPPORT.md)

## 🏗️ 仓库结构

```text
.
├── .claude-plugin/
│   └── marketplace.json
├── .github/
│   ├── ISSUE_TEMPLATE/
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── workflows/
├── docs/
├── i18n/
├── plugins/
│   ├── commit-commands/
│   └── ekko-image-gen/
├── CHANGELOG.md
├── CONTRIBUTING.md
└── README.md
```

每个可安装插件都必须在自己的目录中包含 `.claude-plugin/plugin.json`。插件的 skills、agents、hooks、MCP 配置与脚本不得放到市场根目录冒充插件组件。

## 🧭 Roadmap

- 持续验证并完善 `commit-commands` 的跨平台与会话解析行为。
- 增加经过安全审查、用途聚焦的 `ekko-<specific-purpose>` 原创插件。
- 为新增插件补齐多语言入口、使用指南、权限说明与行为测试。
- 在公开发布前完成版本、安装、升级、回滚和安全审查流程。

路线图不是发布承诺；以 [CHANGELOG.md](CHANGELOG.md) 和实际 tag 为准。

## 🧪 本地验证

```bash
python -m pip install PyYAML==6.0.3
python .github/validate-repository.py
bash -n plugins/commit-commands/scripts/commit-with-dynamic-attribution.sh
node --test plugins/commit-commands/tests/*.mjs plugins/ekko-image-gen/tests/*.mjs
claude plugin validate .
claude plugin validate . --strict
claude plugin validate plugins/commit-commands
claude plugin validate plugins/commit-commands --strict
claude plugin validate plugins/ekko-image-gen
claude plugin validate plugins/ekko-image-gen --strict
```

`--strict` 会把验证警告视为错误，适合在 Pull Request 与发布前使用。

## ⚠️ Trust & Safety

Claude Code 插件和市场属于高信任组件：它们可以包含 hooks、脚本、MCP servers，并可能以当前用户权限执行代码。

安装前请：

1. 只添加可信来源的市场。
2. 阅读目标插件的 `plugin.json`、`hooks/hooks.json`、`.mcp.json` 与脚本。
3. 使用 `/hooks` 检查当前生效的 hooks 及来源。
4. 在 `local` 作用域或隔离环境中先验证第三方插件。
5. 不要在 Issue、日志或测试夹具中提交 token、密钥、完整 transcript 或私人路径。

安全问题请遵循 [SECURITY.md](SECURITY.md)，不要通过公开 Issue 披露可利用细节。

## 📄 许可证

- 本仓库原创内容默认使用 [MIT License](LICENSE)。
- 整个 [`plugins/commit-commands/`](plugins/commit-commands/) 目录单独使用其内置的 [Apache License 2.0](plugins/commit-commands/LICENSE)，包括上游派生文件与本地新增文件。
- 上游来源、文件哈希、修改说明与同步流程记录在 [`plugins/commit-commands/UPSTREAM.md`](plugins/commit-commands/UPSTREAM.md)。

贡献前请确认目标目录的许可证边界；不要把 Apache 派生内容无说明地复制到 MIT 区域。

## 🤝 社区与贡献

- 提交缺陷、文档问题或插件建议：[选择 Issue 模板](https://github.com/ZaunEkko/claude-plugins/issues/new/choose)
- 提交代码前阅读：[CONTRIBUTING.md](CONTRIBUTING.md)
- 获取使用帮助：[SUPPORT.md](SUPPORT.md)
- 报告安全问题：[SECURITY.md](SECURITY.md)
- 社区行为规范：[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

Pull Request 应说明受影响插件、验证结果、权限或 hook 变化、文档与多语言影响，以及任何上游/许可证来源。
