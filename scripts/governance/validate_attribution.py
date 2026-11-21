#!/usr/bin/env python3
# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""
IGOS-DAPF Automated Attribution Integrity Validator.
Scans the repository to verify that 100% of eligible first-party source files
contain valid developer attribution attributing Moataz Qasem as Original Developer.
Detects missing headers, unauthorized modifications, identity alterations, and ungoverned files.
"""

import os
import sys
import json
import fnmatch
import argparse
import subprocess
from pathlib import Path
from typing import Dict, Any, List

ROOT = Path(__file__).resolve().parents[2]
POLICY_PATH = ROOT / ".governance" / "policy.json"


def load_policy() -> Dict[str, Any]:
    if not POLICY_PATH.is_file():
        raise FileNotFoundError(f"Policy file missing at {POLICY_PATH}")
    with open(POLICY_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def get_git_changed_files() -> List[str]:
    """Gets list of changed files relative to HEAD or staging."""
    try:
        cmd = ["git", "status", "--porcelain"]
        res = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True, check=True)
        changed = []
        for line in res.stdout.splitlines():
            if len(line) > 3:
                changed.append(line[3:].strip())
        return changed
    except Exception:
        return []


def validate_file(file_path: Path) -> Dict[str, Any]:
    """Validates that a single file complies with attribution requirements."""
    try:
        rel_path = file_path.relative_to(ROOT).as_posix()
    except ValueError:
        rel_path = file_path.as_posix()

    try:
        content = file_path.read_text(encoding="utf-8")
    except Exception as e:
        return {"file": rel_path, "status": "ERROR", "reason": f"Read error: {e}"}

    has_moataz = "Moataz Qasem" in content
    has_role = "Original Developer" in content or "IGOS-DAPF" in content or "AUTHORS.md" in content

    if has_moataz and has_role:
        return {"file": rel_path, "status": "COMPLIANT", "reason": "Valid attribution"}
    elif has_moataz and not has_role:
        return {"file": rel_path, "status": "VIOLATION", "reason": "Mentions Moataz Qasem but lacks Original Developer or IGOS-DAPF role"}
    elif not has_moataz and ("Original Developer" in content or "IGOS-DAPF" in content):
        return {"file": rel_path, "status": "TAMPERED", "reason": "Original Developer identity altered or replaced"}
    else:
        return {"file": rel_path, "status": "MISSING", "reason": "Missing developer attribution header"}


def run_attribution_validation(changed_only: bool = False, verbose: bool = False) -> Dict[str, Any]:
    policy = load_policy()
    exclusions = policy.get("exclusions", {})
    ex_dirs = set(exclusions.get("directories", []))
    ex_files = set(exclusions.get("files", []))
    ex_exts = set(exclusions.get("extensions", []))
    ex_patterns = exclusions.get("filename_patterns", [])

    supported_extensions = {".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".sql", ".sh", ".bash", ".ps1", ".css", ".scss"}

    target_files: List[Path] = []

    if changed_only:
        git_changed = get_git_changed_files()
        for c in git_changed:
            p = ROOT / c
            if p.is_file():
                target_files.append(p)
    else:
        for root_dir, dirs, files in os.walk(ROOT):
            dirs[:] = [d for d in dirs if d not in ex_dirs and not any((Path(root_dir) / d).relative_to(ROOT).as_posix().startswith(ex.replace('\\', '/')) for ex in ex_dirs)]
            for f in files:
                target_files.append(Path(root_dir) / f)

    total_scanned = len(target_files)
    eligible_files: List[Path] = []
    excluded_count = 0

    for file_path in target_files:
        rel_path = file_path.relative_to(ROOT).as_posix()
        fname = file_path.name
        ext = file_path.suffix.lower()

        if fname in ex_files or ext in ex_exts or any(fnmatch.fnmatch(fname, pat) for pat in ex_patterns):
            excluded_count += 1
            continue

        if ext not in supported_extensions and fname.lower() != "dockerfile":
            excluded_count += 1
            continue

        eligible_files.append(file_path)

    compliant_files: List[str] = []
    violations: List[Dict[str, Any]] = []

    for file_path in eligible_files:
        res = validate_file(file_path)
        if res["status"] == "COMPLIANT":
            compliant_files.append(res["file"])
        else:
            violations.append(res)
            if verbose:
                print(f"[!] {res['status']}: {res['file']} -> {res['reason']}")

    total_eligible = len(eligible_files)
    coverage_pct = (len(compliant_files) / total_eligible * 100.0) if total_eligible > 0 else 100.0
    passed = len(violations) == 0

    return {
        "valid": passed,
        "mode": "CHANGED_ONLY" if changed_only else "FULL_REPOSITORY",
        "total_scanned": total_scanned,
        "excluded_count": excluded_count,
        "eligible_count": total_eligible,
        "compliant_count": len(compliant_files),
        "violations_count": len(violations),
        "coverage_percentage": round(coverage_pct, 2),
        "violations": violations,
    }


def main():
    parser = argparse.ArgumentParser(description="IGOS-DAPF Attribution Integrity Validator")
    parser.add_argument("--changed-only", action="store_true", help="Scan only git-changed files")
    parser.add_argument("--verbose", "-v", action="store_true", help="Print details of violations")
    parser.add_argument("--json", action="store_true", help="Output results in JSON format")
    args = parser.parse_args()

    report = run_attribution_validation(changed_only=args.changed_only, verbose=args.verbose)

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print("=" * 70)
        print("IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)")
        print("Source Code Attribution Integrity Report")
        print("=" * 70)
        print(f"Status:               {'PASSED (100% Compliant)' if report['valid'] else 'FAILED (Violations Found)'}")
        print(f"Scope:                {report['mode']}")
        print(f"Total Scanned Files:  {report['total_scanned']}")
        print(f"Excluded Files:       {report['excluded_count']}")
        print(f"Eligible Code Files:  {report['eligible_count']}")
        print(f"Compliant Code Files: {report['compliant_count']}")
        print(f"Attribution Violations: {report['violations_count']}")
        print(f"Coverage Percentage:  {report['coverage_percentage']}%")
        print("=" * 70)

        if report["violations"]:
            print("\nVIOLATION DETAILS:")
            for v in report["violations"]:
                print(f"  [{v['status']}] {v['file']}: {v['reason']}")
            print("\nRemediation:")
            print("  Run 'python scripts/governance/apply_attribution.py' to apply required headers.")
            print("=" * 70)

    if not report["valid"]:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
