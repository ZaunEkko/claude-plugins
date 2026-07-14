# 보안 정책

[简体中文](../../SECURITY.md) · [English](../en/SECURITY.md) · [繁體中文](../zh-TW/SECURITY.md) · [日本語](../ja/SECURITY.md) · [한국어](SECURITY.md)

## 지원 버전

기본 개발 라인과 최신 릴리스를 지원합니다. 릴리스 준비 기간에는 현재의 공개 릴리스 준비 버전도 지원 대상으로 취급합니다. 보안 수정은 이러한 버전에 우선 적용하며, 이전 버전 백포트는 영향과 재현 가능성에 따라 결정합니다.

## 취약점 비공개 신고

GitHub private vulnerability reporting을 사용하세요:

https://github.com/ZaunEkko/claude-plugins/security/advisories/new

공개 Issue, Pull Request, Discussion 또는 commit message에 악용 가능한 세부 정보를 공개하지 마세요.

영향받는 플러그인, 버전, 파일과 scope, Claude Code/OS/Git/Node.js 버전, 최소 재현 절차, 영향과 전제 조건, 민감 정보를 제거한 로그, 알려진 완화책을 포함하세요. 실제 token, API key, 전체 transcript, 비공개 저장소 내용 또는 제3자의 개인 데이터는 보내지 마세요.

## 플러그인 위협 모델

Claude Code 플러그인과 마켓플레이스는 높은 신뢰가 필요한 구성 요소입니다. 자동 hook, 사용자 권한으로 실행되는 script, MCP server, 외부 네트워크 접근, Git 또는 파일을 변경하는 skill이 포함될 수 있습니다.

특히 command injection, path traversal, 안전하지 않은 임시 파일, fail-open commit/push/release, 선언되지 않은 hook 부작용, 자격 증명 또는 transcript 유출, marketplace source 이탈, 공급망 교체, 업스트림 provenance/라이선스 훼손, 동일 이름 배포의 동시 활성화로 인한 위험한 모호성을 중요하게 다룹니다.

## 조정된 공개

유지관리자는 합리적인 범위에서 접수, 평가, 수정 및 공개 일정을 조정합니다. 악용 세부 정보를 공개하기 전에 합리적인 수정 기간을 제공해 주세요.

이 정책은 소유하지 않은 시스템, 계정 또는 저장소 테스트, 서비스 거부, 데이터 파괴, 지속성 확보, 자격 증명 수집, 사회 공학 또는 최소 재현을 넘는 데이터 보관을 허용하지 않습니다.

## 설치자 권장 사항

신뢰하는 marketplace만 추가하고 `plugin.json`, `hooks/hooks.json`, `.mcp.json`, scripts를 검토하세요. `/hooks`로 출처를 확인하고 먼저 `--scope local`과 격리된 저장소에서 테스트하세요. 동일 scope에서는 같은 이름의 배포를 하나만 활성화하고, 업데이트 후 설치된 플러그인을 명시적으로 업데이트한 뒤 `/reload-plugins`를 실행하세요.
