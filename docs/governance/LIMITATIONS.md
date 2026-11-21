# IGOS Governance Limitations & Operational Boundaries

**Document ID:** IGOS-DAPF-DOC-006  
**Original Developer:** Moataz Qasem (2026)  
**Framework:** IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)  

---

## 1. Technical & Administrative Boundaries

### 1.1 Root / Repository Owner Authority
No software-level repository mechanism can irrevocably prevent an administrator with unrestricted repository deletion or force-push permissions from deleting files. IGOS-DAPF is engineered around:
- **Verifiable Provenance**
- **Cryptographic Tamper Detection**
- **Public Historical Auditability**
- **Automated Rejection in Pull Requests & Local Commits**

### 1.2 Upstream Third-Party Code
Third-party dependencies in `node_modules/` or `backend/.venv/` remain subject to their respective open-source licenses and are excluded from IGOS-DAPF header injection to prevent third-party license violations.

### 1.3 Recommended Remote GitHub Settings
For full defense-in-depth on remote GitHub hosting, an administrator should configure:
1. **Protected Branches:** Require pull request reviews and status checks (`validate-attribution`) on `main`.
2. **CODEOWNERS Enforcement:** Enable "Require review from Code Owners".
3. **Signed Commits:** Require GPG-signed commits for release tags.
4. **Prevent History Rewriting:** Block force pushes to `main` and release branches.
