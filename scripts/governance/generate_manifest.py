#!/usr/bin/env python3
# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""
IGOS-DAPF Integrity Manifest Generator.
Calculates deterministic SHA-256 cryptographic hashes for all protected
governance records defined in .governance/protected-files.json and writes
.governance/integrity-manifest.json, validated against its JSON schema.
"""

import os
import sys
import json
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any

ROOT = Path(__file__).resolve().parents[2]
PROTECTED_FILES_PATH = ROOT / ".governance" / "protected-files.json"
MANIFEST_PATH = ROOT / ".governance" / "integrity-manifest.json"
SCHEMA_PATH = ROOT / ".governance" / "schema" / "integrity-manifest.schema.json"


def compute_normalized_sha256(file_path: Path) -> tuple[str, int]:
    """Computes SHA-256 hash, normalizing line endings for text files to ensure cross-platform determinism."""
    raw = file_path.read_bytes()
    try:
        text = raw.decode("utf-8")
        normalized = text.replace("\r\n", "\n").encode("utf-8")
        h = hashlib.sha256(normalized).hexdigest()
        return h, len(normalized)
    except UnicodeDecodeError:
        h = hashlib.sha256(raw).hexdigest()
        return h, len(raw)


def generate_manifest() -> Dict[str, Any]:
    if not PROTECTED_FILES_PATH.is_file():
        raise FileNotFoundError(f"Missing {PROTECTED_FILES_PATH}")

    with open(PROTECTED_FILES_PATH, "r", encoding="utf-8") as f:
        protected_config = json.load(f)

    file_entries: Dict[str, Any] = {}
    missing_files = []

    for item in protected_config.get("protected_files", []):
        rel_path = item["path"]
        abs_path = ROOT / rel_path

        if not abs_path.is_file():
            missing_files.append(rel_path)
            continue

        sha256_hash, size = compute_normalized_sha256(abs_path)
        file_entries[rel_path] = {
            "sha256": sha256_hash,
            "size_bytes": size,
            "description": item.get("description", ""),
        }

    if missing_files:
        print(f"[!] Warning: Missing protected files: {missing_files}")

    manifest_data = {
        "framework": "IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)",
        "algorithm": "SHA-256",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "project": "Investor Gate OS (IGOS)",
        "file_count": len(file_entries),
        "files": file_entries,
        "verification_policy": {
            "tamper_detection": "STRICT_CRYPTO_HASH",
            "enforcement": "FAIL_CLOSED_CI_GATE",
        },
    }

    # Validate against schema if jsonschema is available
    if SCHEMA_PATH.is_file():
        try:
            import jsonschema
            with open(SCHEMA_PATH, "r", encoding="utf-8") as sf:
                schema = json.load(sf)
            jsonschema.validate(instance=manifest_data, schema=schema)
            print("[✓] Integrity manifest schema validation passed.")
        except ImportError:
            print("[i] jsonschema not installed, skipping schema validation.")
        except Exception as e:
            raise ValueError(f"Manifest failed schema validation: {e}")

    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest_data, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"[✓] Successfully generated {MANIFEST_PATH} with {len(file_entries)} protected files.")
    return manifest_data


if __name__ == "__main__":
    generate_manifest()
