# IGOS-DAPF Release Verification & Supply Chain Provenance Guide

**Framework:** IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)  
**Original Developer:** Moataz Qasem (2026)  

---

## 1. Release Verification Objectives
Ensures that all production deployment artifacts, Docker images, and release packages carry verifiable software provenance and developer attribution.

---

## 2. Release Steps

1. **Verify Full System Test Pass:**
   ```bash
   backend\.venv\Scripts\python.exe backend/tests/run_all_tests.py
   cmd /c "cd frontend && npx tsc --noEmit"
   ```
2. **Execute Full Adversarial Suite:**
   ```bash
   backend\.venv\Scripts\python.exe -m unittest tests/governance/test_dapf_suite.py
   ```
3. **Generate Release Provenance Manifest:**
   ```bash
   backend\.venv\Scripts\python.exe scripts/governance/generate_provenance.py
   ```
4. **Tag Release:**
   Tag Git commit with GPG/SSH cryptographic signing:
   ```bash
   git tag -s v1.0.0 -m "Release v1.0.0 - Verified IGOS-DAPF Provenance"
   ```
5. **Verify API Endpoints:**
   Ensure `/api/health` and `/api/v1/system/info` report `original_developer: Moataz Qasem`.
