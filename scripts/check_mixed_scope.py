#!/usr/bin/env python3
"""Fail-close guard for mixed process-infrastructure + delivery change sets."""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from typing import Iterable

PROCESS_PREFIXES = (
    ".skills/",
    ".skills\\",
    ".architecture/",
    ".architecture\\",
    ".worklog/",
    ".worklog\\",
    ".github/",
    ".github\\",
    "scripts/",
    "scripts\\",
)

PROCESS_FILES = {
    ".skills",
    ".architecture",
    ".worklog",
    "AGENTS.md",
    "CONTRIBUTING.md",
    "scripts/check_mixed_scope.py",
}

OVERRIDE_ENV = "ALLOW_MIXED_SCOPE"


def run_git(args: Iterable[str]) -> str:
    result = subprocess.run(
        ["git", *args],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or f"git {' '.join(args)} failed")
    return result.stdout.strip()


def changed_files(base_ref: str, head_ref: str) -> list[str]:
    diff = run_git(["diff", "--name-only", f"{base_ref}...{head_ref}"])
    if not diff:
        return []
    return [line.strip() for line in diff.splitlines() if line.strip()]


def is_process_path(path: str) -> bool:
    normalized = path.replace("\\", "/")
    if normalized in PROCESS_FILES:
        return True
    return any(normalized.startswith(prefix.replace("\\", "/")) for prefix in PROCESS_PREFIXES)


def main() -> int:
    parser = argparse.ArgumentParser(description="Fail when process + delivery scopes are mixed.")
    parser.add_argument("--base-ref", required=True, help="Base git ref/SHA")
    parser.add_argument("--head-ref", default="HEAD", help="Head git ref/SHA")
    args = parser.parse_args()

    if os.getenv(OVERRIDE_ENV, "").strip().lower() in {"1", "true", "yes"}:
        print(f"[WARN] Mixed-scope guard overridden via {OVERRIDE_ENV}.")
        return 0

    if set(args.base_ref.strip()) == {"0"}:
        print("[WARN] Base ref is all zeros; skipping mixed-scope guard for initial push event.")
        return 0

    try:
        files = changed_files(args.base_ref, args.head_ref)
    except RuntimeError as exc:
        print(f"[ERROR] Unable to compute changed files: {exc}")
        return 1

    if not files:
        print("[OK] No changed files detected for scope guard.")
        return 0

    process_files = [f for f in files if is_process_path(f)]
    delivery_files = [f for f in files if not is_process_path(f)]

    if process_files and delivery_files:
        print("[ERROR] Mixed-scope change set detected (fail-close).")
        print("Process-infrastructure files:")
        for path in process_files[:20]:
            print(f"- {path}")
        if len(process_files) > 20:
            print(f"- ... (+{len(process_files) - 20} more)")
        print("Delivery-scope files:")
        for path in delivery_files[:20]:
            print(f"- {path}")
        if len(delivery_files) > 20:
            print(f"- ... (+{len(delivery_files) - 20} more)")
        print(
            "Route process maintenance through a dedicated maintenance lane/correlation "
            "per .skills/.contracts/execution-boundary-contract.md."
        )
        return 1

    if process_files:
        print(
            "[OK] Process-infrastructure-only change set detected "
            "(no mixed delivery scope)."
        )
        return 0

    print("[OK] Delivery-only change set detected (no process-infrastructure scope).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
