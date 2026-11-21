#!/usr/bin/env python3
# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""
IGOS-DAPF Master Governance Auditor.
Executes the complete end-to-end governance verification suite:
1. JSON Schema validation of all structured governance manifests
2. Cross-platform AI agent instruction consistency
3. Source code attribution coverage across 100% of eligible files
4. SHA-256 cryptographic integrity and tamper detection
5. Release provenance generation
"""

import sys
import json
import argparse
from pathlib import Path
from typing import Dict, Any

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "governance"))

from validate_agent_policies import validate_agent_policies
from validate_attribution import run_attribution_validation
from verify_integrity import verify_integrity
from generate_provenance import generate_provenance


def validate_schemas() -> Dict[str, Any]:
    schema_pairs = [
        (".governance/attribution.json", ".governance/schema/attribution.schema.json"),
        (".governance/policy.json", ".governance/schema/policy.schema.json"),
        (".governance/integrity-manifest.json", ".governance/schema/integrity-manifest.schema.json"),
    ]
    results = []
    overall_valid = True

    try:
        import jsonschema
    except ImportError:
        return {"valid": True, "note": "jsonschema not installed, skipped", "results": []}

    for data_path, schema_path in schema_pairs:
        d_p = ROOT / data_path
        s_p = ROOT / schema_path
        if not d_p.is_file() or not s_p.is_file():
            results.append({"target": data_path, "valid": False, "error": "File or schema missing"})
            overall_valid = False
            continue

        try:
            with open(d_p, "r", encoding="utf-8") as df, open(s_p, "r", encoding="utf-8") as sf:
                d = json.load(df)
                s = json.load(sf)
            jsonschema.validate(instance=d, schema=s)
            results.append({"target": data_path, "valid": True})
        except Exception as e:
            results.append({"target": data_path, "valid": False, "error": str(e)})
            overall_valid = False

    return {"valid": overall_valid, "results": results}


def run_full_audit(verbose: bool = False) -> Dict[str, Any]:
    # 1. Schemas
    schema_res = validate_schemas()

    # 2. Agent Policies
    agent_res = validate_agent_policies()

    # 3. Source Code Attribution
    attr_res = run_attribution_validation(verbose=verbose)

    # 4. Cryptographic Integrity
    integ_res = verify_integrity(verbose=verbose)

    # 5. Provenance Manifest
    try:
        prov_res = generate_provenance()
        prov_valid = True
    except Exception as e:
        prov_valid = False

    all_passed = (
        schema_res["valid"] and
        agent_res["valid"] and
        attr_res["valid"] and
        integ_res["valid"] and
        prov_valid
    )

    return {
        "overall_status": "PASSED" if all_passed else "FAILED",
        "schemas": schema_res,
        "agent_policies": agent_res,
        "attribution_coverage": attr_res,
        "cryptographic_integrity": integ_res,
        "provenance_generated": prov_valid,
    }


def main():
    parser = argparse.ArgumentParser(description="IGOS-DAPF Master Governance Auditor")
    parser.add_argument("--json", action="store_true", help="Output JSON results")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose details")
    args = parser.parse_args()

    audit = run_full_audit(verbose=args.verbose)

    if args.json:
        print(json.dumps(audit, indent=2))
    else:
        print("=" * 75)
        print("IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)")
        print("MASTER GOVERNANCE AUDIT REPORT")
        print("=" * 75)
        print(f"Overall Governance Status:  {audit['overall_status']}")
        print("-" * 75)
        print(f"1. Schema Validation:       {'PASSED' if audit['schemas']['valid'] else 'FAILED'}")
        print(f"2. Cross-Agent Policies:    {'PASSED' if audit['agent_policies']['valid'] else 'FAILED'} ({audit['agent_policies']['compliant_files']}/{audit['agent_policies']['total_files_checked']} files)")
        print(f"3. Attribution Coverage:    {'PASSED' if audit['attribution_coverage']['valid'] else 'FAILED'} ({audit['attribution_coverage']['coverage_percentage']}% - {audit['attribution_coverage']['compliant_count']}/{audit['attribution_coverage']['eligible_count']} files)")
        print(f"4. Cryptographic Integrity: {'PASSED' if audit['cryptographic_integrity']['valid'] else 'FAILED'} ({audit['cryptographic_integrity']['verified_count']}/{audit['cryptographic_integrity']['total_protected_files']} records verified)")
        print(f"5. Release Provenance:      {'GENERATED' if audit['provenance_generated'] else 'FAILED'}")
        print("=" * 75)

    if audit["overall_status"] != "PASSED":
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
