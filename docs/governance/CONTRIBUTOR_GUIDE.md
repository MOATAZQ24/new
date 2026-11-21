# IGOS-DAPF Contributor & Developer Onboarding Guide

**Framework:** IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)  
**Original Developer:** Moataz Qasem (2026)  

---

## 1. Welcome Contributors
Investor Gate OS encourages collaborative development, code contributions, bug fixes, and feature enhancements.

---

## 2. Mandatory Contributor Workflow

### Step 1: Clone & Configure Git Hooks
Upon cloning the repository, configure the local Git hooks:
```bash
python scripts/governance/install_git_hooks.py
```
This activates automated pre-commit and pre-push verification.

### Step 2: Creating New First-Party Code
When adding new `.py`, `.ts`, `.tsx`, `.js`, `.sql`, `.sh`, or `.ps1` files:
- Prepend the standardized IGOS-DAPF attribution header.
- Alternatively, run the automated header applicator:
  ```bash
  python scripts/governance/apply_attribution.py
  ```

### Step 3: Contributor Registration
When submitting significant code changes, register yourself in `CONTRIBUTORS.md`:
- Add your name or handle, role, year, and contribution summary under `## Contributing Developers & Engineering Teams`.
- Do **not** modify or delete historical developer records in `AUTHORS.md` or `PROVENANCE.json`.

### Step 4: Verification Before Commit
Run the governance audit suite:
```bash
python scripts/governance/audit_governance.py
```
Ensure all 5 audit layers pass with exit code 0.
