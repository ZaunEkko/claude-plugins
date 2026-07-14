#!/usr/bin/env python3

import json
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit

try:
    import yaml
except ModuleNotFoundError as error:
    raise SystemExit("PyYAML 6.0.3 is required: python -m pip install PyYAML==6.0.3") from error


ROOT = Path(__file__).resolve().parent.parent
TEXT_SUFFIXES = {".json", ".md", ".mjs", ".py", ".sh", ".yaml", ".yml"}
TRANSLATION_READMES = (
    ROOT / "README.md",
    ROOT / "i18n/en/README.md",
    ROOT / "i18n/zh-TW/README.md",
    ROOT / "i18n/ja/README.md",
    ROOT / "i18n/ko/README.md",
)
MARKDOWN_LINK = re.compile(r"!?\[[^\]]*\]\(([^)]+)\)")
REFERENCE_LINK = re.compile(r"^\s*\[[^\]]+\]:\s*(\S+)", re.MULTILINE)
HTML_LINK = re.compile(r"(?:href|src)=[\"']([^\"']+)[\"']", re.IGNORECASE)
FENCE = re.compile(r"^\s*(`{3,}|~{3,})")


def repository_paths():
    result = subprocess.run(
        ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        cwd=ROOT,
        check=True,
        stdout=subprocess.PIPE,
    )
    return tuple(
        ROOT / Path(raw.decode("utf-8", "surrogateescape"))
        for raw in result.stdout.split(b"\0")
        if raw
    )


def markdown_targets(markdown):
    visible_lines = []
    active_fence = None
    for line in markdown.splitlines():
        fence = FENCE.match(line)
        if fence:
            marker = fence.group(1)[0]
            if active_fence is None:
                active_fence = marker
            elif active_fence == marker:
                active_fence = None
            continue
        if active_fence is None:
            visible_lines.append(line)

    visible = "\n".join(visible_lines)
    targets = [match.group(1).strip() for match in MARKDOWN_LINK.finditer(visible)]
    targets.extend(match.group(1).strip() for match in REFERENCE_LINK.finditer(visible))
    targets.extend(match.group(1).strip() for match in HTML_LINK.finditer(visible))
    return targets


def local_target(source, raw_target):
    target = raw_target.strip()
    if target.startswith("<") and target.endswith(">"):
        target = target[1:-1].strip()
    elif " " in target:
        target = target.split(None, 1)[0]

    if not target or target.startswith("#"):
        return None

    parsed = urlsplit(target)
    if parsed.scheme or parsed.netloc:
        return None

    decoded = unquote(parsed.path)
    if not decoded:
        return None

    if decoded.startswith("/"):
        return ROOT / decoded.lstrip("/")
    return source.parent / decoded


def check_json_and_yaml(paths, errors):
    for path in paths:
        try:
            if path.suffix == ".json":
                json.loads(path.read_text(encoding="utf-8"))
            elif path.suffix in {".yaml", ".yml"}:
                yaml.safe_load(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError, yaml.YAMLError) as error:
            errors.append(f"{path.relative_to(ROOT)}: parse failure: {error}")


def check_lf_policy(paths, errors):
    tracked_result = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=ROOT,
        check=True,
        stdout=subprocess.PIPE,
    )
    tracked = {
        raw.decode("utf-8", "surrogateescape")
        for raw in tracked_result.stdout.split(b"\0")
        if raw
    }

    for path in paths:
        if path.suffix not in TEXT_SUFFIXES:
            continue
        relative = path.relative_to(ROOT).as_posix()
        attribute = subprocess.run(
            ["git", "check-attr", "-z", "eol", "--", relative],
            cwd=ROOT,
            check=True,
            stdout=subprocess.PIPE,
        ).stdout.split(b"\0")
        value = attribute[2].decode("utf-8", "replace") if len(attribute) >= 3 else ""
        if value != "lf":
            errors.append(f"{relative}: expected Git attribute eol=lf, found {value!r}")

        if relative not in tracked:
            continue
        record = subprocess.run(
            ["git", "ls-files", "--eol", "-z", "--", relative],
            cwd=ROOT,
            check=True,
            stdout=subprocess.PIPE,
        ).stdout.decode("utf-8", "surrogateescape")
        metadata = record.split("\t", 1)[0]
        index_eol = metadata.split()[0] if metadata.split() else ""
        if index_eol != "i/lf":
            errors.append(f"{relative}: expected canonical index LF, found {index_eol!r}")


def check_markdown_links(paths, errors):
    navigation_targets = {path.resolve() for path in TRANSLATION_READMES}
    for path in paths:
        if path.suffix != ".md":
            continue
        try:
            markdown = path.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as error:
            errors.append(f"{path.relative_to(ROOT)}: cannot read Markdown: {error}")
            continue

        resolved_targets = set()
        for raw_target in markdown_targets(markdown):
            target = local_target(path, raw_target)
            if target is None:
                continue
            resolved = target.resolve()
            resolved_targets.add(resolved)
            if not target.exists():
                errors.append(
                    f"{path.relative_to(ROOT)}: missing relative link target {raw_target!r}"
                )

        if path.resolve() in navigation_targets:
            missing = navigation_targets - resolved_targets
            for target in sorted(missing):
                errors.append(
                    f"{path.relative_to(ROOT)}: language navigation does not link to "
                    f"{target.relative_to(ROOT)}"
                )


def check_executable_modes(errors):
    required = ("plugins/commit-commands/scripts/commit-with-dynamic-attribution.sh",)
    for relative in required:
        result = subprocess.run(
            ["git", "ls-files", "-s", "--", relative],
            cwd=ROOT,
            check=True,
            text=True,
            stdout=subprocess.PIPE,
        )
        fields = result.stdout.split()
        if not fields or fields[0] != "100755":
            errors.append(f"{relative}: expected tracked executable mode 100755")


def main():
    paths = repository_paths()
    errors = []
    check_json_and_yaml(paths, errors)
    check_lf_policy(paths, errors)
    check_markdown_links(paths, errors)
    check_executable_modes(errors)

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        print(f"Repository validation failed with {len(errors)} error(s).", file=sys.stderr)
        return 1

    print(
        f"Validated {len(paths)} repository files: JSON/YAML syntax, LF policy, "
        "Markdown relative links, translation navigation, and executable modes."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
