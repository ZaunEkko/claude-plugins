#!/usr/bin/env bash
set -euo pipefail

umask 077

script_dir="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
plugin_root="${CLAUDE_PLUGIN_ROOT:-$(CDPATH= cd -- "${script_dir}/.." && pwd)}"
node_command="${CLAUDE_COMMIT_COMMANDS_NODE:-node}"
temporary_root="${TMPDIR:-/tmp}"
explicit_state_file=""
explicit_state_file_set=0
git_arguments=()

while (( $# > 0 )); do
  case "$1" in
    --)
      git_arguments+=("$@")
      break
      ;;
    --claude-state-file)
      if (( explicit_state_file_set != 0 || $# < 2 )) || [[ -z "$2" ]]; then
        printf '%s\n' 'commit-commands: --claude-state-file requires exactly one non-empty path' >&2
        exit 2
      fi
      explicit_state_file="$2"
      explicit_state_file_set=1
      shift 2
      ;;
    --claude-state-file=*)
      if (( explicit_state_file_set != 0 )); then
        printf '%s\n' 'commit-commands: --claude-state-file may only be provided once' >&2
        exit 2
      fi
      explicit_state_file="${1#*=}"
      if [[ -z "$explicit_state_file" ]]; then
        printf '%s\n' 'commit-commands: --claude-state-file requires a non-empty path' >&2
        exit 2
      fi
      explicit_state_file_set=1
      shift
      ;;
    *)
      git_arguments+=("$1")
      shift
      ;;
  esac
done

message_file="$(mktemp "${temporary_root%/}/claude-commit-message.XXXXXX")"

cleanup() {
  rm -f -- "$message_file"
}
trap cleanup EXIT HUP INT TERM

cat > "$message_file"

renderer_arguments=("$message_file")
if (( explicit_state_file_set != 0 )); then
  renderer_arguments+=(--state-file "$explicit_state_file")
fi
"$node_command" "${plugin_root}/scripts/render-commit-attribution.mjs" "${renderer_arguments[@]}"

printf '%s\n' 'Final commit message:'
printf '%s\n' '---------------------'
cat -- "$message_file"
printf '\n%s\n' '---------------------'

set +e
git commit -F "$message_file" "${git_arguments[@]}"
commit_status=$?
set -e

exit "$commit_status"
