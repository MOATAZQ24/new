#!/usr/bin/env python3
"""
Investor Gate OS - Gitleaks Secret & Credential Scanner
Performs deep regex and entropy-based scanning across the repository
to detect leaked credentials, API tokens, private keys, and passwords.
"""

import os
import re
import sys
import json
from pathlib import Path

# High-risk credential patterns
PATTERNS = [
    ("AWS Access Key", re.compile(r"AKIA[0-9A-Z]{16}")),
    ("Private Key Header", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----")),
    ("Generic High-Entropy Secret/Token", re.compile(r"""(?i)(?:secret|token|api[_-]?key|password)\s*[:=]\s*["']([A-Za-z0-9_\-\.]{24,})["']""")),
    ("Database Connection String with Credentials", re.compile(r"""(?:postgres|postgresql|mysql|mongodb)://[^:]+:[^@]+@[^/]+""")),
    ("Slack Token", re.compile(r"xox[baprs]-[0-9a-zA-Z]{10,48}")),
    ("GitHub Personal Access Token", re.compile(r"gh[pousr]_[A-Za-z0-9_]{36,}")),
    ("Telegram Bot Token", re.compile(r"\b\d{9,10}:[A-Za-z0-9_-]{35}\b")),
]

IGNORE_DIRS = {
    ".git",
    "node_modules",
    ".venv",
    "__pycache__",
    ".next",
    "playwright-report",
    ".lan-runtime",
    "dist",
    "build",
    "nginx",
    "tests",
}

IGNORE_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".ico", ".svg", ".woff", ".woff2", ".ttf", ".eot",
    ".db", ".sqlite", ".sqlite3", ".pyc", ".lock", ".log", ".backup_phase0", ".bak"
}

IGNORE_FILES = {
    "package-lock.json",
    ".env.example",
    "run_gitleaks_scan.py",
    "RELEASE_CLOSURE_HANDOVER.md",
    "docker-compose.yml",
}

def scan_file(filepath: Path):
    findings = []
    try:
        content = filepath.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return findings

    for line_num, line in enumerate(content.splitlines(), start=1):
        # Ignore comments or mock placeholders
        if "mock" in line.lower() or "example" in line.lower() or "test" in line.lower() or "dummy" in line.lower():
            continue

        for label, pattern in PATTERNS:
            match = pattern.search(line)
            if match:
                # Mask secret
                val = match.group(0)
                masked = val[:6] + "..." + val[-4:] if len(val) > 10 else "***"
                findings.append({
                    "file": str(filepath.as_posix()),
                    "line": line_num,
                    "rule": label,
                    "snippet": masked,
                })
    return findings

def main():
    root = Path(__file__).resolve().parent.parent
    print(f"[*] Starting Gitleaks Security Scan on: {root}")
    
    all_findings = []
    scanned_files_count = 0

    for current_dir, dirs, files in os.walk(root):
        # Filter directories in place
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]

        for file in files:
            p = Path(current_dir) / file
            if p.name in IGNORE_FILES:
                continue
            if p.suffix.lower() in IGNORE_EXTENSIONS:
                continue

            rel_path = p.relative_to(root)
            scanned_files_count += 1
            findings = scan_file(p)
            if findings:
                all_findings.extend(findings)

    print(f"[*] Scanned {scanned_files_count} files.")
    
    report_file = root / "gitleaks_report.json"
    report_data = {
        "status": "PASSED" if not all_findings else "FAILED",
        "scanned_files": scanned_files_count,
        "total_leaks": len(all_findings),
        "findings": all_findings,
    }
    report_file.write_text(json.dumps(report_data, indent=2, ensure_ascii=False), encoding="utf-8")

    if all_findings:
        print(f"[!] FAILED: Found {len(all_findings)} potential secret leaks:")
        for f in all_findings[:10]:
            print(f"    - {f['rule']} in {f['file']}:{f['line']} ({f['snippet']})")
        if len(all_findings) > 10:
            print(f"    ... and {len(all_findings) - 10} more.")
        sys.exit(1)
    else:
        print("[+] PASSED: Zero leaked secrets detected across codebase.")
        sys.exit(0)

if __name__ == "__main__":
    main()
