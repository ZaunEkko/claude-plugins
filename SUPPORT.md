# 支持与帮助

[简体中文](SUPPORT.md) · [English](i18n/en/SUPPORT.md) · [繁體中文](i18n/zh-TW/SUPPORT.md) · [日本語](i18n/ja/SUPPORT.md) · [한국어](i18n/ko/SUPPORT.md)

## 先查文档

- [安装与更新](docs/getting-started.md)
- [故障排查](docs/troubleshooting.md)
- [`commit-commands` 使用指南](docs/commit-commands/README.md)
- [插件开发指南](docs/plugin-authoring.md)
- [Claude Code 官方插件文档](https://code.claude.com/docs/en/plugins)

## 提交问题

请使用与问题最接近的 [Issue 模板](https://github.com/ZaunEkko/claude-plugins/issues/new/choose)：

- Bug report：可复现的插件或市场缺陷；
- Documentation：错误、缺失或难以理解的文档；
- Plugin request：新插件或新能力建议。

支持请求请包含：

- 插件名、版本和安装来源；
- `user`、`project` 或 `local` 作用域；
- Claude Code、操作系统、Git、Node.js 与 `gh`（如相关）版本；
- 最小复现步骤；
- 预期与实际行为；
- 已运行的验证或排查命令；
- 已脱敏的错误信息。

不要提交 token、API key、完整 transcript、私人仓库内容、用户设置文件或可识别个人的信息。

## 安装问题的快速诊断

```bash
claude plugin marketplace list --json
claude plugin list --json
claude plugin details commit-commands@zaunekko
claude plugin validate .
```

在当前会话中安装或更新插件后运行：

```text
/reload-plugins
```

如果同名官方分发也处于启用状态，请在相同作用域禁用其中一个。

## 安全问题

可利用漏洞、凭据泄露、命令注入或供应链问题请不要提交公开 Issue。按照 [SECURITY.md](SECURITY.md) 使用私密报告渠道。

## 支持边界

维护者可以帮助定位本仓库插件与 Claude Code 插件集成问题，但无法保证：

- 第三方 MCP server、GitHub、Git 或 `gh` 的服务可用性；
- 未受支持 shell、修改过的 Claude Code 客户端或非标准插件加载器；
- 与本仓库无关的通用 Claude API、账号、计费或模型访问问题。
