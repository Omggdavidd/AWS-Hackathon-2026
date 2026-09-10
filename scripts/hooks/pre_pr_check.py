#!/usr/bin/env python3
"""Claude Code PreToolUse hook for Bash.

If the command about to run creates, readies or merges a pull request with `gh`,
run scripts/check_context.py first. Exit 2 blocks the command and shows the
reason to Claude; exit 0 lets it through. Any other command is ignored.
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

try:
    payload = json.load(sys.stdin)
except (json.JSONDecodeError, ValueError):
    sys.exit(0)

command = (payload.get("tool_input") or {}).get("command", "")
if not re.search(r"\bgh\s+pr\s+(create|ready|merge)\b", command):
    sys.exit(0)

root = Path(os.environ.get("CLAUDE_PROJECT_DIR") or Path(__file__).resolve().parents[2])
result = subprocess.run(
    [sys.executable, str(root / "scripts" / "check_context.py")],
    capture_output=True, text=True,
)
if result.returncode != 0:
    sys.stderr.write(
        "Blocked: the context check failed. Fix these before creating, readying or merging the PR "
        "(see docs/process/context-sync.md):\n" + result.stdout + result.stderr
    )
    sys.exit(2)
sys.exit(0)
