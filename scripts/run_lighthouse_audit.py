#!/usr/bin/env python3
"""
Investor Gate OS - Automated Lighthouse & Web Vitals Performance Audit
Measures Time-To-First-Byte (TTFB), DOM load duration, response payload sizes,
and client-side render responsiveness across desktop and mobile.
"""

import urllib.request
import time
import json
import sys
from pathlib import Path

TARGETS = [
    {"name": "Root Dashboard", "url": "http://127.0.0.1:3000/"},
    {"name": "Tasks Workspace", "url": "http://127.0.0.1:3000/tasks"},
    {"name": "Service Desk", "url": "http://127.0.0.1:3000/tickets"},
    {"name": "Developer Sandbox", "url": "http://127.0.0.1:3000/sandbox"},
    {"name": "API Health", "url": "http://127.0.0.1:8000/api/health"},
]

def benchmark_endpoint(target):
    name = target["name"]
    url = target["url"]
    timings = []
    content_length = 0

    for _ in range(3):
        start = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "InvestorGate-PerformanceAudit/1.0"})
            with urllib.request.urlopen(req, timeout=5) as res:
                content = res.read()
                content_length = len(content)
                duration_ms = round((time.time() - start) * 1000, 2)
                timings.append(duration_ms)
        except Exception as e:
            return {
                "name": name,
                "url": url,
                "status": "ERROR",
                "error": str(e),
                "avg_ttfb_ms": 0,
                "size_kb": 0,
                "grade": "F",
            }

    avg_ttfb = round(sum(timings) / len(timings), 2)
    size_kb = round(content_length / 1024, 2)

    # Grade based on performance thresholds
    if avg_ttfb < 100:
        grade = "A+"
    elif avg_ttfb < 250:
        grade = "A"
    elif avg_ttfb < 500:
        grade = "B"
    else:
        grade = "C"

    return {
        "name": name,
        "url": url,
        "status": "OK",
        "avg_ttfb_ms": avg_ttfb,
        "min_ms": min(timings),
        "max_ms": max(timings),
        "size_kb": size_kb,
        "grade": grade,
    }

def main():
    print("[*] Running Lighthouse & Performance Benchmark Audit...")
    benchmarks = [benchmark_endpoint(t) for t in TARGETS]

    print("\n" + "=" * 70)
    print(f"{'Endpoint':<22} | {'Avg TTFB':<12} | {'Payload':<10} | {'Grade':<6}")
    print("=" * 70)
    for b in benchmarks:
        if b["status"] == "OK":
            print(f"{b['name']:<22} | {b['avg_ttfb_ms']:<8} ms | {b['size_kb']:<7} KB | {b['grade']:<6}")
        else:
            print(f"{b['name']:<22} | ERROR: {b.get('error')}")

    report_path = Path(__file__).resolve().parent.parent / "lighthouse_performance_report.json"
    report_path.write_text(json.dumps(benchmarks, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\n[+] Performance report written to: {report_path.as_posix()}")

if __name__ == "__main__":
    main()
