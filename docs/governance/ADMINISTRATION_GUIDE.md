# IGOS Administration Guide — Provenance & Attribution Maintenance

**Document ID:** IGOS-DAPF-DOC-004  
**Original Developer:** Moataz Qasem (2026)  
**Framework:** IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)  

---

## 1. Day-to-Day Operations

### Running Verification Locally
```bash
# Verify developer attribution headers on all first-party source files
python scripts/verify_attribution.py

# Verify SHA-256 cryptographic integrity of protected metadata
python scripts/verify_provenance_integrity.py

# Run governance unit tests
python -m unittest backend/tests/test_attribution_governance.py
```

### Enabling Local Pre-Commit Hook
```powershell
powershell -ExecutionPolicy Bypass -File scripts/install_git_hooks.ps1
```

---

## 2. Authorized Governance Updates
When legitimate updates are made to `AUTHORS.md`, `CONTRIBUTORS.md`, or policy documents:
1. Make the authorized changes.
2. Regenerate the cryptographic protected manifest:
   ```bash
   python scripts/generate_protected_manifest.py
   ```
3. Verify that the new manifest passes integrity checks:
   ```bash
   python scripts/verify_provenance_integrity.py
   ```
4. Commit the changes together with the updated `protected_manifest.json`.
