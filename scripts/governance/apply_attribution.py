#!/usr/bin/env python3
# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""
IGOS-DAPF Automated Attribution Header Applicator.
Applies standardized developer attribution headers idempotently across all
eligible first-party source files according to .governance/policy.json.
"""

import os
import sys
import json
import fnmatch
import argparse
from pathlib import Path
from typing import Dict, Any, Tuple, List

ROOT = Path(__file__).resolve().parents[2]
POLICY_PATH = ROOT / ".governance" / "policy.json"


def load_policy() -> Dict[str, Any]:
    if not POLICY_PATH.is_file():
        raise FileNotFoundError(f"Policy file missing at {POLICY_PATH}")
    with open(POLICY_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def is_already_attributed(content: str) -> bool:
    """Checks whether the file already carries Moataz Qasem attribution."""
    return ("Moataz Qasem" in content) and ("Original Developer" in content or "IGOS-DAPF" in content)


def apply_header_to_content(content: str, ext: str, policy: Dict[str, Any]) -> Tuple[str, bool]:
    """Applies the appropriate attribution header to the given content if not already attributed."""
    if is_already_attributed(content):
        return content, False

    header_policies = policy.get("header_policies", {})
    lines = content.splitlines(keepends=True)

    # 1. Python, Bash, PowerShell
    if ext in {".py", ".sh", ".bash", ".ps1"}:
        policy_key = "python" if ext == ".py" else ("bash" if ext in {".sh", ".bash"} else "powershell")
        header_template = header_policies.get(policy_key, {}).get("header_template", "")
        if not header_template:
            header_template = (
                "# ==============================================================================\n"
                "# Investor Gate OS (IGOS) - Technical Operations Platform\n"
                "# Original Developer: Moataz Qasem (2026)\n"
                "# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)\n"
                "# =============================================================================="
            )

        insert_idx = 0
        while insert_idx < len(lines):
            line = lines[insert_idx].strip()
            if line.startswith("#!") or "coding:" in line or "-*- coding" in line:
                insert_idx += 1
            else:
                break

        header_block = header_template.strip() + "\n\n"
        new_lines = lines[:insert_idx] + [header_block] + lines[insert_idx:]
        return "".join(new_lines), True

    # 2. TypeScript, JavaScript, TSX, JSX
    elif ext in {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}:
        header_template = header_policies.get("typescript_javascript", {}).get("header_template", "")
        if not header_template:
            header_template = (
                "/**\n"
                " * ==============================================================================\n"
                " * Investor Gate OS (IGOS) - Technical Operations Platform\n"
                " * Original Developer: Moataz Qasem (2026)\n"
                " * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)\n"
                " * ==============================================================================\n"
                " */"
            )

        insert_idx = 0
        while insert_idx < len(lines):
            line = lines[insert_idx].strip()
            if line in {'"use client";', "'use client';", '"use server";', "'use server';"} or line.startswith("//"):
                insert_idx += 1
            else:
                break

        header_block = header_template.strip() + "\n\n"
        new_lines = lines[:insert_idx] + [header_block] + lines[insert_idx:]
        return "".join(new_lines), True

    # 3. SQL
    elif ext == ".sql":
        header_template = header_policies.get("sql", {}).get("header_template", "")
        if not header_template:
            header_template = (
                "-- =============================================================================\n"
                "-- Investor Gate OS (IGOS) - Technical Operations Platform\n"
                "-- Original Developer: Moataz Qasem (2026)\n"
                "-- Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)\n"
                "-- ============================================================================="
            )
        header_block = header_template.strip() + "\n\n"
        return header_block + content, True

    # 4. CSS / SCSS
    elif ext in {".css", ".scss"}:
        header_template = header_policies.get("css", {}).get("header_template", "")
        if not header_template:
            header_template = (
                "/**\n"
                " * Project: Investor Gate OS (IGOS)\n"
                " * Original Developer: Moataz Qasem\n"
                " * Initial Development Year: 2026\n"
                " * Attribution: See AUTHORS.md and NOTICE.\n"
                " */"
            )
        header_block = header_template.strip() + "\n\n"
        return header_block + content, True

    # 5. Dockerfile
    elif ext == "" and Path(content).name.lower().startswith("dockerfile"):
        header_template = (
            "# ==============================================================================\n"
            "# Investor Gate OS (IGOS) - Technical Operations Platform\n"
            "# Original Developer: Moataz Qasem (2026)\n"
            "# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)\n"
            "# =============================================================================="
        )
        return header_template + "\n\n" + content, True

    return content, False


def scan_and_apply(dry_run: bool = False, verbose: bool = False) -> Dict[str, Any]:
    policy = load_policy()
    exclusions = policy.get("exclusions", {})
    ex_dirs = set(exclusions.get("directories", []))
    ex_files = set(exclusions.get("files", []))
    ex_exts = set(exclusions.get("extensions", []))
    ex_patterns = exclusions.get("filename_patterns", [])

    supported_extensions = {".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".sql", ".sh", ".bash", ".ps1", ".css", ".scss"}

    modified: List[str] = []
    already_attributed: List[str] = []
    skipped_excluded: List[str] = []
    failed: List[Dict[str, str]] = []

    for root_dir, dirs, files in os.walk(ROOT):
        # Prune excluded directories
        dirs[:] = [d for d in dirs if d not in ex_dirs and not any((Path(root_dir) / d).relative_to(ROOT).as_posix().startswith(ex.replace('\\', '/')) for ex in ex_dirs)]

        for file in files:
            file_path = Path(root_dir) / file
            rel_path = file_path.relative_to(ROOT).as_posix()

            if file in ex_files or file_path.suffix.lower() in ex_exts or any(fnmatch.fnmatch(file, pat) for pat in ex_patterns):
                skipped_excluded.append(rel_path)
                continue

            ext = file_path.suffix.lower()
            if ext not in supported_extensions and file.lower() != "dockerfile":
                skipped_excluded.append(rel_path)
                continue

            try:
                content = file_path.read_text(encoding="utf-8")
            except Exception as e:
                failed.append({"file": rel_path, "error": str(e)})
                continue

            new_content, applied = apply_header_to_content(content, ext, policy)

            if applied:
                if not dry_run:
                    file_path.write_text(new_content, encoding="utf-8")
                modified.append(rel_path)
                if verbose:
                    print(f"[{'DRY-RUN' if dry_run else 'APPLIED'}] {rel_path}")
            else:
                already_attributed.append(rel_path)

    stats = {
        "dry_run": dry_run,
        "modified_count": len(modified),
        "already_attributed_count": len(already_attributed),
        "skipped_excluded_count": len(skipped_excluded),
        "failed_count": len(failed),
        "modified_files": modified,
        "failed_files": failed,
    }
    return stats


def main():
    parser = argparse.ArgumentParser(description="IGOS-DAPF Attribution Header Applicator")
    parser.add_argument("--dry-run", action="store_true", help="Simulate without modifying files")
    parser.add_argument("--verbose", "-v", action="store_true", help="Print modified files")
    parser.add_argument("--json", action="store_true", help="Output JSON report")
    args = parser.parse_args()

    stats = scan_and_apply(dry_run=args.dry_run, verbose=args.verbose)

    if args.json:
        print(json.dumps(stats, indent=2))
    else:
        print("=" * 70)
        print("IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)")
        print("Header Application Summary")
        print("=" * 70)
        print(f"Mode: {'DRY RUN' if stats['dry_run'] else 'LIVE APPLICATION'}")
        print(f"Modified Files:           {stats['modified_count']}")
        print(f"Already Attributed Files: {stats['already_attributed_count']}")
        print(f"Excluded / Skipped Files: {stats['skipped_excluded_count']}")
        print(f"Failed Files:             {stats['failed_count']}")
        print("=" * 70)

    if stats["failed_count"] > 0:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
