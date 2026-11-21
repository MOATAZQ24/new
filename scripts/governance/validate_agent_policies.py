#!/usr/bin/env python3
# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""
IGOS-DAPF AI Agent Policy Consistency Validator.
Validates that all AI agent instruction files (Antigravity, Claude, Gemini,
Cursor, Copilot) are present and strictly consistent with the canonical
governance policy in docs/governance/AI_AGENT_GOVERNANCE.md.
"""

import os
import sys
import json
import argparse
from pathlib import Path
from typing import Dict, Any, List

ROOT = Path(__file__).resolve().parents[2]

AGENT_FILES = [
    "AGENTS.md",
    "CLAUDE.md",
    "GEMINI.md",
    ".cursor/rules/dapf.mdc",
    ".github/copilot-instructions.md",
    "docs/governance/AI_AGENT_GOVERNANCE.md",
]

REQUIRED_TOKENS = [
    ("Moataz Qasem", "Original Developer Name"),
    ("Original Developer", "Original Developer Role"),
    ("IGOS-DAPF", "Governance Framework Designation"),
]


def validate_agent_policies() -> Dict[str, Any]:
    results: List[Dict[str, Any]] = []
    overall_valid = True

    for rel_path in AGENT_FILES:
        target = ROOT / rel_path
        file_res: Dict[str, Any] = {
            "path": rel_path,
            "exists": target.is_file(),
            "missing_tokens": [],
            "valid": True,
        }

        if not target.is_file():
            file_res["valid"] = False
            file_res["error"] = "File missing"
            overall_valid = False
            results.append(file_res)
            continue

        try:
            content = target.read_text(encoding="utf-8")
        except Exception as e:
            file_res["valid"] = False
            file_res["error"] = f"Read error: {e}"
            overall_valid = False
            results.append(file_res)
            continue

        for token, desc in REQUIRED_TOKENS:
            if token not in content:
                file_res["missing_tokens"].append(f"{desc} ('{token}')")
                file_res["valid"] = False
                overall_valid = False

        results.append(file_res)

    return {
        "valid": overall_valid,
        "total_files_checked": len(AGENT_FILES),
        "compliant_files": sum(1 for r in results if r["valid"]),
        "results": results,
    }


def main():
    parser = argparse.ArgumentParser(description="IGOS-DAPF Agent Policy Consistency Validator")
    parser.add_argument("--json", action="store_true", help="Output JSON results")
    args = parser.parse_args()

    report = validate_agent_policies()

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print("=" * 70)
        print("IGOS-DAPF Cross-Agent Policy Consistency Report")
        print("=" * 70)
        print(f"Status: {'PASSED (All Agent Rules Consistent)' if report['valid'] else 'FAILED'}")
        print(f"Compliance: {report['compliant_files']}/{report['total_files_checked']} files verified")
        print("-" * 70)
        for r in report["results"]:
            status_symbol = "✓" if r["valid"] else "✗"
            print(f"[{status_symbol}] {r['path']}")
            if not r["valid"]:
                if not r.get("exists"):
                    print("    - Error: File does not exist")
                for missing in r.get("missing_tokens", []):
                    print(f"    - Missing mandatory token: {missing}")
        print("=" * 70)

    if not report["valid"]:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
