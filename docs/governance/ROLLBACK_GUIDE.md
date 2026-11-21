# IGOS-DAPF Rollback & Emergency Recovery Guide

**Framework:** IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)  
**Original Developer:** Moataz Qasem (2026)  

---

## 1. Rollback Overview
Because IGOS-DAPF is completely transparent, non-intrusive, and non-destructive (implemented solely via static headers, documentation, Git hooks, and CI gates), rolling back governance changes carries zero risk to application databases, runtime sessions, or operational business logic.

---

## 2. Emergency Override & Rollback Options

### Option A: Temporary Bypass of Local Git Hooks (Emergency Hotfix)
If a critical production hotfix must be committed without running local governance validation:
```bash
git commit --no-verify -m "hotfix: critical patch"
```
*(Note: CI/CD status checks will still validate the pull request remotely).*

### Option B: Disabling Local Git Hooks
To revert local Git configuration back to default hooks:
```bash
git config --unset core.hooksPath
```

### Option C: Complete Framework Reversion
To revert the governance branch:
```bash
git checkout main
```
The codebase remains fully operational without any runtime degradation.
