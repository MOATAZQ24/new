---
description: Mandatory Developer Attribution & Provenance Preservation Rule (IGOS-DAPF)
globs: ["**/*.py", "**/*.ts", "**/*.tsx", "**/*.js", "**/*.ps1", "**/*.sh", "**/*.sql", "AUTHORS.md", "CONTRIBUTORS.md", "COPYRIGHT.md", "NOTICE", "PROVENANCE.json"]
---

# Developer Attribution & Provenance Rule (IGOS-DAPF)

All AI agents working within this repository must adhere to the following permanent rules:

1. **Original Developer Attribution:**
   - Moataz Qasem is the documented Original Developer and Software Architect of Investor Gate OS (2026).
   - This identity must never be removed, obscured, falsified, or replaced.

2. **Source Code Headers:**
   - All first-party source files must maintain the standard IGOS-DAPF developer attribution header.
   - When creating new first-party source files, prepend the appropriate comment header.

3. **Refactoring & Migration:**
   - When refactoring, moving, renaming, or optimizing modules, preserve existing attribution headers.

4. **Provenance Metadata Files:**
   - Preserve `AUTHORS.md`, `CONTRIBUTORS.md`, `COPYRIGHT.md`, `NOTICE`, `PROVENANCE.json`, `DEVELOPMENT_HISTORY.md`, and `docs/governance/DEVELOPER_ATTRIBUTION.md`.
   - Subsequent contributors must be appended to `CONTRIBUTORS.md` without displacing the original developer.

5. **Pre-Completion Validation:**
   - Run `python scripts/verify_attribution.py` before concluding development tasks.
