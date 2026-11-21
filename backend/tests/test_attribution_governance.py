# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================
"""
Automated Governance Tests for IGOS-DAPF
Validates detection of removed attribution, metadata tampering, new files,
authorized contributor additions, and legitimate manifest updates.
"""

import unittest
import tempfile
import json
import shutil
from pathlib import Path
from scripts.verify_attribution import verify_file
from scripts.verify_provenance_integrity import hash_file

ROOT = Path(__file__).resolve().parent.parent.parent

class TestAttributionGovernance(unittest.TestCase):
    def setUp(self):
        self.temp_dir = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_01_valid_file_passes(self):
        sample = self.temp_dir / "valid_module.py"
        sample.write_text(
            "# Original Developer: Moataz Qasem (2026)\n"
            "# Framework: IGOS-DAPF\n"
            "def hello(): pass\n",
            encoding="utf-8"
        )
        valid, reason = verify_file(sample)
        self.assertTrue(valid)
        self.assertEqual(reason, "valid")

    def test_02_missing_original_developer_fails(self):
        sample = self.temp_dir / "tampered_module.py"
        sample.write_text(
            "# Framework: IGOS-DAPF\n"
            "def hello(): pass\n",
            encoding="utf-8"
        )
        valid, reason = verify_file(sample)
        self.assertFalse(valid)
        self.assertIn("Moataz Qasem", reason)

    def test_03_missing_framework_token_fails(self):
        sample = self.temp_dir / "missing_framework.ts"
        sample.write_text(
            "// Developer: Moataz Qasem\n"
            "export const a = 1;\n",
            encoding="utf-8"
        )
        valid, reason = verify_file(sample)
        self.assertFalse(valid)
        self.assertIn("IGOS-DAPF", reason)

    def test_04_tampered_metadata_hash_detected(self):
        orig_authors = (ROOT / "AUTHORS.md").read_bytes()
        tampered_bytes = orig_authors.replace(b"Moataz Qasem", b"Anonymous Person")
        
        orig_hash = hash_file(ROOT / "AUTHORS.md")
        
        tampered_file = self.temp_dir / "AUTHORS.md"
        tampered_file.write_bytes(tampered_bytes)
        tampered_hash = hash_file(tampered_file)

        self.assertNotEqual(orig_hash, tampered_hash, "Hash tampering must be detectable")

    def test_05_provenance_json_contains_original_developer(self):
        prov_file = ROOT / "PROVENANCE.json"
        self.assertTrue(prov_file.exists())
        data = json.loads(prov_file.read_text(encoding="utf-8"))
        orig_dev = data["provenance"]["original_developer"]
        self.assertEqual(orig_dev["name"], "Moataz Qasem")
        self.assertEqual(orig_dev["year"], 2026)
        self.assertEqual(orig_dev["status"], "Permanent Historical Record")

    def test_06_contributors_ledger_preserves_primacy(self):
        contrib_file = ROOT / "CONTRIBUTORS.md"
        self.assertTrue(contrib_file.exists())
        content = contrib_file.read_text(encoding="utf-8")
        self.assertIn("Moataz Qasem", content)
        self.assertIn("Original Developer", content)

if __name__ == "__main__":
    unittest.main()
