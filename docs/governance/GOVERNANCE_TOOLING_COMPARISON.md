# IGOS-DAPF — Governance Tooling Comparative Audit & Consolidation Strategy

**Project:** Investor Gate OS (IGOS)  
**Original Developer:** Moataz Qasem (2026)  
**Attribution Framework:** IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)  
**Date:** 2026-11-22  

---

## 1. Executive Summary

During the repository engineering audit, two parallel sets of governance validation scripts were identified:
- **Root Tooling:** Located in `scripts/` (`verify_attribution.py`, `verify_provenance_integrity.py`, `apply_attribution_headers.py`, `generate_protected_manifest.py`).
- **Namespaced Tooling:** Located in `scripts/governance/` (`validate_attribution.py`, `verify_integrity.py`, `apply_attribution.py`, `audit_governance.py`, `validate_agent_policies.py`).

In accordance with controlled engineering remediation rules, both implementations were audited for cryptographic integrity, manifest references, CI consumers, and developer attribution governance.

---

## 2. Comparative Analysis

| Dimension | `scripts/` (Root Suite) | `scripts/governance/` (Subdir Suite) |
| :--- | :--- | :--- |
| **Primary Entrypoints** | `verify_attribution.py`<br>`verify_provenance_integrity.py` | `validate_attribution.py`<br>`verify_integrity.py` |
| **Manifest Target** | `docs/governance/protected_manifest.json` | `docs/governance/provenance_manifest.json` |
| **Cryptographic Hash Model** | SHA-256 (LF-normalized, 10 core files) | SHA-256 (Full directory scan, 14 files) |
| **CI / Workflow Consumer** | `.github/workflows/attribution-integrity.yml` | Indirect |
| **Pre-Commit Hook Consumer**| Referenced in manual guides | `.githooks/pre-commit` |
| **Agent Directives** | Mandatory in `AGENTS.md` & `GEMINI.md` | Policy documentation references |
| **Protected Manifest Status** | Included inside `protected_manifest.json` | Standalone records |

---

## 3. Findings & Safety Determination

1. **Active Consumers:**
   - The root script `scripts/verify_attribution.py` is the **authoritative binding requirement** for AI agents (AGENTS.md Rule 7, GEMINI.md directive 4) and GitHub Actions CI.
   - The namespaced script `scripts/governance/validate_attribution.py` is actively invoked by `.githooks/pre-commit`.
2. **Attribution Integrity:** Both suites enforce Moataz Qasem as the Original Developer (2026) under IGOS-DAPF.
3. **Preservation Policy:** Neither implementation should be deleted or renamed during this remediation phase to prevent breaking active Git pre-commit hooks or CI workflows.
4. **Canonical Direction:**
   - For agent validation: `python scripts/verify_attribution.py`.
   - For pre-commit hooks: `.githooks/pre-commit` continues utilizing `scripts/governance/`.
   - Long-term unification: Symlink or delegate `scripts/governance/validate_attribution.py` to `scripts/verify_attribution.py` in a planned maintenance release after release consolidation.
