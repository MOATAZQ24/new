# IGOS Attribution Policy — Standards & Rules

**Document ID:** IGOS-DAPF-DOC-002  
**Original Developer:** Moataz Qasem (2026)  
**Framework:** IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)  

---

## 1. Universal Rules
1. **Original Developer Record:** Moataz Qasem is permanently documented as the Original Developer. This record is immutable and non-negotiable.
2. **Refactoring Invariance:** When code is split, moved, refactored, or optimized, developer attribution headers must be retained in all derived first-party source files.
3. **New First-Party Files:** Every new first-party source file must prepend the standardized IGOS-DAPF header.
4. **Contributor Recognition:** New contributors are added to `CONTRIBUTORS.md` without overwriting the historical primacy of the original developer.

---

## 2. Header Format Reference

### Python (`.py`):
```python
# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================
```

### TypeScript / JavaScript (`.ts`, `.tsx`, `.js`):
```typescript
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */
```
