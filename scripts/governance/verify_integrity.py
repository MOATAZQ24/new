#!/usr/bin/env python3
# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""
IGOS-DAPF Cryptographic Integrity & Tamper Detection Verifier.
Independently verifies SHA-256 checksums of all protected governance
records against .governance/integrity-manifest.json to detect unauthorized tampering.
"""

import os
import sys
import json
import hashlib
import argparse
from pathlib import Path
from typing import Dict, Any, List

ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = ROOT / ".governance" / "integrity-manifest.json"
PROTECTED_FILES_PATH = ROOT / ".governance" / "protected-files.json"


def compute_normalized_sha256(file_path: Path) -> str:
    raw = file_path.read_bytes()
    try:
        text = raw.decode("utf-8")
        normalized = text.replace("\r\n", "\n").encode("utf-8")
        return hashlib.sha256(normalized).hexdigest()
    except UnicodeDecodeError:
        return hashlib.sha256(raw).hexdigest()


def verify_integrity(verbose: bool = False) -> Dict[str, Any]:
    if not MANIFEST_PATH.is_file():
        return {
            "valid": False,
            "error": f"Integrity manifest missing at {MANIFEST_PATH}",
            "verified_count": 0,
            "tampered_count": 0,
            "missing_count": 0,
            "results": [],
        }

    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    files_map = manifest.get("files", {})
    results: List[Dict[str, Any]] = []
    tampered: List[str] = []
    missing: List[str] = []
    verified: List[str] = []

    for rel_path, meta in files_map.items():
        abs_path = ROOT / rel_path
        expected_hash = meta["sha256"]

        if not abs_path.is_file():
            missing.append(rel_path)
            results.append({
                "file": rel_path,
                "status": "MISSING",
                "expected_sha256": expected_hash,
                "actual_sha256": None,
            })
            continue

        actual_hash = compute_normalized_sha256(abs_path)
        if actual_hash == expected_hash:
            verified.append(rel_path)
            results.append({
                "file": rel_path,
                "status": "VERIFIED",
                "sha256": actual_hash,
            })
        else:
            tampered.append(rel_path)
            results.append({
                "file": rel_path,
                "status": "TAMPERED",
                "expected_sha256": expected_hash,
                "actual_sha256": actual_hash,
            })
            if verbose:
                print(f"[!] TAMPER DETECTED: {rel_path}")
                print(f"    Expected: {expected_hash}")
                print(f"    Actual:   {actual_hash}")

    is_intact = (len(tampered) == 0 and len(missing) == 0 and len(verified) > 0)

    return {
        "valid": is_intact,
        "algorithm": manifest.get("algorithm", "SHA-256"),
        "generated_at": manifest.get("generated_at"),
        "total_protected_files": len(files_map),
        "verified_count": len(verified),
        "tampered_count": len(tampered),
        "missing_count": len(missing),
        "results": results,
    }


def main():
    parser = argparse.ArgumentParser(description="IGOS-DAPF Tamper Detection Verifier")
    parser.add_argument("--json", action="store_true", help="Output JSON results")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose details")
    args = parser.parse_args()

    report = verify_integrity(verbose=args.verbose)

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print("=" * 70)
        print("IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)")
        print("Cryptographic Integrity & Tamper Verification Report")
        print("=" * 70)
        print(f"Status:            {'PASSED (All Protected Records Intact)' if report['valid'] else 'FAILED (Tampering or Missing Files Detected)'}")
        print(f"Algorithm:         {report.get('algorithm', 'SHA-256')}")
        print(f"Protected Files:   {report.get('total_protected_files', 0)}")
        print(f"Verified Intact:   {report['verified_count']}")
        print(f"Tampered Files:    {report['tampered_count']}")
        print(f"Missing Files:     {report['missing_count']}")
        print("=" * 70)

        if not report["valid"]:
            print("\nANOMALY DETAILS:")
            for r in report["results"]:
                if r["status"] != "VERIFIED":
                    print(f"  [{r['status']}] {r['file']}")
                    if r.get("expected_sha256") and r.get("actual_sha256"):
                        print(f"      Expected SHA-256: {r['expected_sha256']}")
                        print(f"      Actual SHA-256:   {r['actual_sha256']}")
            print("\nRemediation:")
            print("  Review Git diff for unauthorized modifications to protected governance records.")
            print("  If changes were formally authorized, run 'python scripts/governance/generate_manifest.py'.")
            print("=" * 70)

    if not report["valid"]:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
