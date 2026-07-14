# 插件开发指南

## 1. 选择清晰的插件名

原创插件使用：

```text
ekko-<specific-purpose>
```

名称应说明用途，例如 `ekko-browser-debug`，不要使用 `tools`、`utils` 或 `ekko-plugins` 之类的泛化名称。

同名例外仅适用于需要保留上游安装名与运行时命名空间的已授权兼容分发，并必须记录许可证、来源、哈希、修改与同步流程。

## 2. 创建最小结构

```text
plugins/ekko-example/
├── .claude-plugin/
│   └── plugin.json
├── README.md
└── skills/
    └── example/
        └── SKILL.md
```

最小 `plugin.json`：

```json
{
  "name": "ekko-example",
  "version": "0.1.0",
  "description": "A focused Claude Code capability."
}
```

不要在 manifest 中添加未经验证的字段；以 `claude plugin validate` 的当前 schema 为准。

## 3. 注册到 marketplace

在 `.claude-plugin/marketplace.json` 的 `plugins` 数组加入：

```json
{
  "name": "ekko-example",
  "source": "./plugins/ekko-example",
  "description": "A focused Claude Code capability."
}
```

marketplace source 与 plugin source 是不同概念：前者告诉 Claude Code 从哪里读取市场目录，后者告诉市场从哪里加载具体插件。

## 4. 选择组件

| 组件 | 位置 | 何时使用 |
|---|---|---|
| Skill | `skills/<name>/SKILL.md` | 新的用户能力或按需知识；默认选择。 |
| Agent | `agents/*.md` | 独立、可委派的专用工作流。 |
| Hook | `hooks/hooks.json` | 生命周期或工具事件的确定性自动化。 |
| MCP | `.mcp.json` | 外部工具或数据源连接。 |
| Script | `scripts/` | 被其他组件调用的可测试实现。 |
| Compatibility command | `commands/*.md` | 仅保留已存在的上游命令接口。 |

Claude Code 已把自定义 commands 统一到 skills 语义。新插件不要为了命令外观继续创建 legacy `commands/` 布局。

## 5. 设计信任边界

插件和 marketplace 可以以当前用户权限执行代码。新增 hook、script 或 MCP 时：

- 在 README 中说明触发时机、数据来源、网络访问与副作用。
- 对外部输入做系统边界验证，尤其是路径、shell 参数和临时文件。
- 失败时默认停止危险流程，不要在验证失败后继续 commit、push 或发布。
- 不把 secret 写入 prompt、日志、状态文件或测试 fixture。
- 对会自动执行的 hook 提供可发现的来源与排查说明。
- 能使用结构化参数时，不拼接 shell 字符串。

## 6. 添加测试

测试应覆盖真实行为边界，而不只检查文件存在：

- 正常路径；
- 无数据、错误数据和失败依赖；
- Linux/macOS/Windows Git Bash 差异；
- LF/CRLF 与可执行位；
- 临时文件清理；
- hooks 或下游命令失败时的退出码；
- 不接触真实远程、凭据或用户设置的隔离测试。

## 7. 文档要求

每个正式插件至少应说明：

- 用户问题与能力范围；
- 安装、作用域、更新与 `/reload-plugins`；
- 可调用的命名空间；
- 依赖与平台支持；
- hooks、脚本、MCP 和权限；
- 配置、数据保留与隐私；
- 测试与已知限制；
- 许可证与第三方来源。

同时更新根 README、文档索引、`CHANGELOG.md` 和相关翻译。

## 8. 验证与本地安装

```bash
python -m json.tool .claude-plugin/marketplace.json >/dev/null
python -m json.tool plugins/ekko-example/.claude-plugin/plugin.json >/dev/null
claude plugin validate .
claude plugin validate plugins/ekko-example --strict
```

本地安装：

```bash
claude plugin marketplace add --scope local "D:/path/to/claude-plugins"
claude plugin install ekko-example@zaunekko --scope local
```

在当前会话修改后运行 `/reload-plugins`。不要让自动测试改动用户作用域。

## 9. 提交与发布

- 从 `develop` 创建 `feature/<purpose>`。
- 在 PR 中列出实际运行的验证、权限变化和文档状态。
- 发布准备使用 `release/<version-or-purpose>`。
- 更新版本和 `CHANGELOG.md`，并确认 marketplace 与 plugin manifest 一致。
- 上游兼容分发额外验证 provenance、哈希与目录许可证。
