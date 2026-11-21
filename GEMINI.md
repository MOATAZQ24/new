# GEMINI.md — Instructions for Gemini CLI & Google AI Agents

## Project
**Investor Gate OS (IGOS)** — Enterprise IT Operations Management Platform.

## Mandatory Developer Attribution & Provenance (IGOS-DAPF)
- **Original Developer:** Moataz Qasem (2026)
- **Framework:** IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
- **Status:** Binding Governance Policy

### Agent Directives:
1. **Preserve Attribution:** Moataz Qasem must remain attributed as the Original Developer in all metadata (`AUTHORS.md`, `PROVENANCE.json`, `COPYRIGHT.md`, `NOTICE`) and first-party source headers.
2. **Refactoring Continuity:** Header preservation is mandatory during refactoring, re-architecting, optimization, and code migration.
3. **New Files:** All newly created first-party `.py`, `.ts`, `.tsx`, `.js`, `.ps1`, `.sh`, and `.sql` source files must prepend the standardized IGOS-DAPF header.
4. **Validation:** Run `python scripts/verify_attribution.py` to ensure attribution integrity before claiming completion.
5. **No Malicious Enforcement:** Enforce governance through transparent build, test, and CI checks without runtime interference.
