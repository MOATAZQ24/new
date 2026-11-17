# Investor Gate OS 3.0 — Enterprise Analytics, KPI Definitions & Visual Intelligence Specification

## 1. Core Principles

1. **Zero Fabricated Metrics:** Every KPI and chart series is computed directly from authoritative relational tables scoped by `company_id`.
2. **Separation of Operational Telemetry vs. Formal HR Evaluations:** Task completion and attendance counts are operational telemetry and are never conflated with formal HR performance evaluation scores (`PerformanceEvaluation`).
3. **Chart/Table Reconciliation:** Every Donut and Bar chart displays the exact sum (`الإجمالي`) matching the underlying table query.

---

## 2. Documented KPI Formulas

| Domain | KPI Name | Formula / Denominator | Source Table(s) |
|---|---|---|---|
| **Employees / 360°** | Task Completion Rate (%) | $\frac{\text{Completed Tasks}}{\text{Total Assigned Tasks} - \text{Cancelled Tasks}} \times 100$ | `tasks` |
| **Employees / 360°** | Deadline Adherence (%) | $\frac{\text{Tasks Completed On or Before Due Date}}{\text{Completed Tasks}} \times 100$ | `tasks` |
| **HRM & Attendance** | Present Today | Count of `AttendanceRecord` for `today` (`Asia/Riyadh`) with `status IN ('Present', 'Late', 'Remote')` | `attendance_records` |
| **HRM & Attendance** | Unrecorded Today | $\max(0, \text{Active Headcount} - \text{Recorded Attendance Rows Today})$ | `employees`, `attendance_records` |
| **CRM Pipeline** | Open Pipeline Value (SAR) | $\sum \text{expected\_value\_sar}$ where `stage NOT IN ('Won', 'Lost')` | `crm_opportunities` |
| **CRM Pipeline** | Conversion Rate (%) | $\frac{\text{Opportunities in Won Stage}}{\text{Total Opportunities}} \times 100$ | `crm_opportunities` |
| **Projects** | Project Progress (%) | $\frac{\text{Completed Project Tasks}}{\text{Total Project Tasks}} \times 100$ (or explicit `progress_percent` when task count is 0) | `projects`, `tasks` |
| **Approvals & ERP** | Pending Purchase Amount (SAR) | $\sum (\text{quantity} \times \text{unit\_cost\_sar})$ where `status = 'Pending Approval'` | `purchase_requests` |
| **Subscriptions** | Monthly Subscription Cost (SAR) | $\sum \text{Normalized Monthly Price}$ across `Active` and `Expiring Soon` subscriptions | `third_party_subscriptions` |
