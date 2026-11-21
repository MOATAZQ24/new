# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

import time
import os
import psutil
from typing import Dict, Any
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

class MetricsCollector:
    def __init__(self):
        self.start_time = time.time()
        self.total_requests = 0
        self.status_codes: Dict[int, int] = {}
        self.total_duration_ms = 0.0
        self.active_requests = 0

    def record_request(self, status_code: int, duration_ms: float):
        self.total_requests += 1
        self.total_duration_ms += duration_ms
        self.status_codes[status_code] = self.status_codes.get(status_code, 0) + 1

    def get_summary(self) -> Dict[str, Any]:
        uptime = time.time() - self.start_time
        avg_latency = (
            round(self.total_duration_ms / self.total_requests, 2)
            if self.total_requests > 0
            else 0.0
        )
        rps = round(self.total_requests / uptime, 2) if uptime > 0 else 0.0

        # Memory usage
        mem_mb = 0.0
        try:
            process = psutil.Process(os.getpid())
            mem_mb = round(process.memory_info().rss / (1024 * 1024), 2)
        except Exception:
            pass

        return {
            "status": "healthy",
            "uptime_seconds": round(uptime, 1),
            "requests_total": self.total_requests,
            "requests_per_second": rps,
            "avg_latency_ms": avg_latency,
            "memory_usage_mb": mem_mb,
            "active_requests": self.active_requests,
            "status_codes": self.status_codes,
        }

    def get_prometheus_text(self) -> str:
        summary = self.get_summary()
        lines = [
            "# HELP http_requests_total Total number of HTTP requests processed.",
            "# TYPE http_requests_total counter",
            f"http_requests_total {summary['requests_total']}",
            "",
            "# HELP http_request_duration_ms_avg Average HTTP request duration in milliseconds.",
            "# TYPE http_request_duration_ms_avg gauge",
            f"http_request_duration_ms_avg {summary['avg_latency_ms']}",
            "",
            "# HELP process_resident_memory_mb Resident memory usage in megabytes.",
            "# TYPE process_resident_memory_mb gauge",
            f"process_resident_memory_mb {summary['memory_usage_mb']}",
            "",
            "# HELP http_requests_active Current active HTTP requests.",
            "# TYPE http_requests_active gauge",
            f"http_requests_active {summary['active_requests']}",
            "",
            "# HELP app_uptime_seconds Application uptime in seconds.",
            "# TYPE app_uptime_seconds counter",
            f"app_uptime_seconds {summary['uptime_seconds']}",
        ]
        for code, count in summary["status_codes"].items():
            lines.append(f'http_requests_by_status{{code="{code}"}} {count}')
        return "\n".join(lines) + "\n"

metrics_collector = MetricsCollector()

class TelemetryMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        metrics_collector.active_requests += 1
        start_time = time.time()
        try:
            response: Response = await call_next(request)
            duration_ms = (time.time() - start_time) * 1000
            metrics_collector.record_request(response.status_code, duration_ms)
            response.headers["X-Response-Time-Ms"] = f"{duration_ms:.2f}"
            return response
        except Exception as exc:
            duration_ms = (time.time() - start_time) * 1000
            metrics_collector.record_request(500, duration_ms)
            raise exc
        finally:
            metrics_collector.active_requests = max(0, metrics_collector.active_requests - 1)
