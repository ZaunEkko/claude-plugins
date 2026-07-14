# 지원

[简体中文](../../SUPPORT.md) · [English](../en/SUPPORT.md) · [繁體中文](../zh-TW/SUPPORT.md) · [日本語](../ja/SUPPORT.md) · [한국어](SUPPORT.md)

## 먼저 문서 확인

- [설치 및 업데이트](../../docs/getting-started.md)
- [문제 해결](../../docs/troubleshooting.md)
- [`commit-commands` 사용 가이드](docs/commit-commands/README.md)
- [Claude Code 플러그인 문서](https://code.claude.com/docs/en/plugins)

## Issue 제출

가장 가까운 [Issue 템플릿](https://github.com/ZaunEkko/claude-plugins/issues/new/choose)을 사용하고 플러그인과 버전, 설치 소스와 scope, 관련 Claude Code/OS/Git/Node.js/`gh` 버전, 최소 재현, 예상 및 실제 동작, 실행한 검사, 민감 정보를 제거한 오류를 포함하세요.

Token, API key, 전체 transcript, 비공개 저장소 내용, 사용자 설정, 민감한 경로 또는 개인 데이터를 제출하지 마세요.

## 빠른 진단

```bash
claude plugin marketplace list --json
claude plugin list --json
claude plugin details commit-commands@zaunekko
claude plugin validate .
```

실행 중 세션에서 설치 또는 업데이트한 뒤 `/reload-plugins`를 실행하세요. 공식 동일 이름 배포도 활성화되어 있다면 같은 scope에서 하나를 비활성화하세요.

악용 가능한 취약점은 [SECURITY.md](SECURITY.md)에 따라 비공개로 신고하세요. 이 저장소의 플러그인과 Claude Code 통합은 지원할 수 있지만 제3자 MCP, GitHub, Git, `gh`, 계정, 결제 또는 관련 없는 Claude API 동작은 보장하지 않습니다.
