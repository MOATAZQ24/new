#!/usr/bin/env python3
"""
Investor Gate OS - OWASP ZAP Equivalent DAST Security Audit
Automated security vulnerability & posture probe across API and web surfaces.
Tests:
- Security Response Headers
- CORS configuration
- SQL Injection resilience
- Reflected XSS handling
- Sensitive Error Disclosure
- Authentication enforcement on protected endpoints
"""

import urllib.request
import urllib.parse
import urllib.error
import json
import time
import sys
from pathlib import Path

BASE_URL = "http://127.0.0.1:3000"
API_URL = "http://127.0.0.1:8000"

def probe_url(url, method="GET", headers=None, data=None):
    if headers is None:
        headers = {}
    req = urllib.request.Request(url, headers=headers, method=method, data=data)
    start = time.time()
    try:
        with urllib.request.urlopen(req, timeout=5) as res:
            duration = round((time.time() - start) * 1000, 2)
            return {
                "status": res.status,
                "headers": dict(res.headers),
                "body": res.read().decode("utf-8", errors="ignore"),
                "duration_ms": duration,
                "error": None,
            }
    except urllib.error.HTTPError as e:
        duration = round((time.time() - start) * 1000, 2)
        body = ""
        try:
            body = e.read().decode("utf-8", errors="ignore")
        except Exception:
            pass
        return {
            "status": e.code,
            "headers": dict(e.headers),
            "body": body,
            "duration_ms": duration,
            "error": str(e),
        }
    except Exception as e:
        return {
            "status": 0,
            "headers": {},
            "body": "",
            "duration_ms": 0,
            "error": str(e),
        }

def run_dast_audit():
    print(f"[*] Starting OWASP ZAP DAST Security Audit against {BASE_URL} and {API_URL}")
    results = []
    
    # 1. API Health Check
    health = probe_url(f"{API_URL}/api/health")
    results.append({
        "test": "API Health Endpoint Availability",
        "passed": health["status"] == 200,
        "details": f"Status: {health['status']} ({health['duration_ms']}ms)",
    })

    # 2. Protected Route Authentication Gate
    unauth_tasks = probe_url(f"{API_URL}/api/v1/tasks")
    is_protected = unauth_tasks["status"] in (401, 403)
    results.append({
        "test": "RBAC & Authentication Enforcement on /api/v1/tasks",
        "passed": is_protected,
        "details": f"Status code for unauthenticated request: {unauth_tasks['status']} (Expected 401/403)",
    })

    # 3. SQL Injection Probe on Health/Readiness
    sqli_probe = probe_url(f"{API_URL}/api/v1/tasks?search=%27+OR+%271%27=%271")
    sqli_safe = "syntax error" not in sqli_probe["body"].lower() and "psycopg" not in sqli_probe["body"].lower()
    results.append({
        "test": "SQL Injection Fuzzing Resilience",
        "passed": sqli_safe,
        "details": "No raw SQL exceptions or stack traces exposed during SQLi fuzzing",
    })

    # 4. Reflected XSS Probe
    xss_payload = "<script>alert('xss')</script>"
    xss_probe = probe_url(f"{BASE_URL}/?q={urllib.parse.quote(xss_payload)}")
    xss_safe = xss_payload not in xss_probe["body"]
    results.append({
        "test": "Reflected XSS Sanitization",
        "passed": xss_safe,
        "details": "Raw script payload was not reflected in executable HTML context",
    })

    # 5. CORS Header Evaluation
    cors_probe = probe_url(f"{API_URL}/api/health", headers={"Origin": "https://malicious-attacker-domain.com"})
    cors_headers = cors_probe["headers"]
    cors_val = cors_headers.get("access-control-allow-origin", "")
    cors_safe = cors_val != "*" and cors_val != "https://malicious-attacker-domain.com"
    results.append({
        "test": "CORS Policy Restriction",
        "passed": cors_safe or cors_val == "",
        "details": f"Access-Control-Allow-Origin: '{cors_val}'",
    })

    # 6. Sensitive Information Disclosure Probe
    error_probe = probe_url(f"{API_URL}/api/v1/non_existent_route_404")
    body_low = error_probe["body"].lower()
    info_leak = any(k in body_low for k in ["traceback", "password", "secret_key", "internal server error: Traceback"])
    results.append({
        "test": "Information Disclosure & Stack Trace Masking",
        "passed": not info_leak,
        "details": f"Status: {error_probe['status']}, Stack trace masked: {not info_leak}",
    })

    # Summary
    passed_count = sum(1 for r in results if r["passed"])
    total_count = len(results)
    score_pct = round((passed_count / total_count) * 100, 1)

    print("\n" + "=" * 60)
    print(f"OWASP ZAP DAST Security Audit Results ({score_pct}% Passed)")
    print("=" * 60)
    for r in results:
        status_icon = "[PASS]" if r["passed"] else "[FAIL]"
        print(f"{status_icon} {r['test']}: {r['details']}")

    report_path = Path(__file__).resolve().parent.parent / "zap_security_report.json"
    report_path.write_text(json.dumps({
        "score_percentage": score_pct,
        "passed": passed_count,
        "total": total_count,
        "results": results,
    }, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\n[+] Detailed report written to: {report_path.as_posix()}")

    return score_pct >= 80

if __name__ == "__main__":
    success = run_dast_audit()
    sys.exit(0 if success else 1)
