# IGOS-DAPF Provenance Architecture & Trust Model

**Framework:** IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)  
**Original Developer:** Moataz Qasem (2026)  
**Document ID:** IGOS-DAPF-ARCH-001  

---

## 1. Architectural Foundations
The Investor Gate OS Developer Attribution & Provenance Framework establishes a multi-layered trust model:

```
+--------------------------------------------------------------------------+
| Layer 1: Canonical Machine-Readable Registry                             |
| (.governance/attribution.json, policy.json, protected-files.json)        |
+------------------------------------+-------------------------------------+
                                     |
                                     v
+--------------------------------------------------------------------------+
| Layer 2: Source Code Attribution Policy Engine                           |
| (Idempotent comment injection across Python, TS, TSX, JS, CSS, SQL, Shell)|
+------------------------------------+-------------------------------------+
                                     |
                                     v
+--------------------------------------------------------------------------+
| Layer 3: Cross-Agent Governance Directives                              |
| (Universal 15 mandates across Antigravity, Claude, Gemini, Cursor, Copilot)|
+------------------------------------+-------------------------------------+
                                     |
                                     v
+--------------------------------------------------------------------------+
| Layer 4: Cryptographic SHA-256 Manifest & Tamper Detection               |
| (.governance/integrity-manifest.json, verify_integrity.py)               |
+------------------------------------+-------------------------------------+
                                     |
                                     v
+--------------------------------------------------------------------------+
| Layer 5: Git & CI/CD Automated Quality Gates                             |
| (.githooks/pre-commit, .githooks/pre-push, GitHub Actions, CODEOWNERS)   |
+--------------------------------------------------------------------------+
```

---

## 2. Cryptographic Integrity Model
All protected governance assets are inventoried in `.governance/protected-files.json`.
- The manifest generator (`generate_manifest.py`) computes normalized SHA-256 digests.
- Normalization ensures line-ending conversions (`\r\n` vs `\n`) between Windows and Linux do not cause false-positive alerts.
- The verifier (`verify_integrity.py`) executes during pre-commit, pre-push, and CI/CD status checks.

---

## 3. Decoupling Authorship from Legal Ownership
IGOS-DAPF explicitly decouples:
1. **Technical Authorship (Original Developer):** A permanent historical fact attributing Moataz Qasem as the software architect and creator in 2026.
2. **Commercial Ownership & Copyright:** Governed by enterprise contracts, institutional agreements, and software licenses as documented in `COPYRIGHT.md` and `NOTICE`.
