# Developer Attribution & Provenance Policy — Investor Gate OS (IGOS)

**Document ID:** IGOS-DAPF-POL-001  
**Framework:** IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)  
**Original Developer:** Moataz Qasem  
**Initial Development Year:** 2026  
**Status:** Mandatory Repository Policy  

---

## 1. Purpose & Scope
This policy establishes unambiguous rules for recognizing and preserving developer attribution, architectural provenance, and intellectual lineage throughout the lifecycle of the **Investor Gate OS (IGOS)** project.

This policy applies to:
- All first-party source code in the repository (Frontend, Backend, Database schemas, Scripts, Infrastructure, and Documentation).
- All human engineers, contractors, code reviewers, and maintainers.
- All AI development agents (Google Antigravity, Claude Code, OpenAI Codex, Cursor, GitHub Copilot, Gemini CLI, etc.).

---

## 2. Fundamental Attribution Principles

### Principle 1: Original Developer Recognition
**Moataz Qasem** is documented as the original developer and lead architect who designed and created Investor Gate OS in 2026. This recognition is a permanent historical fact and must never be removed, obscured, falsified, or replaced.

### Principle 2: Preservation During Refactoring & Migration
Attribution must survive all software evolution events, including:
- Code refactoring, optimization, and cleanup.
- File restructuring, renaming, moving, and directory reorganizations.
- Component replacement or rewrite.
- Framework migrations or language version upgrades.
- AI-assisted architectural enhancements.

### Principle 3: Inclusive Contributor Recognition
Subsequent developers, security researchers, and engineers who contribute to Investor Gate OS are recorded in `CONTRIBUTORS.md` and given appropriate author credit on their respective contributions without deleting the original developer attribution.

### Principle 4: Legal & Institutional Alignment
This framework preserves technical and moral provenance. It does not disrupt legitimate commercial ownership, institutional employment contracts, or open-source licensing agreements.

---

## 3. Standardized Header Specifications

All eligible first-party source files must contain the standard attribution header:

### Python (`.py`):
```python
# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================
```

### TypeScript / TSX / JavaScript (`.ts`, `.tsx`, `.js`):
```typescript
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */
```

### Shell & PowerShell (`.sh`, `.ps1`):
```powershell
# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================
```

### SQL (`.sql`):
```sql
-- =============================================================================
-- Investor Gate OS (IGOS) - Technical Operations Platform
-- Original Developer: Moataz Qasem (2026)
-- Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
-- =============================================================================
```

---

## 4. Exclusion Criteria
The following files and directories are explicitly excluded from mandatory header insertion:
1. Third-party vendor dependencies (`node_modules/`, `backend/.venv/`).
2. Build outputs and generated bundles (`.next/`, `dist/`, `build/`, `.lan-runtime/`).
3. Binary, font, and image files (`.png`, `.jpg`, `.ico`, `.woff2`, `.db`, etc.).
4. Package lockfiles and generated configuration artifacts (`package-lock.json`).
5. Upstream third-party licenses and schemas.
