# `commit-commands` 사용 가이드

[简体中文](../../../../docs/commit-commands/README.md) · [English](../../../en/docs/commit-commands/README.md) · [繁體中文](../../../zh-TW/docs/commit-commands/README.md) · [日本語](../../../ja/docs/commit-commands/README.md) · [한국어](README.md)

`commit-commands@zaunekko`는 Anthropic의 공식 동일 이름 플러그인에서 파생된 제3자 호환 배포입니다. 설치 이름, 명령 네임스페이스와 Git 워크플로를 유지하면서 commit attribution의 `Model:`을 현재 Claude Code 세션 모델과 선택적 effort로 업데이트하고, Claude Code 내부의 직접 `git commit`이 attribution wrapper를 우회하지 못하게 합니다.

ZaunEkko가 유지관리하며 Anthropic 공식 릴리스가 아닙니다.

## 설치

```bash
claude plugin marketplace add ZaunEkko/claude-plugins
claude plugin marketplace update zaunekko
claude plugin install commit-commands@zaunekko --scope user
```

같은 scope에서는 하나만 활성화하세요:

```bash
claude plugin disable commit-commands@claude-plugins-official --scope user
claude plugin enable commit-commands@zaunekko --scope user
```

현재 세션에서 `/reload-plugins`를 실행하세요. 로컬 테스트는 `local` scope를 사용합니다.

## 명령

| 명령 | 용도 |
|---|---|
| `/commit-commands:commit` | 변경 확인, 관련 파일 stage, 하나의 commit 생성. |
| `/commit-commands:commit-push-pr` | 앞 단계 성공 후에만 commit, push, PR 생성을 순서대로 실행. |
| `/commit-commands:clean_gone` | plan과 명시적 확인 후, 정확한 `refs/remotes/...` upstream이 없고 commit이 다른 ref에 보존된 로컬 브랜치와 clean worktree를 안전하게 정리. |

Claude Code는 사용자 commands를 skills로 취급하지만 공식 인터페이스 호환을 위해 `commands/` 구조를 유지합니다.

## wrapper를 우회하는 직접 commit 방지

`PreToolUse` Bash guard는 Claude Code가 실행하기 전에 직접 `git commit`, `git.exe commit`, 그리고 `git -C <경로> commit` 같은 일반적인 Git 전역 옵션 형식을 거부합니다. 대신 `/commit-commands:commit`, `/commit-commands:commit-push-pr` 또는 플러그인 attribution wrapper를 사용하세요.

이 guard는 Claude Code의 Bash 도구 호출에만 적용됩니다. 로컬 또는 전역 Git hook을 설치하지 않으며 터미널, IDE, Git GUI, CI에서 만드는 commit에는 영향을 주지 않습니다. `status`, `diff`, `log`, `push` 같은 commit 이외의 Git 명령과 wrapper의 최상위 호출은 계속 허용됩니다.

## gone 브랜치 안전 정리

`/commit-commands:clean_gone`은 더 이상 `git branch -v`의 `[gone]` 텍스트를 해석하지 않으며 worktree를 강제로 제거하지 않습니다. 다음 절차를 사용합니다:

1. 구조화된 Git 출력으로 완전하고 결정적인 plan을 생성하며, 정확한 `refs/remotes/...` upstream ref가 설정되어 있지만 해당 ref가 존재하지 않는 로컬 브랜치만 고려합니다.
2. 모든 `DELETE`/`SKIP` 항목과 `Plan digest: sha256:...`를 표시합니다.
3. 사용자가 그 정확한 plan을 명시적으로 확인한 경우에만 apply로 진행합니다.
4. Apply 단계에서 모든 상태를 다시 계산합니다. ref, OID, 정확한 upstream, worktree 연결, current/main worktree 여부, dirty/untracked/locked/prunable 상태 또는 보존 ref 중 하나라도 변경되면 digest가 일치하지 않아 아무것도 삭제하기 전에 중지합니다.
5. clean, unlocked, non-prunable 상태이며 current 또는 main이 아닌 worktree만 `--force` 없이 제거합니다. worktree 제거가 성공한 후에만 브랜치를 삭제합니다.

다음 경우는 항상 건너뜁니다:

- current 또는 main worktree;
- tracked 또는 untracked 변경이 있는 worktree;
- locked 또는 prunable worktree;
- 삭제 후보 집합 밖의 다른 로컬 브랜치, 기존 remote-tracking ref 또는 tag가 commit을 보존하지 않는 브랜치. 후보 브랜치끼리는 서로를 보존하지 않습니다.

이 명령은 fetch, prune 또는 네트워크 접근을 수행하지 않으며 강제 override 모드도 없습니다. 첫 번째 실패에서 중지합니다. 부분 실패 후에는 수동으로 삭제를 마치지 말고 보고된 부분 완료 상태를 확인한 뒤 `plan`을 다시 실행하세요.

## Attribution

```text
Generated with [Claude Code](https://claude.ai/code)

Model: <model> [effort]

Co-Authored-By: Claude <noreply@anthropic.com>
```

마지막 Claude Code marker 뒤의 attribution을 갱신하고 빈 줄을 중복하지 않으면서 하나 보장합니다. 이전의 독립 `Effort:` 줄을 제거하고 LF/CRLF 및 대상이 아닌 byte를 보존합니다. Claude가 다른 attribution marker를 생성하면 wrapper가 render 전에 설정된 `Generated with [Claude Code](https://claude.ai/code)`로 복원합니다. `Model:`이 없으면 동적으로 확인한 값을 삽입하고 marker 자체가 없으면 완전한 표준 attribution block을 추가합니다. 신뢰 가능한 모델이 없을 때는 정적 값을 만들어 내지 않습니다.

모델은 현재 transcript의 최신 유효 assistant `message.model`, SessionStart model, 설정된 기본 `model` 순서로 확인합니다. Effort는 `CLAUDE_EFFORT`, 설정의 `effort`/`effortLevel` 순서입니다. 값은 한 줄 데이터로 검증되며 shell code로 실행되지 않습니다.

## Fail-closed 동작

Wrapper는 비공개 임시 message를 만들고 attribution을 원자적으로 업데이트하며 render 성공 후에만 `git commit -F`를 실행합니다. Git hook 실패를 그대로 전달하고 성공, 실패 또는 중단 후 임시 파일을 정리합니다. commit 실패 후 push하거나 push 실패 후 PR을 만들지 않습니다.

자동 `PreToolUse`, SessionStart, SessionEnd hooks와 shell wrapper가 포함됩니다. 설치 전 [`hooks/hooks.json`](../../../../plugins/commit-commands/hooks/hooks.json)과 [`scripts/`](../../../../plugins/commit-commands/scripts/)를 검토하세요.

## 요구 사항과 업데이트

Claude Code plugin/hook, Node.js, Git, Bash가 필요합니다. `/commit-push-pr`에는 `gh`도 필요합니다. Windows에서는 Claude Code의 Git Bash를 사용합니다.

```bash
claude plugin marketplace update zaunekko
claude plugin update commit-commands@zaunekko --scope user
```

업데이트 후 `/reload-plugins`를 실행하세요.

## 자세한 정보

- [문제 해결](../../../../docs/troubleshooting.md)
- [구현과 테스트](../../../../plugins/commit-commands/README.md)
- [업스트림 출처](../../../../plugins/commit-commands/UPSTREAM.md)
- [Apache License 2.0](../../../../plugins/commit-commands/LICENSE)
