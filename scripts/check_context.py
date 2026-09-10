#!/usr/bin/env python3
"""Deterministic checks that the shared project context is well-formed.

Run locally (`python3 scripts/check_context.py`), in CI, and from the Claude Code
PreToolUse hook before a PR is created, readied or merged. Semantic agreement
between code and docs cannot be automated; that is the Context Sync Protocol
(docs/process/context-sync.md). This script only catches the mechanical drift.

Exit 0 when clean (warnings allowed), 1 when any check fails. No dependencies
beyond the standard library; Python 3.9+.
"""
from __future__ import annotations

import datetime as dt
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)

REQUIRED_FILES = [
    "README.md",
    "AGENTS.md",
    "CLAUDE.md",
    "STATUS.md",
    "CONTRIBUTING.md",
    "docs/architecture.md",
    "docs/process/context-sync.md",
    "docs/decisions/README.md",
    "docs/decisions/adr-template.md",
    "docs/hackathon/README.md",
    "docs/plans/README.md",
    "docs/plans/plan-template.md",
    "docs/process/phases.md",
    ".github/pull_request_template.md",
]

AGENTS_MAX_BYTES = 32 * 1024  # Codex default project_doc_max_bytes
CLAUDE_MAX_LINES = 200        # Claude Code guidance
STATUS_WARN_LINES = 100
STATUS_WARN_DAYS = int(os.environ.get("CONTEXT_CHECK_STATUS_WARN_DAYS", "7"))
STATUS_FAIL_DAYS = int(os.environ.get("CONTEXT_CHECK_STATUS_FAIL_DAYS", "14"))

failures: list[str] = []
warnings: list[str] = []


def fail(msg: str) -> None:
    failures.append(msg)


def warn(msg: str) -> None:
    warnings.append(msg)


def tracked_files() -> list[str]:
    try:
        out = subprocess.run(
            ["git", "ls-files", "--cached", "--others", "--exclude-standard"],
            capture_output=True, text=True, check=True,
        ).stdout
        return [line for line in out.splitlines() if line]
    except (subprocess.CalledProcessError, FileNotFoundError):
        skip = {".git", "node_modules", ".venv", "venv", "dist", "build", ".next"}
        result = []
        for path in ROOT.rglob("*"):
            if any(part in skip for part in path.parts):
                continue
            if path.is_file():
                result.append(str(path.relative_to(ROOT)))
        return result


def check_required_files() -> None:
    for rel in REQUIRED_FILES:
        if not Path(rel).is_file():
            fail(f"missing required file: {rel}")


def check_claude_imports_agents() -> None:
    text = Path("CLAUDE.md").read_text(encoding="utf-8") if Path("CLAUDE.md").is_file() else ""
    if not re.search(r"^@AGENTS\.md\s*$", text, re.MULTILINE):
        fail("CLAUDE.md must import AGENTS.md with a line containing exactly '@AGENTS.md'")
    lines = text.count("\n") + (1 if text and not text.endswith("\n") else 0)
    if lines > CLAUDE_MAX_LINES:
        fail(f"CLAUDE.md has {lines} lines; keep it under {CLAUDE_MAX_LINES} (put shared content in AGENTS.md)")


def check_sizes() -> None:
    agents = Path("AGENTS.md")
    if agents.is_file():
        size = agents.stat().st_size
        if size > AGENTS_MAX_BYTES:
            fail(f"AGENTS.md is {size} bytes; must stay under {AGENTS_MAX_BYTES} (Codex reads at most that by default)")
        elif size > AGENTS_MAX_BYTES * 0.75:
            warn(f"AGENTS.md is {size} bytes; approaching the {AGENTS_MAX_BYTES} byte limit. Move detail into linked docs.")
    status = Path("STATUS.md")
    if status.is_file():
        n = len(status.read_text(encoding="utf-8").splitlines())
        if n > STATUS_WARN_LINES:
            warn(f"STATUS.md has {n} lines; it is a snapshot of now, prune completed items (target < {STATUS_WARN_LINES})")


def check_status_date() -> None:
    path = Path("STATUS.md")
    if not path.is_file():
        return
    text = path.read_text(encoding="utf-8")
    if not re.search(r"^Current phase:\s*Phase\s+[0-5]\b", text, re.MULTILINE):
        fail("STATUS.md needs a line 'Current phase: Phase N, <name>' (see docs/process/phases.md)")
    m = re.search(r"^Last updated:\s*(\d{4}-\d{2}-\d{2})", text, re.MULTILINE)
    if not m:
        fail("STATUS.md needs a line 'Last updated: YYYY-MM-DD'")
        return
    try:
        updated = dt.date.fromisoformat(m.group(1))
    except ValueError:
        fail(f"STATUS.md 'Last updated' is not a valid ISO date: {m.group(1)}")
        return
    age = (dt.date.today() - updated).days
    if age > STATUS_FAIL_DAYS:
        fail(f"STATUS.md was last updated {age} days ago (limit {STATUS_FAIL_DAYS}); confirm it still describes now and bump the date")
    elif age > STATUS_WARN_DAYS:
        warn(f"STATUS.md was last updated {age} days ago; verify it is still accurate")


LINK_RE = re.compile(r"(?<!\!)\[[^\]]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")


def check_markdown_links(md_files: list[str]) -> None:
    for rel in md_files:
        path = Path(rel)
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        # drop fenced code blocks so example links are not checked
        text = re.sub(r"```.*?```", "", text, flags=re.DOTALL)
        for target in LINK_RE.findall(text):
            if re.match(r"^[a-z][a-z0-9+.-]*:", target) or target.startswith("#"):
                continue  # URL scheme (http, mailto) or in-page anchor
            target = target.split("#", 1)[0]
            if not target:
                continue
            resolved = (path.parent / target).resolve() if not target.startswith("/") else (ROOT / target.lstrip("/")).resolve()
            if not resolved.exists():
                fail(f"{rel}: broken relative link -> {target}")


ADR_RE = re.compile(r"^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$")


def check_adrs() -> None:
    folder = Path("docs/decisions")
    if not folder.is_dir():
        return
    index_path = folder / "README.md"
    index = index_path.read_text(encoding="utf-8") if index_path.is_file() else ""
    seen: dict[str, str] = {}
    for path in sorted(folder.glob("*.md")):
        name = path.name
        if name in ("README.md", "adr-template.md"):
            continue
        m = ADR_RE.match(name)
        if not m:
            fail(f"docs/decisions/{name}: ADR filenames must be NNNN-title-with-dashes.md")
            continue
        num = m.group(1)
        if num in seen:
            fail(f"docs/decisions: duplicate ADR number {num} ({seen[num]} and {name}); renumber the newer one")
        seen[num] = name
        text = path.read_text(encoding="utf-8")
        sm = re.search(r"^status:\s*(.+)$", text, re.MULTILINE)
        if not sm:
            fail(f"docs/decisions/{name}: missing 'status:' in front matter")
        elif not re.match(r"^(proposed|accepted|rejected|deprecated|superseded by ADR-\d{4})\s*$", sm.group(1).strip()):
            fail(f"docs/decisions/{name}: status '{sm.group(1).strip()}' is not proposed | accepted | rejected | deprecated | superseded by ADR-NNNN")
        if name not in index:
            fail(f"docs/decisions/{name} is not listed in docs/decisions/README.md index")


SECRET_NAME_RE = re.compile(r"(^|/)(\.env(\.[^/]+)?|[^/]*\.(pem|key|p12|pfx|jks|keystore))$")


def check_no_secret_files(files: list[str]) -> None:
    for rel in files:
        if SECRET_NAME_RE.search(rel) and not rel.endswith(".example") and not rel.endswith(".env.example"):
            fail(f"secret-looking file is tracked or untracked-but-unignored: {rel}")


def main() -> int:
    files = tracked_files()
    md_files = [f for f in files if f.endswith(".md") and Path(f).is_file()]

    check_required_files()
    check_claude_imports_agents()
    check_sizes()
    check_status_date()
    check_markdown_links(md_files)
    check_adrs()
    check_no_secret_files(files)

    for w in warnings:
        print(f"WARN  {w}")
    for f in failures:
        print(f"FAIL  {f}")
    if failures:
        print(f"\ncheck_context: {len(failures)} failure(s), {len(warnings)} warning(s)")
        return 1
    print(f"check_context: OK ({len(md_files)} markdown files checked, {len(warnings)} warning(s))")
    return 0


if __name__ == "__main__":
    sys.exit(main())
