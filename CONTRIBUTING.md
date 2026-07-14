# 贡献指南

[简体中文](CONTRIBUTING.md) · [English](i18n/en/CONTRIBUTING.md) · [繁體中文](i18n/zh-TW/CONTRIBUTING.md) · [日本語](i18n/ja/CONTRIBUTING.md) · [한국어](i18n/ko/CONTRIBUTING.md)

感谢你改进 `zaunekko` Claude Code 插件市场。贡献可以是缺陷修复、测试、文档、多语言内容、社区模板，或符合仓库命名与安全要求的新插件。

## 开始之前

- 阅读根目录 [README.md](README.md)、[CLAUDE.md](CLAUDE.md) 与目标插件文档。
- 遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。
- 安全问题不要提交公开 Issue，改用 [SECURITY.md](SECURITY.md) 中的私密渠道。
- 不要提交 API key、token、完整 transcript、用户设置、私人路径或生成的凭据文件。

## Git Flow

本仓库使用 Git Flow：

- `main`：稳定或准备发布的市场状态。
- `develop`：日常集成分支。
- `feature/<purpose>`：从 `develop` 创建，完成后合并回 `develop`。
- `release/<version-or-purpose>`：从 `develop` 准备发布到 `main`。
- `hotfix/<purpose>`：仅用于基于 `main` 的紧急修复。

除明确的 release/hotfix 工作外，不要直接向 `main` 提交。

## 贡献类型

### 修复或改进现有插件

1. 先阅读插件自己的 README、manifest、hooks 和测试。
2. 只修改请求范围内的行为，不顺带重构无关部分。
3. 更新行为测试和用户文档。
4. 如果组件会执行命令、访问网络或改变权限，清楚说明信任边界。
5. 运行目标插件及市场验证。

### 新增原创插件

原创插件通常使用 `ekko-<specific-purpose>`，名称应在 `/plugins` 列表中不依赖市场来源也能理解。

最小结构：

```text
plugins/ekko-example/
├── .claude-plugin/
│   └── plugin.json
├── README.md
└── skills/
    └── example/
        └── SKILL.md
```

然后：

1. 在 `.claude-plugin/marketplace.json` 添加 `source: "./plugins/ekko-example"`。
2. 新能力优先放在 `skills/<name>/SKILL.md`。
3. 仅在上游兼容要求下使用 `commands/*.md`。
4. 把 agents、hooks、`.mcp.json` 和 scripts 放在目标插件目录中。
5. 更新根 README、`docs/plugin-layout.md`、相关帮助文档与 `CHANGELOG.md`。
6. 添加行为测试，并完成本地安装验证。

详见 [插件开发指南](docs/plugin-authoring.md)。

### 上游同名兼容分发

同名例外只用于明确保留上游安装名和运行时命名空间的兼容分发。此类贡献必须：

- 具有允许再分发和修改的许可证；
- 保留目录级许可证；
- 记录来源 commit、文件哈希、同步步骤与修改说明；
- 在文件格式允许时标记修改过的上游文件；
- 解释与官方分发的冲突方式和启用规则；
- 不把上游派生内容混入默认 MIT 区域。

`plugins/commit-commands/` 是当前唯一同名例外。

## 文档与本地化

用户可见变化至少更新：

- 根 `README.md`；
- 目标插件 README 或 `docs/<plugin>/README.md`；
- `CHANGELOG.md`；
- 受影响的多语言入口。

简体中文根文档是当前规范源。翻译应保持命令、文件路径、插件名、版本号和安全要求一致；不要翻译代码标识符。若无法同步全部语言，请在 PR 中明确列出缺失项。

## 验证

提交 Pull Request 前至少运行：

```bash
python -m json.tool .claude-plugin/marketplace.json >/dev/null
claude plugin validate .
```

修改具体插件时还要运行其 manifest、hooks、脚本与测试。例如：

```bash
python -m json.tool plugins/commit-commands/.claude-plugin/plugin.json >/dev/null
python -m json.tool plugins/commit-commands/hooks/hooks.json >/dev/null
bash -n plugins/commit-commands/scripts/commit-with-dynamic-attribution.sh
node --test plugins/commit-commands/tests/*.mjs
claude plugin validate plugins/commit-commands --strict
```

本地安装测试请使用显式作用域：

```bash
claude plugin marketplace add --scope local "D:/path/to/claude-plugins"
claude plugin install commit-commands@zaunekko --scope local
```

在正在运行的会话中修改插件后使用 `/reload-plugins`。兼容分发测试只在同一 `local` 作用域禁用官方版本，不要由自动化流程改动用户级设置。

## Pull Request 要求

PR 描述应包含：

- 变更目的与用户可见结果；
- 受影响的插件和组件；
- 实际运行的验证命令与结果；
- 新增或变化的 hooks、脚本、网络访问、MCP 与权限；
- 文档和本地化状态；
- 上游来源、许可证或 provenance 变化；
- 未完成、跳过或失败的检查。

请保持 PR 聚焦；不要把多个无关插件或重构塞进同一变更。

## 许可证

提交即表示你有权贡献相关内容，并同意：

- 原创仓库内容按根目录 MIT License 提供；
- `plugins/commit-commands/` 内的贡献按该目录 Apache-2.0 License 提供；
- 第三方内容必须保留其许可证与来源说明。
