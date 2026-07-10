#!/usr/bin/env bash
set -euo pipefail

umask 077

script_dir="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
plugin_root="${CLAUDE_PLUGIN_ROOT:-$(CDPATH= cd -- "${script_dir}/.." && pwd)}"
node_command="${CLAUDE_COMMIT_COMMANDS_NODE:-node}"
temporary_root="${TMPDIR:-/tmp}"
message_file="$(mktemp "${temporary_root%/}/claude-commit-message.XXXXXX")"

cleanup() {
  rm -f -- "$message_file"
}
trap cleanup EXIT HUP INT TERM

cat > "$message_file"

"$node_command" "${plugin_root}/scripts/render-commit-attribution.mjs" "$message_file"

printf '%s\n' 'Final commit message:'
printf '%s\n' '---------------------'
cat -- "$message_file"
printf '\n%s\n' '---------------------'

set +e
git commit -F "$message_file" "$@"
commit_status=$?
set -e

exit "$commit_status"
