# IGOS Developer Attribution & Provenance Framework (.governance)

This directory hosts the centralized, machine-readable developer attribution registry, schema definitions, and policy configuration for **Investor Gate OS (IGOS)** under the **IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)**.

## Architecture

```text
.governance/
├── attribution.json           # Canonical developer attribution registry
├── policy.json                # Header rules, exclusions, and AI governance policies
├── protected-files.json       # Inventory of protected provenance records
├── integrity-manifest.json    # Cryptographic SHA-256 integrity manifest
├── schema/
│   ├── attribution.schema.json
│   ├── policy.schema.json
│   └── integrity-manifest.schema.json
└── README.md                  # This specification document
```

## Core Governance Directives

1. **Original Developer Attribution:**
   - **Original Developer:** Moataz Qasem
   - **Initial Development Year:** 2026
   - **Status:** Permanent historical provenance record.

2. **Attribution vs. Copyright Ownership:**
   - Developer attribution recognizes historical authorship and provenance.
   - It is legally distinct from commercial copyright ownership, intellectual property assignments, or licensing arrangements.

3. **Protection & Validation:**
   - Integrity of all files listed in `protected-files.json` is protected by SHA-256 manifests.
   - Automated scripts in `scripts/governance/` enforce compliance in pre-commit hooks and CI/CD pipelines.
