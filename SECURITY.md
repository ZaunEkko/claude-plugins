# 安全政策

[简体中文](SECURITY.md) · [English](i18n/en/SECURITY.md) · [繁體中文](i18n/zh-TW/SECURITY.md) · [日本語](i18n/ja/SECURITY.md) · [한국어](i18n/ko/SECURITY.md)

## 支持范围

最新发布版本与默认开发线接受安全修复；是否回补旧版本取决于影响范围、可复现性与修复风险。

## 私密报告漏洞

请使用 GitHub 的私密漏洞报告：

https://github.com/ZaunEkko/claude-plugins/security/advisories/new

如果私密报告入口不可用，请只提交一条不含漏洞细节的支持请求，说明需要私密安全联系渠道；在维护者提供可用渠道前不要发送利用步骤或敏感数据。

不要在公开 Issue、Pull Request、讨论区或 commit message 中披露可利用细节。

报告请尽量包含：

- 受影响的插件、版本、文件与作用域；
- Claude Code、操作系统、Git、Node.js 等相关版本；
- 最小复现步骤或安全的 proof of concept；
- 预期影响、攻击前提与权限边界；
- 日志或截图的脱敏版本；
- 已知缓解方式。

请勿附带真实 token、API key、完整 transcript、私人仓库内容或第三方个人数据。

## 插件威胁模型

Claude Code 插件和市场是高信任组件。插件可以包含：

- 自动运行的生命周期或工具 hooks；
- 以当前用户权限执行的脚本；
- MCP servers 和外部网络连接；
- 修改 Git 仓库、文件和开发环境的 skills/commands；
- 由模型生成并传给 shell 或 Git 的数据。

我们重点处理以下问题：

- 命令注入、路径穿越或不安全的临时文件；
- hooks 绕过权限或在未声明时执行副作用；
- 凭据、transcript、用户设置或私人路径泄露；
- 市场/插件 source 路径逃逸与供应链替换；
- 上游兼容分发的来源、哈希或许可证被破坏；
- 插件同时启用导致危险的命名空间歧义；
- 安全失败后仍继续 commit、push 或发布的 fail-open 行为。

## 协调披露

维护者会尽力确认报告、评估影响并协调修复与披露时间。请给出合理的修复窗口，避免在补丁可用前公开利用细节。

我们不会授权：

- 对不属于报告者的系统、账户或仓库进行测试；
- 拒绝服务、数据破坏、持久化或凭据收集；
- 通过社会工程获取访问权限；
- 超出最小复现所需范围访问或保留数据。

## 安装者建议

- 只添加可信来源的 marketplace。
- 安装前检查 `plugin.json`、`hooks/hooks.json`、`.mcp.json` 和 scripts。
- 使用 `/hooks` 查看当前 hook 来源。
- 先在 `--scope local` 和隔离仓库中测试。
- 对同名兼容分发，在同一作用域只启用一个版本。
- 更新 marketplace 后，还要显式更新已安装插件，并在会话中运行 `/reload-plugins`。
