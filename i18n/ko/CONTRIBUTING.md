# 기여 가이드

[简体中文](../../CONTRIBUTING.md) · [English](../en/CONTRIBUTING.md) · [繁體中文](../zh-TW/CONTRIBUTING.md) · [日本語](../ja/CONTRIBUTING.md) · [한국어](CONTRIBUTING.md)

`zaunekko` Claude Code 플러그인 마켓플레이스에 대한 기여를 환영합니다. 버그 수정, 테스트, 문서, 번역, 커뮤니티 템플릿 및 이름과 안전 요구사항을 충족하는 새 플러그인이 포함됩니다.

## 시작하기 전에

- [README](README.md), [`CLAUDE.md`](../../CLAUDE.md), 대상 플러그인 문서를 읽으세요.
- [행동 강령](CODE_OF_CONDUCT.md)을 준수하세요.
- 보안 문제는 [SECURITY.md](SECURITY.md)에 따라 비공개로 신고하세요.
- API key, token, 전체 transcript, 사용자 설정, 비공개 경로 또는 자격 증명 파일을 commit하지 마세요.

## Git Flow

- `main`: 안정 또는 릴리스 준비 상태.
- `develop`: 진행 중인 작업의 통합 브랜치.
- `feature/<purpose>`: `develop`에서 생성하고 `develop`로 병합.
- `release/<version-or-purpose>`: `develop`에서 `main`으로 릴리스 준비.
- `hotfix/<purpose>`: `main` 기반 긴급 수정 전용.

## 플러그인 기여

원본 플러그인은 `ekko-<specific-purpose>`를 사용합니다. 새 기능은 `skills/<name>/SKILL.md`를 우선하며, `commands/`는 기존 업스트림 호환 인터페이스에만 사용합니다. agents, hooks, `.mcp.json`, scripts, 테스트와 문서는 대상 플러그인 디렉터리에 두세요.

동일 이름 호환 배포는 디렉터리 라이선스를 보존하고 source commit, hash, 복사/수정 파일, 동기화 절차, 네임스페이스 충돌과 로컬 추가 내용을 기록해야 합니다. 현재 예외는 `plugins/commit-commands/`뿐입니다.

## 문서와 번역

사용자에게 보이는 변경은 루트 README, 사용 가이드, `CHANGELOG.md`, 관련 번역을 업데이트해야 합니다. 명령, 경로, 플러그인 이름, 버전과 보안 요구사항은 모든 언어에서 동일하게 유지하고 코드 식별자는 번역하지 마세요.

## 검증

```bash
python -m json.tool .claude-plugin/marketplace.json >/dev/null
claude plugin validate .
```

`commit-commands` 변경 시:

```bash
python -m json.tool plugins/commit-commands/.claude-plugin/plugin.json >/dev/null
python -m json.tool plugins/commit-commands/hooks/hooks.json >/dev/null
bash -n plugins/commit-commands/scripts/commit-with-dynamic-attribution.sh
node --test plugins/commit-commands/tests/*.mjs
claude plugin validate plugins/commit-commands --strict
```

로컬 설치에는 `--scope local`, 실행 중 세션에는 `/reload-plugins`를 사용하세요. 자동 검증은 user scope 설정을 변경하면 안 됩니다.

## Pull Request

사용자 결과, 영향받는 플러그인/구성 요소, 실제 검증 결과, 권한 또는 신뢰 경계 변경, 문서/번역 상태, 업스트림 또는 라이선스 변경을 설명하세요. 실행하지 않았거나 실패한 검사도 명확히 기록하세요.

## 라이선스

원본 저장소 내용은 루트 MIT License, `plugins/commit-commands/` 내부 기여는 해당 디렉터리의 Apache-2.0 License를 따릅니다.
