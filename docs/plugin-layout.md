# 插件与 Marketplace 目录结构

本仓库采用 Claude Code 的 marketplace 布局，并把“市场目录”“可安装插件”“用户文档”明确分层。

## Marketplace 根目录

```text
.
├── .claude-plugin/
│   └── marketplace.json
├── plugins/
├── docs/
├── i18n/
└── .github/
```

- `.claude-plugin/marketplace.json`：用户添加 `ZaunEkko/claude-plugins` 后由 Claude Code 读取的市场目录。
- `plugins/`：每个可安装插件的独立根目录。
- `docs/`：跨插件安装、开发、排查与用户帮助。
- `i18n/`：README、社区文件与主要插件指南的翻译。
- `.github/`：Issue forms、Pull Request 模板与验证工作流。

Marketplace 本身不是插件。Skills、agents、hooks、MCP 与 scripts 必须放在目标 `plugins/<plugin-name>/` 内。

## 插件命名

原创插件使用清晰的 purpose-first 名称：

```text
ekko-<specific-purpose>
```

- 推荐：`ekko-agy-cli`、`ekko-notion-tasks`、`ekko-browser-debug`
- 避免：`claude-plugins`、`ekko-plugins`、`ekko-skills`、`tools`、`utils`

只有在明确需要保留上游安装名和运行时命名空间时，才允许同名兼容分发。此类例外必须记录上游来源、许可证、文件哈希、复制/修改文件、本地新增内容与同步流程。

`plugins/commit-commands/` 是当前唯一例外。

## 可安装插件 Manifest

每个插件必须包含：

```text
plugins/<plugin-name>/.claude-plugin/plugin.json
```

当前活动 marketplace manifest：

- `plugins/commit-commands/.claude-plugin/plugin.json`

`plugins/ekko-plugin-scaffold/.claude-plugin/plugin.json` 仅作为未上架的历史布局示例保留，不属于活动目录，也不是受支持的安装目标。

添加插件时，还要在根 `.claude-plugin/marketplace.json` 中加入对应的相对 `source`。

## 插件组件

| 组件 | 位置 | 说明 |
|---|---|---|
| Skill | `skills/<skill-name>/SKILL.md` | 新用户能力与按需知识的首选格式。 |
| Agent | `agents/*.md` | 可委派的专用子代理。 |
| Compatibility command | `commands/*.md` | 仅用于保留既有上游命令命名空间。 |
| Hook | `hooks/hooks.json` | 生命周期与工具事件自动化。 |
| Script | `scripts/` | 被 skill、command 或 hook 调用的可测试实现。 |
| MCP | `.mcp.json` | 插件级 MCP server 定义。 |
| Test | `tests/` | 隔离的行为与集成测试。 |

Claude Code 已将自定义 commands 统一到 skills 语义。新插件应优先创建 `skills/`，不要只为了 slash-command 外观使用 legacy `commands/`。

## `commit-commands` 结构

```text
plugins/commit-commands/
├── .claude-plugin/plugin.json
├── commands/
│   ├── clean_gone.md
│   ├── commit.md
│   └── commit-push-pr.md
├── hooks/hooks.json
├── scripts/
├── tests/
├── .gitattributes
├── LICENSE
├── README.md
└── UPSTREAM.md
```

该目录整体使用 Apache License 2.0。目录外的原创仓库内容默认使用根 MIT License。

## 文档分层

- 根 [`README.md`](../README.md)：市场定位、当前插件、快速安装、信任与社区入口。
- [`docs/`](README.md)：用户与插件作者的跨插件指南。
- `docs/<plugin>/README.md`：面向安装者的插件操作指南。
- `plugins/<plugin>/README.md`：实现、测试、依赖、隐私与维护细节。
- `i18n/<language>/`：对应的多语言入口和主要指南。

这样可以让普通用户先看到安装与命令，维护者再深入实现和 provenance。

## 新插件检查清单

1. 创建 plugin manifest 与聚焦的 README。
2. 将所有组件放在插件目录中。
3. 更新 marketplace catalog。
4. 添加行为测试和 trust/permission 说明。
5. 更新根 README、文档中心、翻译与 `CHANGELOG.md`。
6. 运行 JSON、测试与 `claude plugin validate <plugin> --strict`。
7. 使用显式 `--scope local` 测试安装，避免改动用户级设置。

完整流程见 [插件开发指南](plugin-authoring.md) 与 [贡献指南](../CONTRIBUTING.md)。
