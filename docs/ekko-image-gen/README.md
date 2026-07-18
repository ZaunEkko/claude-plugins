# `ekko-image-gen` 使用指南

`ekko-image-gen` 通过一个 Claude Code 命令调用本机图片服务，并让当前 Agent 根据项目上下文决定素材目录、展示结果、验收图片和定向重试。

## 命令

```text
/ekko-image-gen:generate <图片需求>
```

同一个命令自动识别：

- 没有参考图：文生图；
- 当前消息粘贴或附加了图片：图生图；
- 提供多个图片路径或 URL：多参考图编辑；
- 多个独立素材：受控 worker 并行生成；
- 一张图的多个方案：同一请求使用 `count: 1-4`。

## 快速配置

创建 `%USERPROFILE%\.claude\ekko-image-gen.local.json`：

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
  "maxGlobalConcurrency": 4
}
```

密钥文件位于用户目录，不进入插件仓库。修改后下一次调用立即生效。

默认模型优先级为：

1. `plus-codex-gpt-image-2`
2. `codex-gpt-image-2`
3. `gpt-image-2`

Agent 可根据任务显式调整顺序；runner 会在上游、限流或模型可用性错误后自动尝试下一模型。用户要求严格固定模型时可设置 `strictModel: true`。

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
2. 输出绝对文件路径；
3. 输出 `[打开图片](file:///...)`；
4. 输出 `[打开所在目录](file:///...)`；
5. 输出服务返回的 HTTP URL；
6. 标明主代理验收结果和是否发生重试。

Windows 终端通常使用 Ctrl+鼠标左键打开 Markdown 链接。

## 输出目录

用户指定路径时严格使用该路径。未指定时，当前 Agent 综合任务上下文、`CLAUDE.md` / `AGENTS.md`、项目类型、现有资源目录和消费代码选择位置。无法可靠判断时回退到项目根目录的 `generated-images/`。

## 本地用户级安装

```bash
claude plugin marketplace add --scope user "D:/project/coding/project/github/claude-plugins"
claude plugin install ekko-image-gen@zaunekko --scope user
```

然后执行：

```text
/reload-plugins
```

本插件当前只在本地仓库使用，不要求也不执行远程 push。

## 故障排查

- `missing_api_key`：检查用户级 JSON 或 `EKKO_IMAGE_GEN_API_KEY`。
- 连接失败：确认 `http://localhost:3050` 服务正在运行。
- 图生图 URL 失败：优先粘贴图片或使用本地路径；runner 会从宿主下载后 multipart 上传。
- `queue_timeout`：降低 worker 数量或检查是否存在长期占用的生成请求。
- 终端不显示图片：使用输出的 `file:///` 链接 Ctrl+点击打开。
