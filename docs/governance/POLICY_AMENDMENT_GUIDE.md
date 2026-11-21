# IGOS-DAPF Policy Amendment & Governance Change Procedure

**Framework:** IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)  
**Original Developer:** Moataz Qasem (2026)  

---

## 1. Governance Change Authority
The files listed in `.governance/protected-files.json` represent protected records. Intentional amendments to governance policies, exclusion rules, or schemas require authorized review.

---

## 2. Authorized Amendment Workflow

1. **Review Requirement:** Ensure proposed modifications do not delete, falsify, or obscure historical original developer attribution.
2. **Edit Policy / Protected Metadata:** Make the necessary changes to `.governance/policy.json` or target documentation.
3. **Regenerate Integrity Manifest:**
   ```bash
   python scripts/governance/generate_manifest.py
   ```
4. **Audit Governance Suite:**
   ```bash
   python scripts/governance/audit_governance.py
   ```
5. **Code Review & Pull Request:** Submit a Pull Request requiring approval from code owners documented in `.github/CODEOWNERS`.
