#!/usr/bin/env python3
# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================
"""
Investor Gate OS - Protected Metadata Manifest Generator
Computes SHA-256 hashes of core governance and provenance documents
and generates docs/governance/protected_manifest.json.
"""

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

PROTECTED_FILES = [
    "AUTHORS.md",
    "CONTRIBUTORS.md",
    "COPYRIGHT.md",
    "NOTICE",
    "PROVENANCE.json",
    "DEVELOPMENT_HISTORY.md",
    "docs/governance/DEVELOPER_ATTRIBUTION.md",
    "docs/governance/AI_AGENT_GOVERNANCE.md",
    "docs/governance/attribution_policy.json",
    "scripts/verify_attribution.py",
]

def hash_file(path: Path) -> str:
    h = hashlib.sha256()
    # Normalize CRLF/LF line endings for cross-platform hash stability
    content = path.read_bytes().replace(b"\r\n", b"\n")
    h.update(content)
    return h.hexdigest()

def main():
    manifest = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "description": "SHA-256 Protected Manifest for IGOS-DAPF Provenance Records",
        "hash_algorithm": "SHA-256 (LF-normalized)",
        "original_developer": "Moataz Qasem",
        "files": {},
    }

    print("[*] Generating SHA-256 hashes for protected provenance files...")
    for rel_path in PROTECTED_FILES:
        target = ROOT / rel_path
        if not target.exists():
            print(f"[!] Warning: Missing protected file: {rel_path}")
            continue
        sha = hash_file(target)
        manifest["files"][rel_path] = sha
        print(f"    - {rel_path}: {sha}")

    out_file = ROOT / "docs" / "governance" / "protected_manifest.json"
    out_file.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"\n[+] Manifest written to: {out_file}")

if __name__ == "__main__":
    main()
