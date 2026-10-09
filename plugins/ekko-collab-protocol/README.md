# ekko-collab-protocol

Claude Code 插件：为软件项目初始化、评分并改进 Coding Agent 协作协议。用户指南见 [`docs/ekko-collab-protocol`](../../docs/ekko-collab-protocol/README.md)。

## 结构

```text
plugins/ekko-collab-protocol/
├── .claude-plugin/plugin.json
├── skills/
│   ├── init/SKILL.md        # /ekko-collab-protocol:init
│   ├── score/SKILL.md       # /ekko-collab-protocol:score
│   └── optimize/SKILL.md    # /ekko-collab-protocol:optimize
├── scripts/
│   ├── benchmark.mjs        # 内置评分引擎的稳定入口
│   ├── init-protocol.mjs    # plan / show / apply 确定性初始化
│   ├── lib/protocol-templates.mjs
│   ├── sync-benchmark.mjs   # 从 ekko-benchmark 同步构建产物
│   └── vendor/ekko-benchmark/
└── tests/collab-protocol.test.mjs
```

## 内置评分引擎

`scripts/vendor/ekko-benchmark/` 是 `@zaunekko/benchmark` 的构建产物（同一作者，MIT），随插件分发，原因是：

- 引擎本身零运行时依赖，打包后插件离线可用，不在运行时下载代码；
- 评分规则与初始化模板必须严格配套：测试用同一份引擎验证模板生成的协议。

`VENDOR.json` 记录包名、版本与每个文件的 SHA-256，测试会校验文件未被改动、没有未登记文件。更新引擎：

```bash
# 在 ekko-benchmark 仓库
npm run validate
# 在本仓库
node plugins/ekko-collab-protocol/scripts/sync-benchmark.mjs <ekko-benchmark 路径>
node --test plugins/ekko-collab-protocol/tests/*.mjs
```

同步脚本只复制 `dist/**/*.js`（去掉 source map 引用）和 LICENSE，并拒绝符号链接。不要手工修改 `vendor/` 下的文件。

## 初始化脚本

`init-protocol.mjs` 读取一份 JSON 配置（写在系统临时目录，不进入项目）：

| 子命令 | 作用 |
|---|---|
| `plan --config <file>` | 列出每个文件的 `CREATE` / `SKIP` 和计划摘要 `sha256:...` |
| `show --config <file> --path <file>` | 输出某个计划文件的完整内容供审阅 |
| `apply --config <file> --expected <digest>` | 重新计算计划，摘要不一致即拒绝；只用独占方式创建新文件 |

安全约束：

- 已存在的文件标记为 `SKIP`，绝不覆盖；
- 目标路径必须位于项目根目录内，路径中任一段为符号链接即拒绝；
- 配置字段白名单校验，路径不得为绝对路径或包含 `..`，命令文本不得包含反引号或换行；
- 摘要覆盖根目录、动作和完整内容，确认后项目或配置的任何变化都需要重新确认。

模板是中英双语、逐句对应的确定性文本，每一句对应 ekko-benchmark 检查的一项协作能力。模板中不使用 `TODO`、待确认等占位标记，生成后不会制造“过期标记”复核项。

## 测试

```bash
node --test plugins/ekko-collab-protocol/tests/*.mjs
```

覆盖：

- 内置引擎哈希与文件清单；
- 入口脚本离线运行；
- 中文单仓、英文单仓（允许本地提交）、中文尚未开始开发、英文多仓协作目录四种场景下，生成的协议通过全部适用规则（100 分、核心诊断 `clear`、无过期标记）；
- 过期摘要拒绝写入、已存在文件不被覆盖、计划摘要随文件变化而变化；
- 非法配置、越界路径、反引号命令与符号链接被拒绝。

## 权限与边界

- `score` 只读；`init` 和 `optimize` 只在用户确认后写入项目文件。
- 三个 skill 都不执行被扫描项目的命令，也不运行 `git add`、`git commit` 或远程操作。
- 语义评分与改进建议由当前会话的 Agent 完成；插件不调用外部模型或网络服务。
