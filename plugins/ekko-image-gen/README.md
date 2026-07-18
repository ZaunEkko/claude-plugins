# ekko-image-gen

`ekko-image-gen` 是一个面向 Claude Code 的本地图片生成插件。它通过一个统一命令调用用户自己的 OpenAI 兼容图片服务，支持文生图、粘贴图片后的图生图、多参考图、项目上下文感知落盘、并发 worker 与主代理视觉验收。

## 能力

- 唯一用户命令：`/ekko-image-gen:generate`
- 文本输入调用 `POST /v1/images/generations`
- 当前消息附图、本地路径或 URL 调用 `POST /v1/images/edits`
- Claude Code 粘贴图片可直接作为 multipart 参考图上传
- 主代理根据当前项目、已有目录和任务上下文决定输出位置
- 一个提示词最多通过 `count: 1-4` 生成多个变体
- 多个独立素材可由受控的叶子 `image-worker` 并行生成
- 主代理读取实际图片、检查质量并定向重试
- 输出图片预览、绝对路径、`file:///` 文件链接、目录链接和服务 URL
- Windows 终端通常可通过 Ctrl+鼠标左键打开链接

## 结构

```text
plugins/ekko-image-gen/
├── .claude-plugin/plugin.json
├── agents/image-worker.md
├── skills/generate/
│   ├── SKILL.md
│   └── references/
│       ├── output-placement.md
│       └── request-schema.md
├── scripts/image-gen.mjs
├── tests/image-gen.test.mjs
└── README.md
```

`image-worker` 是叶子代理，只拥有 `Read` 与 `Bash`，不能派生更多 Agent。主代理默认最多同时启动 4 个 worker；runner 还通过用户级原子槽限制跨进程并发。

## 前置条件

- Claude Code 2.1 或更新版本
- Node.js 18 或更新版本；本仓库验证环境为 Node.js 22
- 可访问的本地图片服务，默认 `http://localhost:3050/v1`
- 有效的本地 API Key

已验证的服务能力：

- `POST /v1/images/generations`
- `POST /v1/images/edits`
- `plus-codex-gpt-image-2`：标准方图与 4K 请求参数成功；一次 16:9 请求出现过可回退的上游 502
- `codex-gpt-image-2`：`1024x1536` 与 `3840x2160` 请求成功
- `gpt-image-2`：文生图与 multipart 图生图成功
- `n` / `count` 范围 `1-4`
- 返回 `b64_json`，并可同时返回本地 HTTP 图片 URL

默认模型顺序是 `plus-codex-gpt-image-2` → `codex-gpt-image-2` → `gpt-image-2`。runner 只对上游、限流、可用性或模型相关错误执行模型回退；认证、内容或普通参数错误不会被掩盖。

支持从服务前端提取的 `1:1`、`2:3`、`3:2`、`3:4`、`4:3`、`9:16`、`16:9` 比例和 `1k / 2k / 4k` 组合，也支持显式 `WIDTHxHEIGHT`。4K 是请求层级；实测上游可能返回相同比例但较小的实际像素，因此 runner 会报告真实宽高与 `sizeMatched`，不会虚报精确 4K。

## 用户级配置

创建 `~/.claude/ekko-image-gen.local.json`。Windows 对应路径通常为 `%USERPROFILE%\.claude\ekko-image-gen.local.json`。

```json
{
  "baseUrl": "http://localhost:3050/v1",
  "apiKey": "replace-with-local-key",
  "models": [
    "plus-codex-gpt-image-2",
    "codex-gpt-image-2",
    "gpt-image-2"
  ],
  "size": "1024x1024",
  "quality": "auto",
  "maxConcurrency": 4,
  "maxGlobalConcurrency": 4,
  "timeoutMs": 240000,
  "queueTimeoutMs": 600000,
  "maxRetries": 1,
  "maxInputBytes": 26214400
}
```

配置每次调用时重新读取，不需要重启 Claude Code。环境变量可以覆盖 JSON；完整字段见 `skills/generate/references/request-schema.md`。

不要把真实 API Key 写入插件目录、项目仓库、提示词、测试夹具或日志。

## 使用

### 文生图

```text
/ekko-image-gen:generate 生成一张像素风红色治疗药水图标，透明背景，用于当前游戏项目的背包 UI
```

### 粘贴图片后图生图

在同一条 Claude Code 消息中粘贴图片，然后输入：

```text
/ekko-image-gen:generate 保留主体身份，把场景改成赛博朋克雨夜；输出到当前前端项目最合适的图片资源目录
```

### 显式目录

```text
/ekko-image-gen:generate 生成三种角色头像方案，放到 Assets/Art/Characters/Portraits
```

### 自主批量素材

```text
/ekko-image-gen:generate 根据当前游戏任务规划并生成所需的角色头像、技能图标和背包物品图标；并行生成，完成后检查风格一致性，不合格的单项再重试
```

主代理负责素材清单、目录、共享美术方向和最终验收。worker 只执行分配到的单个或小批 job。

## 输出行为

成功后应先使用 Claude Code 的 `Read` 读取图片，以便支持视觉渲染的宿主直接展示。最终结果至少包含：

```markdown
- 文件：`D:\project\game\Assets\UI\health-potion.png`
- [打开图片](file:///D:/project/game/Assets/UI/health-potion.png)
- [打开所在目录](file:///D:/project/game/Assets/UI/)
- 服务 URL：http://localhost:3050/images/...png
```

runner 使用排他写入，不覆盖已有文件；发生同名冲突时自动添加数字后缀。

## 输出目录策略

优先级：

1. 用户显式目录；
2. 当前任务已经确定的目标；
3. `CLAUDE.md` / `AGENTS.md` 与项目资源规则；
4. 消费该图片的现有模块及邻近资源；
5. 项目已有的常规素材目录；
6. `<项目根>/generated-images/` 回退目录。

目录推断由当前主代理完成。worker 接收明确路径后不得自行改变全局放置策略。

## 隐私与副作用

- 请求会把提示词和选择的参考图片发送到配置的本地服务。
- 远程图片 URL 会先由 Claude Code 所在主机下载，再作为文件上传。
- 生成文件写入主代理选择的项目目录。
- API Key 只由 runner 从本地配置或环境变量读取。
- runner 不删除失败或被主代理拒绝的图片。
- 插件没有 hook、MCP 常驻进程或自动后台任务。

## 测试

```bash
node --check plugins/ekko-image-gen/scripts/image-gen.mjs
node --test plugins/ekko-image-gen/tests/image-gen.test.mjs
python -m json.tool plugins/ekko-image-gen/.claude-plugin/plugin.json >/dev/null
claude plugin validate plugins/ekko-image-gen --strict
```

测试使用隔离的本地 HTTP server，不接触真实 API Key、真实图片服务、用户配置或远程仓库。

## 本地安装

本仓库当前按用户要求只做本地使用，不执行远程 push 或发布。

```bash
claude plugin marketplace add --scope user "D:/project/coding/project/github/claude-plugins"
claude plugin install ekko-image-gen@zaunekko --scope user
```

安装或更新后，在当前 Claude Code 会话执行：

```text
/reload-plugins
```

## 许可证

MIT。参见仓库根目录 `LICENSE`。
