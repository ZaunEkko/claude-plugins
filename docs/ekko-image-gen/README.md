# `ekko-image-gen` 使用指南

`ekko-image-gen` 通过一个 Claude Code 命令调用用户配置的 OpenAI-compatible Images API。endpoint 可以是 localhost，也可以是第三方 HTTPS 服务；当前 Agent 负责根据项目上下文决定素材目录、展示结果、验收图片和定向重试。

## 命令

```text
/ekko-image-gen:generate <图片需求>
```

同一个命令自动识别：

- 没有参考图：文生图；
- 当前消息粘贴或附加了图片：图生图；
- 提供多个图片路径或 URL：多参考图编辑；
- 多个独立素材：受控 worker 并行生成；
- 一张图的多个方案：使用一个逻辑 job 的 `count: 1-4`，runner 可按服务商单次上限自动拆分。

## 快速配置

创建 `%USERPROFILE%\.claude\ekko-image-gen.local.json`：

```json
{
  "baseUrl": "https://your-openai-compatible-service.example/v1",
  "apiKey": "replace-with-local-key"
}
```

密钥文件位于用户目录，不进入插件仓库。普通用户只需填写 `baseUrl` 和 `apiKey`；模型默认使用 `gpt-image-2`，多图能力由真实响应自动适配。修改配置后下一次调用立即生效。

`maxImagesPerRequest` 是高级可选上限，默认 `4`，有效范围 `1-4`。不配置时，如果服务对 `n: 3` 只返回一张，runner 会从真实响应推断有效单次能力，并在原始逻辑 `count` 范围内安排有界 follow-up 请求。不同素材 job 仍可并发执行。

`maxOutputBytes` 是高级可选的单张输出上限，默认 50 MiB。除了限制解码后的 base64 图片和流式图片 URL，runner 还会在解析前限制 Images API JSON：按本次请求数量和 base64 膨胀推导容量，并预留 64 KiB 元数据；超限返回 `response_too_large`，不会重试或切换模型。

如果由 Agent 协助安装，应让 Agent 检查并创建只包含 `baseUrl` 与占位 `apiKey` 的配置模板，然后提示用户直接编辑 `%USERPROFILE%\.claude\ekko-image-gen.local.json`（Windows）或 `~/.claude/ekko-image-gen.local.json`。不要在对话中粘贴 API Key。使用第三方 endpoint 时，提示词和参考图会发送到该第三方服务。

仓库默认模型为 `gpt-image-2`，普通用户无需填写 `models`。OpenAI-compatible 描述的是 HTTP API 形状；只有目标 endpoint 使用其他模型名或需要自定义 fallback 时，才配置有序 `models` 列表。runner 会在上游、限流或模型可用性错误后自动尝试下一模型，用户要求严格固定模型时可设置 `strictModel: true`。

支持 `1:1`、`2:3`、`3:2`、`3:4`、`4:3`、`9:16`、`16:9` 及相应的 `1k / 2k / 4k` 服务预设，也可传精确 `WIDTHxHEIGHT`。服务可能接受 4K 请求但返回较小的实际像素，最终结果会同时报告请求尺寸和实际尺寸。

## 示例

### 单张图片

```text
/ekko-image-gen:generate 生成一个适合当前产品登录页的抽象安全插画，不要文字
```

### 直接粘贴图片

粘贴图片并在同一条消息中输入：

```text
/ekko-image-gen:generate 保留人物和构图，把整体改成低多边形游戏立绘风格
```

### 项目素材

```text
/ekko-image-gen:generate 为当前 Godot 游戏生成治疗药水、法力药水和钥匙三枚背包图标；由你判断现有素材目录，并检查三张图的风格一致性
```

主代理先读取项目上下文和素材结构，再把明确的 job 分给最多 4 个一层叶子 worker。worker 没有 `Agent` 工具，不能继续递归派生。

## 结果

成功结果会：

1. 使用 `Read` 尝试在 Claude Code 中直接显示图片；
2. 输出作为主要可移植结果的绝对文件路径；
3. 输出 best-effort 的 `[尝试打开图片](file:///...)`；
4. 输出 best-effort 的 `[尝试打开所在目录](file:///...)`；
5. 输出服务返回的 HTTP URL；
6. 报告 `requestedCount`、`returnedCount`、请求拆分状态和每次请求的原始 usage；
7. 保留上游短返回或后续请求失败前已经生成的文件，并明确标注数量告警或 `partial` 状态；
8. 标明主代理验收结果和是否发生重试。

本地 `file://` 链接是否能通过 Ctrl/Cmd+点击打开取决于 Claude Code 渲染器和终端宿主，不是跨终端保证。链接失效时使用绝对路径；只有用户明确要求后，代理才会提议通过 `Bash` 调用当前平台的正常打开器，不会在生成完成后自动弹出 GUI 应用。

## 输出目录

用户指定路径时严格使用该路径。未指定时，当前 Agent 综合任务上下文、`CLAUDE.md` / `AGENTS.md`、项目类型、现有资源目录和消费代码选择位置。无法可靠判断时回退到项目根目录的 `generated-images/`。

## 安装

在 Claude Code 当前会话中：

```text
/plugin marketplace add ZaunEkko/claude-plugins
/plugin install ekko-image-gen@zaunekko
/reload-plugins
```

CLI user-scope 安装：

```bash
claude plugin marketplace add ZaunEkko/claude-plugins
claude plugin marketplace update zaunekko
claude plugin install ekko-image-gen@zaunekko --scope user
```

本地 clone 开发时，也可以把 marketplace source 换成仓库目录：

```bash
claude plugin marketplace add --scope user "<path-to-cloned-claude-plugins>"
claude plugin install ekko-image-gen@zaunekko --scope user
```

安装完成后，按“快速配置”一节创建用户配置文件，再执行 `/reload-plugins`。

## 故障排查

- `missing_api_key`：检查用户级 JSON 或 `EKKO_IMAGE_GEN_API_KEY`。
- 连接失败：确认用户配置中的 `baseUrl` 可访问；localhost 服务需已启动，第三方 HTTPS endpoint 需检查网络、URL 和认证。
- 图生图 URL 失败：优先粘贴图片或使用本地路径；runner 会从宿主下载后 multipart 上传。
- `queue_timeout`：降低 worker 数量或检查是否存在长期占用的生成请求。
- `response_too_large`：Images API 返回的 JSON 超过按单图上限和本次请求数量推导出的安全边界；检查服务异常响应，或在确认输出确有需要后提高 `maxOutputBytes`。
- 请求多张但服务单次只返回一张：runner 会自动补齐；若后续请求失败，检查 `partial` 错误。已知服务只能单张时可选设 `maxImagesPerRequest: 1` 以省去首次探测。
- 终端不显示图片：先使用输出的绝对路径；本地 `file:///` 便利链接可能受终端宿主限制。需要时可明确要求代理调用当前平台的正常打开器。
