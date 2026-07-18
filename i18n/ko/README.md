<div align="center">

# 🧩 Claude Code Plugins

### Claude Code를 위한 개인화 플러그인 마켓플레이스

*유용한 skills, agents, hooks, MCP 설정과 호환 명령을 설치 및 검증 가능한 Claude Code 기능으로 패키징합니다*

[简体中文](../../README.md) · [English](../en/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](README.md)

[![Claude Code](https://img.shields.io/badge/Claude_Code-plugin_marketplace-D97757?style=flat-square&logo=anthropic&logoColor=white)](https://code.claude.com/docs/en/plugins)
[![Marketplace](https://img.shields.io/badge/marketplace-zaunekko-6f42c1?style=flat-square)](../../.claude-plugin/marketplace.json)
[![License](https://img.shields.io/badge/license-MIT%20%2B%20Apache--2.0-blue?style=flat-square)](#-라이선스)
[![Status](https://img.shields.io/badge/status-public--release--ready-blue?style=flat-square)](#-이-저장소는-무엇인가요)

</div>

## ✨ 이 저장소는 무엇인가요

ZaunEkko의 Claude Code 플러그인 마켓플레이스 컨테이너입니다. 마켓플레이스 카탈로그, 설치 가능한 플러그인, 사용자 문서, 검증 절차, 커뮤니티 파일을 관리합니다. Claude Code는 [`.claude-plugin/marketplace.json`](../../.claude-plugin/marketplace.json)을 읽습니다.

이 저장소는 공개 릴리스와 커뮤니티 협업을 준비하고 있습니다. 플러그인은 공개 배포, 투명한 검토, 안전한 기여를 기준으로 구현·검증·문서화합니다. 릴리스 준비가 완료될 때까지 저장소 공개 범위는 제한된 상태일 수 있습니다. 마켓플레이스 이름은 `zaunekko`, GitHub 소스는 `ZaunEkko/claude-plugins`입니다.

## 🧰 포함 가능한 구성 요소

- `skills/<skill-name>/SKILL.md`: 새로운 사용자 기능 또는 필요할 때 로드되는 지식.
- `agents/*.md`: 재사용 가능한 전문 하위 에이전트.
- `hooks/hooks.json`: 수명 주기 및 도구 이벤트 자동화.
- `.mcp.json`: 플러그인 MCP servers.
- `scripts/`: 다른 구성 요소가 호출하는 테스트 가능한 구현.
- `commands/*.md`: 기존 업스트림 인터페이스 호환성 유지 전용.

원본 플러그인은 보통 `ekko-<specific-purpose>` 이름을 사용합니다. 동일 이름 예외는 라이선스가 허용되고 업스트림 설치 이름과 런타임 네임스페이스를 유지해야 하는 호환 배포에만 적용됩니다.

## 📦 현재 내용

| 플러그인 | 상태 | 설명 | 문서 |
|---|---|---|---|
| `commit-commands` | 사용 가능 · 호환 배포 | 공식 3개 명령 이름을 유지하고 현재 세션 모델과 선택적 effort를 Git commit attribution에 기록하며 Claude Code 내부의 직접 commit이 wrapper를 우회하지 못하게 합니다. | [사용 가이드](docs/commit-commands/README.md) · [구현 및 업스트림 정보](../../plugins/commit-commands/README.md) |
| `ekko-image-gen` | 로컬 사용 · 오리지널 | 하나의 명령으로 로컬 텍스트 이미지 생성, 붙여넣은 참조 이미지 편집, 프로젝트 문맥 기반 저장, 제한된 리프 worker, 시각 검수 및 클릭 가능한 로컬 출력을 제공합니다. | [사용 가이드](../../docs/ekko-image-gen/README.md) · [구현](../../plugins/ekko-image-gen/README.md) |

`commit-commands`는 공식 배포와 같은 네임스페이스를 사용합니다. 동일 scope에서는 하나만 활성화하세요.

## 🚀 빠른 시작

### Claude Code가 이미 열려 있는 경우

```text
/plugin marketplace add ZaunEkko/claude-plugins
/plugin install commit-commands@zaunekko
/reload-plugins
```

### Agent에게 설치 요청하기

다음 지시를 Claude Code Agent에 전달하세요:

```text
이 Claude Code plugin marketplace를 설치해 주세요:
https://github.com/ZaunEkko/claude-plugins

대상 플러그인: commit-commands@zaunekko
user, project, local 중 어떤 scope를 사용할지 확인하고 선택한 scope만 변경하세요. 같은 scope에서 공식 commit-commands가 활성화되어 있다면 네임스페이스 충돌을 설명하고 제거하지 말고 비활성화하세요. 완료 후 /reload-plugins를 실행하고 실제 명령과 결과를 보고하세요. 권한, 인증 또는 보안 확인이 필요하면 중단하고 제가 결정하게 해 주세요.
```

### CLI 설치

```bash
claude plugin marketplace add ZaunEkko/claude-plugins
claude plugin marketplace update zaunekko
claude plugin install commit-commands@zaunekko --scope user
```

동일 scope에서 공식 버전이 활성화되어 있다면:

```bash
claude plugin disable commit-commands@claude-plugins-official --scope user
claude plugin enable commit-commands@zaunekko --scope user
```

실행 중인 세션에서 설치, 활성화, 비활성화 또는 업데이트한 뒤:

```text
/reload-plugins
```

마켓플레이스 새로 고침과 설치된 플러그인 업데이트는 별도 작업입니다:

```bash
claude plugin marketplace update zaunekko
claude plugin update commit-commands@zaunekko --scope user
```

| Scope | 용도 | 설정 파일 |
|---|---|---|
| `user` | 현재 사용자의 기본 설치 | `~/.claude/settings.json` |
| `project` | 저장소 협업자와 공유 | `.claude/settings.json` |
| `local` | 현재 저장소에서만 로컬 테스트 | `.claude/settings.local.json` |

호환 배포의 로컬 테스트에는 `--scope local`을 사용하고 사용자 범위 설정을 자동으로 변경하지 마세요.

## 🎯 명령

| 명령 | 용도 |
|---|---|
| `/commit-commands:commit` | 변경 사항을 확인하고 관련 파일을 stage한 뒤 하나의 commit을 만듭니다. |
| `/commit-commands:commit-push-pr` | commit, push, Pull Request 생성을 순서대로 수행합니다. |
| `/commit-commands:clean_gone` | 결정적인 정리 plan을 만들고 명시적 확인을 받은 뒤, 정확한 `refs/remotes/...` upstream이 없는 안전한 브랜치와 조건을 충족하는 clean worktree만 제거합니다. |

Attribution 예시:

```text
Generated with [Claude Code](https://claude.ai/code)

Model: gpt-5.6-sol xhigh

Co-Authored-By: Claude <noreply@anthropic.com>
```

신뢰할 수 있는 모델을 확인할 수 없으면 오래된 값이나 `unknown`을 남기지 않고 `Model:` 줄을 제거합니다.

## 📚 문서

- [문서 센터](../../docs/README.md)
- [설치 및 업데이트](../../docs/getting-started.md)
- [플러그인 작성 가이드](../../docs/plugin-authoring.md)
- [플러그인 구조](../../docs/plugin-layout.md)
- [문제 해결](../../docs/troubleshooting.md)
- [`commit-commands` 사용 가이드](docs/commit-commands/README.md)
- [기여 가이드](CONTRIBUTING.md)
- [지원](SUPPORT.md)

## 🏗️ 저장소 구조

```text
.
├── .claude-plugin/marketplace.json
├── .github/
├── docs/
├── i18n/
└── plugins/
    └── commit-commands/
```

각 설치 가능한 플러그인은 자체 디렉터리에 `.claude-plugin/plugin.json`과 모든 구성 요소를 보관합니다.

## 🧭 Roadmap

- `commit-commands`의 크로스 플랫폼 및 세션 해석 동작을 계속 검증합니다.
- 문서화된 제안, 커뮤니티 검토 및 검증을 통해 목적 중심 플러그인을 추가합니다.
- 새 플러그인에 다국어 진입점, 권한 설명, 동작 테스트를 추가합니다.
- 공개 릴리스 및 커뮤니티 기여를 위한 버전 관리, 업데이트, 롤백 및 보안 검토 절차를 지속적으로 유지합니다.

## 🧪 검증

```bash
python -m pip install PyYAML==6.0.3
python .github/validate-repository.py
bash -n plugins/commit-commands/scripts/commit-with-dynamic-attribution.sh
node --test plugins/commit-commands/tests/*.mjs
claude plugin validate .
claude plugin validate . --strict
claude plugin validate plugins/commit-commands
claude plugin validate plugins/commit-commands --strict
```

## ⚠️ 신뢰와 안전

Claude Code 플러그인과 마켓플레이스는 높은 신뢰가 필요한 구성 요소입니다. hooks, scripts, MCP servers가 현재 사용자 권한으로 코드를 실행할 수 있습니다.

설치 전에 `plugin.json`, `hooks/hooks.json`, `.mcp.json`, scripts를 검토하고 `/hooks`로 활성 hook과 출처를 확인하세요. 먼저 `local` scope 또는 격리된 환경에서 테스트하고, Issue나 로그에 token, key, 전체 transcript, 비공개 저장소 내용 또는 민감한 경로를 게시하지 마세요.

취약점은 [SECURITY.md](SECURITY.md)에 따라 비공개로 신고하세요.

## 📄 라이선스

- 원본 저장소 내용은 루트 [MIT License](../../LICENSE)를 따릅니다.
- 전체 [`plugins/commit-commands/`](../../plugins/commit-commands/) 디렉터리는 내부 [Apache License 2.0](../../plugins/commit-commands/LICENSE)을 따릅니다.
- 업스트림 출처, 해시, 변경 사항 및 동기화 절차는 [`UPSTREAM.md`](../../plugins/commit-commands/UPSTREAM.md)에 기록됩니다.

## 🤝 커뮤니티

- [Issue 템플릿](https://github.com/ZaunEkko/claude-plugins/issues/new/choose)
- [기여 가이드](CONTRIBUTING.md)
- [지원](SUPPORT.md)
- [보안 정책](SECURITY.md)
- [행동 강령](CODE_OF_CONDUCT.md)
