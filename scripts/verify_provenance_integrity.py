#!/usr/bin/env python3
# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================
"""
Investor Gate OS - Provenance Integrity Validator
Verifies SHA-256 hashes of core governance, provenance, and attribution files
against docs/governance/protected_manifest.json.
"""

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST_PATH = ROOT / "docs" / "governance" / "protected_manifest.json"

def hash_file(path: Path) -> str:
    h = hashlib.sha256()
    # Normalize CRLF/LF line endings for cross-platform stability
    content = path.read_bytes().replace(b"\r\n", b"\n")
    h.update(content)
    return h.hexdigest()

def main():
    print(f"[*] Validating Provenance & Governance Integrity against: {MANIFEST_PATH.name}")
    if not MANIFEST_PATH.exists():
        print(f"[!] FAILED: Protected manifest {MANIFEST_PATH} not found.")
        sys.exit(1)

    try:
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"[!] FAILED: Could not parse manifest JSON: {e}")
        sys.exit(1)

    files_map = manifest.get("files", {})
    mismatches = []
    missing_files = []

    for rel_path, expected_hash in files_map.items():
        target = ROOT / rel_path
        if not target.exists():
            missing_files.append(rel_path)
            continue

        actual_hash = hash_file(target)
        if actual_hash != expected_hash:
            mismatches.append((rel_path, expected_hash, actual_hash))

    if missing_files:
        print(f"[!] FAILED: {len(missing_files)} protected file(s) are missing:")
        for f in missing_files:
            print(f"    - {f}")

    if mismatches:
        print(f"[!] FAILED: {len(mismatches)} protected file(s) have unexpected integrity hash modifications:")
        for path, exp, act in mismatches:
            print(f"    - {path}\n        Expected: {exp}\n        Actual:   {act}")

    if missing_files or mismatches:
        print("\n[!] PROVENANCE INTEGRITY VERIFICATION FAILED.")
        print("[*] If this was an authorized governance update, regenerate the manifest with:")
        print("    python scripts/generate_protected_manifest.py")
        sys.exit(1)

    print(f"[+] PROVENANCE INTEGRITY VERIFIED: All {len(files_map)} protected governance files match valid SHA-256 hashes.")
    sys.exit(0)

if __name__ == "__main__":
    main()
