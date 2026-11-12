---
name: models
description: This skill should be used when the user asks to "看看有哪些模型", "获取模型列表", "我换了服务商", "换了 url 和 key", "配置图片模型", "优先用哪个模型", "model_unresolved", "没有可用的图片模型", or invokes `/ekko-image-gen:models`. It reads the configured OpenAI-compatible endpoint's own model catalog, works out which entries generate images, proposes a preferred order with the user, and writes the confirmed chain into the user's local configuration.
argument-hint: "（可选）偏好说明，例如「优先速度」「主要做图生图」或某个模型名"
allowed-tools: Bash
version: 0.1.19
---

# Choose the image models for the configured service

The runner never hard-codes a model name. This skill is how a human decides which models a given endpoint should use, and how that decision becomes durable.

## When to use

- After the user first fills in `baseUrl` and `apiKey` and wants to know what the service offers.
- When the user switches provider, key, or endpoint and the old chain no longer applies.
- When a generation fails with `model_unresolved`, or the user asks which model is being used.

## Read the catalog

Ask the runner, never a hand-written probe script:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/image-gen.mjs" --list-models
```

The result reports:

| Field | Meaning |
|---|---|
| `models[]` | Every id the service lists, with `imageCapable` and `created` |
| `declaresModality` | Whether the service declares output modality at all |
| `modelOrigin` | How a chain would be chosen right now: `configured`, `remembered`, `declared`, or `unresolved` |
| `resolvedChain` | What a generation would attempt today |
| `catalogSource` | `service`, `cache`, `unavailable`, or `disabled` |

Never ask the user for the API key, and never print it. The runner reads it from the user-local configuration itself.

## Work out which entries generate images

**When `declaresModality` is true**, trust the service: entries with `imageCapable: true` are the image models, already ordered newest first. Nothing needs guessing.

**When `declaresModality` is false**, the service says nothing, so apply judgement to the ids themselves. This is the case the deterministic layer deliberately refuses to guess at.

- Identify the image models from the ids and the user's own knowledge of the provider. Do not restrict this to any one vendor's naming; `seedream`, `flux`, `imagen`, `nano-banana`, `gpt-image` and names never seen before are all plausible.
- Use `created` to tell generations apart when ids share a family.
- Only ever propose ids that appear in `models[]`. Never invent, complete, or correct a name.
- Say plainly which entries are uncertain rather than presenting a guess as fact.

## Detect a provider change

Compare the existing `resolvedChain` with `models[]`. When `modelOrigin` is `configured` and a configured id is absent from the catalog, the stored chain belongs to a previous provider. Tell the user which entries no longer exist and propose a replacement chain rather than leaving the stale one in place.

## Propose, confirm, then write

Propose an ordered chain and explain the order in one line each. A useful default shape when the provider exposes tiers:

1. the everyday model, used for bulk assets;
2. a higher-quality model as the deliberate escalation for hero art and precise edits;
3. an older generation as fallback, so a temporary outage on the newest model still produces images.

Present the proposal and wait for the user to confirm or amend it. Then write it:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/image-gen.mjs" --set-models "first,second,third"
```

This rewrites only the `models` field of the user-local configuration. Every other field, the API key included, is read and written back unchanged, through a temporary file and an atomic rename. An empty string clears the field and returns the endpoint to automatic resolution.

Report the `configPath` and the stored chain. Do not echo any other value from that file.

## After writing

State that the chain takes effect on the next generation with no restart, and that re-running this skill after a provider change is the supported way to update it. Offer one small generation as a check only if the user wants it; do not generate images from this skill on your own initiative.
