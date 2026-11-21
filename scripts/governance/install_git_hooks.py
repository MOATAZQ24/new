#!/usr/bin/env python3
# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""
IGOS-DAPF Git Hook Installer.
Configures local Git repository to execute .githooks pre-commit and pre-push gates.
"""

import sys
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def install_hooks():
    try:
        subprocess.run(["git", "config", "core.hooksPath", ".githooks"], cwd=str(ROOT), check=True)
        print("[✓] Git core.hooksPath successfully configured to .githooks")
    except Exception as e:
        print(f"[✗] Failed to configure Git hooks: {e}")
        sys.exit(1)


if __name__ == "__main__":
    install_hooks()
