/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import { http, HttpResponse } from "msw";

export const handlers = [
  // Health check mock
  http.get("/api/health", () => {
    return HttpResponse.json({
      status: "healthy",
      app: "Investor Gate IT Operations Management API (MSW Mock)",
      version: "3.0.0-mock",
      environment: "mock-sandbox",
    });
  }),

  // Telemetry metrics mock
  http.get("/api/v1/metrics", () => {
    return HttpResponse.json({
      status: "success",
      uptime_seconds: 3600,
      requests_total: 1420,
      requests_per_second: 12.4,
      avg_latency_ms: 18.5,
      memory_usage_mb: 84.2,
      database_latency_ms: 2.1,
    });
  }),

  // Current user mock
  http.get("/api/v1/auth/me", () => {
    return HttpResponse.json({
      id: "usr-dev-mock-01",
      email: "admin@investorgate.com",
      full_name: "صدام العامري",
      role: "SUPER_ADMIN",
      is_active: true,
      company_id: "comp-001",
    });
  }),

  // Mock tasks list
  http.get("/api/v1/tasks", () => {
    return HttpResponse.json({
      items: [
        {
          id: "TASK-845577",
          title: "معالجة عطل الخادم الرئيسي",
          status: "IN_PROGRESS",
          priority: "CRITICAL",
          assignee_name: "أحمد الحربي",
          due_date: new Date(Date.now() + 86400000).toISOString(),
        },
        {
          id: "TASK-845578",
          title: "إعداد التقرير الأسبوعي للإدارة",
          status: "PENDING_ACCEPTANCE",
          priority: "URGENT",
          assignee_name: "محمد العتيبي",
          due_date: new Date(Date.now() + 172800000).toISOString(),
        },
      ],
      total: 2,
    });
  }),
];
