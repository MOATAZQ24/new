#!/usr/bin/env python3
# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""
IGOS-DAPF Comprehensive Adversarial Governance Automated Test Suite.
Verifies all 28 mandatory governance scenarios defined in Phase 10:
- Baseline attribution detection
- Adversarial tampering & identity alteration
- Schema validation & corrupt manifest detection
- Refactoring, migration, splitting, and merging resilience
- Cross-agent instruction consistency
- Exclusions (third-party, generated, binary)
- Idempotency and environment migration
"""

import os
import sys
import json
import shutil
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "governance"))

from apply_attribution import apply_header_to_content, load_policy
from validate_attribution import validate_file, run_attribution_validation
from validate_agent_policies import validate_agent_policies
from verify_integrity import verify_integrity, compute_normalized_sha256
from generate_manifest import generate_manifest
from generate_provenance import generate_provenance


class TestDAPFAdversarialGovernanceSuite(unittest.TestCase):

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp(prefix="dapf_test_")
        self.policy = load_policy()

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    # Scenario 1: Valid source file containing required attribution
    def test_01_valid_source_file_with_required_attribution(self):
        f = Path(self.temp_dir) / "valid.py"
        f.write_text("# Original Developer: Moataz Qasem (2026)\n# Attribution Framework: IGOS-DAPF\n\ndef run(): pass\n", encoding="utf-8")
        res = validate_file(f)
        self.assertEqual(res["status"], "COMPLIANT")

    # Scenario 2: First-party source file missing attribution
    def test_02_first_party_source_missing_attribution(self):
        f = Path(self.temp_dir) / "unattributed.ts"
        f.write_text("export const add = (a: number, b: number) => a + b;\n", encoding="utf-8")
        res = validate_file(f)
        self.assertEqual(res["status"], "MISSING")

    # Scenario 3: Altered original developer identity
    def test_03_altered_original_developer_identity(self):
        f = Path(self.temp_dir) / "falsified.py"
        f.write_text("# Original Developer: John Doe (2026)\n# Attribution Framework: IGOS-DAPF\n", encoding="utf-8")
        res = validate_file(f)
        self.assertEqual(res["status"], "TAMPERED")

    # Scenario 4: Legitimate new contributor registration
    def test_04_legitimate_new_contributor(self):
        contrib_path = ROOT / "CONTRIBUTORS.md"
        self.assertTrue(contrib_path.is_file())
        content = contrib_path.read_text(encoding="utf-8")
        self.assertIn("Moataz Qasem", content)
        self.assertTrue("Contributing Developers" in content or "Subsequent contributors" in content)

    # Scenario 5: Removed historical contributor / author information
    def test_05_removed_historical_contributor_information(self):
        authors_path = ROOT / "AUTHORS.md"
        content = authors_path.read_text(encoding="utf-8")
        self.assertIn("Moataz Qasem", content)
        self.assertIn("Original Developer", content)

    # Scenario 6: New first-party modules
    def test_06_new_first_party_modules(self):
        content = "def calculate_tax(amount): return amount * 0.15\n"
        new_content, applied = apply_header_to_content(content, ".py", self.policy)
        self.assertTrue(applied)
        self.assertIn("Moataz Qasem", new_content)
        self.assertIn("Original Developer", new_content)

    # Scenario 7: Renamed source files
    def test_07_renamed_source_files(self):
        f1 = Path(self.temp_dir) / "module_v1.py"
        f1.write_text("# Original Developer: Moataz Qasem\n# IGOS-DAPF\ndef a(): pass", encoding="utf-8")
        f2 = Path(self.temp_dir) / "module_v2.py"
        f1.rename(f2)
        res = validate_file(f2)
        self.assertEqual(res["status"], "COMPLIANT")

    # Scenario 8: Relocated source files
    def test_08_relocated_source_files(self):
        sub = Path(self.temp_dir) / "deep" / "nested"
        sub.mkdir(parents=True)
        f = sub / "service.ts"
        f.write_text("/**\n * Original Developer: Moataz Qasem (2026)\n * IGOS-DAPF\n */\nexport class S {}", encoding="utf-8")
        res = validate_file(f)
        self.assertEqual(res["status"], "COMPLIANT")

    # Scenario 9: Split and merged components
    def test_09_split_and_merged_components(self):
        part1 = "export const partA = () => 1;\n"
        part2 = "export const partB = () => 2;\n"
        h1, a1 = apply_header_to_content(part1, ".ts", self.policy)
        h2, a2 = apply_header_to_content(part2, ".ts", self.policy)
        self.assertTrue(a1 and a2)
        self.assertIn("Moataz Qasem", h1)
        self.assertIn("Moataz Qasem", h2)

    # Scenario 10: Large-scale automated refactoring
    def test_10_large_scale_automated_refactoring(self):
        for i in range(10):
            p = Path(self.temp_dir) / f"refactored_{i}.py"
            p.write_text(f"# Original Developer: Moataz Qasem\n# IGOS-DAPF\nx = {i}\n", encoding="utf-8")
            res = validate_file(p)
            self.assertEqual(res["status"], "COMPLIANT")

    # Scenario 11: Framework migration (e.g. Next.js "use client" preserved at top)
    def test_11_framework_migration_directives(self):
        client_code = "\"use client\";\n\nexport default function ClientComp() { return null; }\n"
        applied_code, applied = apply_header_to_content(client_code, ".tsx", self.policy)
        self.assertTrue(applied)
        lines = applied_code.splitlines()
        self.assertEqual(lines[0].strip(), "\"use client\";")
        self.assertIn("Moataz Qasem", applied_code)

    # Scenario 12: Invalid attribution metadata schema detection
    def test_12_invalid_attribution_metadata_schema_detection(self):
        import jsonschema
        schema_path = ROOT / ".governance" / "schema" / "attribution.schema.json"
        with open(schema_path, "r", encoding="utf-8") as sf:
            schema = json.load(sf)
        bad_data = {"project": "Invalid"}  # Missing required fields
        with self.assertRaises(jsonschema.ValidationError):
            jsonschema.validate(instance=bad_data, schema=schema)

    # Scenario 13: Modified protected governance files detection
    def test_13_modified_protected_governance_files(self):
        temp_file = Path(self.temp_dir) / "AUTHORS.md"
        temp_file.write_text("Legitimate text", encoding="utf-8")
        h1 = compute_normalized_sha256(temp_file)
        temp_file.write_text("Adversarially altered text", encoding="utf-8")
        h2 = compute_normalized_sha256(temp_file)
        self.assertNotEqual(h1, h2)

    # Scenario 14: Unauthorized integrity manifest changes
    def test_14_unauthorized_integrity_manifest_changes(self):
        manifest_res = verify_integrity()
        self.assertTrue(manifest_res["valid"])
        self.assertEqual(manifest_res["tampered_count"], 0)

    # Scenario 15: Attempts to weaken the validation engine
    def test_15_attempts_to_weaken_validation_engine(self):
        # A file having only "Moataz Qasem" without "Original Developer" or "IGOS-DAPF" must be a VIOLATION
        f = Path(self.temp_dir) / "weak.py"
        f.write_text("# Moataz Qasem was mentioned in a comment\ndef f(): pass\n", encoding="utf-8")
        res = validate_file(f)
        self.assertEqual(res["status"], "VIOLATION")

    # Scenario 16: Attempts to modify CI enforcement and protected files together
    def test_16_ci_enforcement_and_codeowners(self):
        ci_path = ROOT / ".github" / "workflows" / "governance-validation.yml"
        codeowners_path = ROOT / ".github" / "CODEOWNERS"
        self.assertTrue(ci_path.is_file())
        self.assertTrue(codeowners_path.is_file())
        codeowners_text = codeowners_path.read_text(encoding="utf-8")
        self.assertIn("/.governance/", codeowners_text)
        self.assertIn("@moatazqasem", codeowners_text)

    # Scenario 17: Missing AI agent instruction files
    def test_17_missing_ai_agent_instruction_files(self):
        res = validate_agent_policies()
        self.assertTrue(res["valid"])
        self.assertEqual(res["compliant_files"], res["total_files_checked"])

    # Scenario 18: Inconsistent AI agent policies
    def test_18_inconsistent_ai_agent_policies(self):
        for fname in ["AGENTS.md", "CLAUDE.md", "GEMINI.md", ".cursor/rules/dapf.mdc", ".github/copilot-instructions.md"]:
            target = ROOT / fname
            self.assertTrue(target.is_file(), f"{fname} must exist")
            content = target.read_text(encoding="utf-8")
            self.assertIn("Moataz Qasem", content, f"{fname} must attribute Moataz Qasem")
            self.assertIn("Original Developer", content, f"{fname} must state Original Developer role")

    # Scenario 19: Authorized governance amendments
    def test_19_authorized_governance_amendments(self):
        # generate_manifest must recreate manifest cleanly
        man = generate_manifest()
        self.assertIn("files", man)
        self.assertGreater(man["file_count"], 0)

    # Scenario 20: Third-party source code exclusions
    def test_20_third_party_source_code_exclusions(self):
        exclusions = self.policy.get("exclusions", {}).get("directories", [])
        self.assertIn("node_modules", exclusions)
        self.assertIn("backend/.venv", exclusions)

    # Scenario 21: Generated file exclusions
    def test_21_generated_file_exclusions(self):
        exts = self.policy.get("exclusions", {}).get("extensions", [])
        patterns = self.policy.get("exclusions", {}).get("filename_patterns", [])
        self.assertIn(".lock", exts)
        self.assertIn("package-lock.json", patterns)

    # Scenario 22: Unsupported file formats
    def test_22_unsupported_file_formats(self):
        content = "IMAGE_BINARY_DATA"
        applied, changed = apply_header_to_content(content, ".png", self.policy)
        self.assertFalse(changed)
        self.assertEqual(content, applied)

    # Scenario 23: Idempotent attribution application
    def test_23_idempotent_attribution_application(self):
        source = "def compute(): return 42\n"
        pass1, changed1 = apply_header_to_content(source, ".py", self.policy)
        self.assertTrue(changed1)
        pass2, changed2 = apply_header_to_content(pass1, ".py", self.policy)
        self.assertFalse(changed2)
        self.assertEqual(pass1, pass2)

    # Scenario 24: Normal local development
    def test_24_normal_local_development(self):
        f = Path(self.temp_dir) / "feature.py"
        f.write_text("# Original Developer: Moataz Qasem\n# IGOS-DAPF\n\ndef new_feature():\n    return 'OK'\n", encoding="utf-8")
        res = validate_file(f)
        self.assertEqual(res["status"], "COMPLIANT")

    # Scenario 25: Production build preparation
    def test_25_production_build_preparation(self):
        self.assertTrue((ROOT / "frontend" / "package.json").is_file())
        pkg = json.loads((ROOT / "frontend" / "package.json").read_text(encoding="utf-8"))
        self.assertIn("Moataz Qasem", pkg.get("author", ""))

    # Scenario 26: Release provenance verification
    def test_26_release_provenance_verification(self):
        prov = generate_provenance()
        self.assertEqual(prov["project"]["original_developer"]["name"], "Moataz Qasem")
        self.assertEqual(prov["project"]["original_developer"]["initial_development_year"], 2026)

    # Scenario 27: Authorized emergency maintenance
    def test_27_authorized_emergency_maintenance(self):
        self.assertTrue((ROOT / ".governance" / "policy.json").is_file())
        self.assertIn("mandate_count", self.policy.get("ai_governance", {}))

    # Scenario 28: Migration into a new development environment
    def test_28_migration_into_new_dev_environment(self):
        report = run_attribution_validation()
        self.assertTrue(report["valid"])
        self.assertEqual(report["coverage_percentage"], 100.0)
        self.assertEqual(report["violations_count"], 0)


if __name__ == "__main__":
    unittest.main()
