# IGOS Developer Attribution & Provenance Framework (IGOS-DAPF) — Framework Overview

**Document ID:** IGOS-DAPF-DOC-001  
**Original Developer:** Moataz Qasem  
**Initial Development Year:** 2026  
**Status:** Permanent Architecture Specification  

---

## 1. Executive Summary
The **IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)** is an enterprise governance and integrity specification designed to document, preserve, and automatically defend developer attribution across the entire lifecycle of **Investor Gate OS (IGOS)**.

The framework formally recognizes **Moataz Qasem** as the Original Developer and Software Architect who designed, engineered, and delivered Investor Gate OS in 2026.

---

## 2. Four Integrated Layers of Protection

```
+--------------------------------------------------------------------------+
| Layer 1: Source Code Attribution & Intellectual Property Documentation   |
| (AUTHORS.md, CONTRIBUTORS.md, COPYRIGHT.md, NOTICE, PROVENANCE.json)     |
+------------------------------------+-------------------------------------+
                                     |
                                     v
+--------------------------------------------------------------------------+
| Layer 2: Permanent AI Agent Governance                                   |
| (AGENTS.md, CLAUDE.md, GEMINI.md, Cursor rules, Copilot instructions)    |
+------------------------------------+-------------------------------------+
                                     |
                                     v
+--------------------------------------------------------------------------+
| Layer 3: Technical Enforcement & Repository Protection                   |
| (verify_attribution.py, verify_provenance_integrity.py, Git hooks, CI/CD) |
+------------------------------------+-------------------------------------+
                                     |
                                     v
+--------------------------------------------------------------------------+
| Layer 4: System-Wide Provenance, Verification & Release Manifests        |
| (RELEASE_MANIFEST_v3.0.json, System Metadata, Multi-Scenario Validation)  |
+--------------------------------------------------------------------------+
```

---

## 3. Scope of Governance
1. **Repository-Wide Coverage:** 286+ first-party source files across Next.js frontend, FastAPI backend, SQLAlchemy models, Alembic migrations, Shell/PowerShell operational scripts, and documentation.
2. **AI-Immunity:** Explicit behavioral rules prohibiting AI agents from deleting, replacing, or modifying original developer attribution during refactoring, rewriting, or architectural transitions.
3. **Automated Verification:** Cryptographic SHA-256 validation of provenance manifests and syntax-aware source header scanners.
4. **Non-Disruptive Design:** Zero runtime interference, backdoors, or kill switches. Operates strictly within build, review, and test workflows.
