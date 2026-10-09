---
name: optimize
description: This skill should be used when the user asks to "优化协作文件", "自动优化 AI 协作", "按打分结果改进", "提升 benchmark 分数", "improve the agent collaboration protocol", "fix the collaboration gaps", or invokes `/ekko-collab-protocol:optimize`. It scores the project read-only first, ranks improvements (objective defects, core gaps, other gaps), applies only the items the user approves in the project's own files and style, and reports scores before and after.
argument-hint: "[项目目录；默认当前目录]"
allowed-tools: Read, Glob, Grep, Edit, Write, AskUserQuestion, Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/benchmark.mjs:*)
version: 0.1.1
---

# Improve a software project's Coding Agent collaboration protocol

Treat `$ARGUMENTS` as the project directory; default to the current working directory.

## 1. Score first, without editing

If this conversation already holds an agent-mode score for the same project and no relevant file changed since, reuse it. Otherwise run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/benchmark.mjs" agent "<project>"
```

and complete the protocol's scoring phase read-only, exactly as `/ekko-collab-protocol:score` does. Record the static score and the agent semantic score as the "before" values. Do not edit anything during scoring.

## 2. Build the improvement plan

Follow the protocol's improvement phase. Classify every rule the agent judged partial or fail:

- **Objective defect**: a factual error such as a broken link, a documented script or command that does not exist, or a tracked credential file. Fix facts to match reality; prefer correcting documentation over changing build or code files unless the user asks otherwise.
- **Real gap**: the protocol lacks the capability. Mark core rules.
- **Scanner false negative**: the capability exists but the static rule did not recognize the wording. Do not propose any edit for it; list it as feedback for ekko-benchmark with `file:line` and the unrecognized sentence.

Order defects first, then core gaps, then other gaps; within a group, by expected score gain recomputed from the agent statuses.

For each item give the rule id, category, target file (reuse the project's existing files and structure; do not migrate to a template layout), a minimal draft and the expected gain.

## 3. Let the user choose

Present the plan, then use `AskUserQuestion` with `multiSelect: true` to let the user pick the items to apply (batch up to four options per question). Rules about authorization, writable scope, confirmation flow, deletion or release are team commitments: show the exact draft text and apply it only if the user selects it. Apply nothing that was not selected.

## 4. Apply the selected items

- Make minimal edits in the project's own language and style.
- Write only rules the team will actually follow; never add sentences just to match scanner keywords.
- Never overwrite a file wholesale; edit the relevant section.
- Do not run project commands, `git add`, `git commit` or any remote operation.

## 5. Re-score and report

Rerun the scanner, then re-review the rules you touched and any rule that depends on them. Report:

- static score and agent semantic score, before and after, with grades and core diagnoses;
- the files changed and what each change does;
- items left open, scanner false negatives reported as feedback, and anything the user chose not to apply.
