#!/usr/bin/env python3
# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================
"""
Investor Gate OS - Attribution Integrity Validator
Scans all eligible first-party source files to verify presence of required
IGOS-DAPF attribution headers naming Moataz Qasem as Original Developer.
"""

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

EXCLUDE_DIRS = {
    ".git",
    "node_modules",
    ".venv",
    ".next",
    ".lan-runtime",
    "playwright-report",
    "test-results",
    "dist",
    "build",
    "__pycache__",
    "scratch",
    "uploads",
    "nginx",
}

EXCLUDE_FILES = {
    "package-lock.json",
    ".env",
    ".env.example",
    "apply_attribution_headers.py",
}

EXCLUDE_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".ico", ".svg", ".woff", ".woff2", ".ttf", ".eot",
    ".db", ".sqlite", ".sqlite3", ".pyc", ".lock", ".log", ".backup_phase0", ".bak",
    ".json", ".md", ".txt", ".yml", ".yaml", ".map", ".html"
}

ELIGIBLE_EXTENSIONS = {".py", ".ts", ".tsx", ".js", ".ps1", ".sh", ".sql"}

REQUIRED_TOKENS = ["Moataz Qasem", "IGOS-DAPF"]

def verify_file(file_path: Path):
    try:
        content = file_path.read_text(encoding="utf-8", errors="ignore")
    except Exception as e:
        return False, f"Could not read file: {e}"

    # Check for required tokens
    missing = [token for token in REQUIRED_TOKENS if token not in content]
    if missing:
        return False, f"Missing required attribution tokens: {', '.join(missing)}"
    return True, "valid"

def main():
    print(f"[*] Validating IGOS-DAPF Developer Attribution across: {ROOT}")
    violations = []
    scanned_count = 0

    for root_dir, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]

        for file in files:
            p = Path(root_dir) / file
            if file in EXCLUDE_FILES or p.suffix.lower() in EXCLUDE_EXTENSIONS:
                continue

            if p.suffix.lower() in ELIGIBLE_EXTENSIONS:
                scanned_count += 1
                valid, reason = verify_file(p)
                if not valid:
                    rel_path = p.relative_to(ROOT).as_posix()
                    violations.append((rel_path, reason))

    print(f"[*] Scanned {scanned_count} eligible first-party source files.")

    if violations:
        print(f"\n[!] ATTRIBUTION VALIDATION FAILED: {len(violations)} file(s) violate IGOS-DAPF:")
        for path, reason in violations[:20]:
            print(f"    - {path}: {reason}")
        if len(violations) > 20:
            print(f"    ... and {len(violations) - 20} more.")
        sys.exit(1)
    else:
        print(f"[+] ATTRIBUTION VALIDATION PASSED: All {scanned_count} files contain verified headers for Moataz Qasem.")
        sys.exit(0)

if __name__ == "__main__":
    main()
