import uuid
import csv
import base64
from html import escape
import io
from datetime import datetime, date
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, get_user_company_id, require_role, resolve_company_scope
from app.core.response import success_response
from app.models.asset import TechnicalAsset, AssetCustody
from app.models.infrastructure import ITInfrastructure
from app.models.subscription import ThirdPartySubscription
from app.models.maintenance import MaintenanceRecord
from app.models.task import Task
from app.models.ticket import HelpDeskTicket
from app.models.audit import AuditLog
from app.models.user import User, Employee
from app.services.audit_service import log_audit

router = APIRouter(prefix="/reports", tags=["Reports & Exports"])


@router.get("/overview")
def get_reports_overview(
    company_id: Optional[uuid.UUID] = None,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager", "Auditor"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Return authorized executive report metrics, asset distribution, and company breakdown."""
    from app.api.v1.endpoints.workspace import authorize_company
    from app.models.company import Company
    from app.models.user import CompanyMembership

    target_cid = resolve_company_scope(current_user, active_cid, company_id)
    authorize_company(db, current_user, target_cid)
    today = date.today()

    assets_list = db.query(TechnicalAsset).filter(TechnicalAsset.company_id == target_cid).all()
    tickets_list = db.query(HelpDeskTicket).filter(HelpDeskTicket.company_id == target_cid).all()
    tasks_list = db.query(Task).filter(Task.company_id == target_cid).all()
    subs_list = db.query(ThirdPartySubscription).filter(ThirdPartySubscription.company_id == target_cid).all()

    open_tickets = sum(1 for t in tickets_list if t.status not in ("Resolved", "Closed", "Cancelled"))
    overdue_tasks = sum(
        1 for t in tasks_list if t.due_date and t.due_date < today and t.status not in ("Completed", "Cancelled", "Rejected")
    )

    asset_status_distribution = {
        "قيد الاستخدام (Assigned)": sum(1 for a in assets_list if a.status == "Assigned"),
        "متاح (Available)": sum(1 for a in assets_list if a.status == "Available"),
        "تحت الصيانة (Maintenance)": sum(1 for a in assets_list if a.status == "Under Maintenance"),
        "خارج الخدمة (Retired/Damaged)": sum(1 for a in assets_list if a.status in ("Retired", "Damaged")),
    }

    if current_user.is_superadmin:
        authorized_companies = db.query(Company).filter(Company.status == "Active").order_by(Company.company_name_ar.asc()).all()
    else:
        mem_cids = [
            r[0]
            for r in db.query(CompanyMembership.company_id)
            .filter(CompanyMembership.user_id == current_user.id, CompanyMembership.status == "Active")
            .all()
        ]
        authorized_companies = db.query(Company).filter(Company.id.in_(mem_cids or [target_cid])).all()

    company_breakdown = []
    for comp in authorized_companies:
        c_assets = db.query(TechnicalAsset).filter(TechnicalAsset.company_id == comp.id).count()
        c_tickets = db.query(HelpDeskTicket).filter(HelpDeskTicket.company_id == comp.id).count()
        c_tasks = db.query(Task).filter(Task.company_id == comp.id).count()
        c_emps = db.query(Employee).filter(Employee.company_id == comp.id).count()
        company_breakdown.append(
            {
                "company_id": str(comp.id),
                "company_code": comp.company_code,
                "company_name_ar": comp.company_name_ar,
                "assets_count": c_assets,
                "tickets_count": c_tickets,
                "tasks_count": c_tasks,
                "employees_count": c_emps,
            }
        )

    return success_response(
        data={
            "kpis": {
                "total_assets": len(assets_list),
                "total_tickets": len(tickets_list),
                "open_tickets": open_tickets,
                "overdue_tasks": overdue_tasks,
                "active_subscriptions": sum(1 for s in subs_list if s.status in ("Active", "Expiring Soon")),
            },
            "asset_status_distribution": asset_status_distribution,
            "company_breakdown": company_breakdown,
        }
    )


def generate_excel_compatible_csv(headers: list, rows: list) -> str:
    """Generate UTF-8 with BOM CSV that Excel opens with full Arabic RTL character support."""
    output = io.StringIO()
    # Write UTF-8 BOM
    output.write("\ufeff")
    writer = csv.writer(output)
    writer.writerow(headers)
    for row in rows:
        writer.writerow(row)
    return output.getvalue()


def generate_html_printable_report(title: str, headers: list, rows: list, company_name: str, company_logo: bytes | None = None) -> str:
    """Generate printable styled HTML report supporting Arabic RTL and printing to PDF."""
    title, company_name = escape(title), escape(company_name)
    logo_markup = f'<img alt="Company logo" style="max-height:64px;max-width:180px" src="data:image/png;base64,{base64.b64encode(company_logo).decode()}" />' if company_logo else "Investor Gate IT"
    table_headers = "".join([f"<th style='border:1px solid #cbd5e1;padding:10px;background:#123D32;color:white;'>{escape(str(h))}</th>" for h in headers])
    table_rows = ""
    for r in rows:
        cells = "".join([f"<td style='border:1px solid #cbd5e1;padding:8px;'>{escape(str(c or '-'))}</td>" for c in r])
        table_rows += f"<tr>{cells}</tr>"

    html = f"""<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<title>{title}</title>
<style>
  body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 30px; background: #fff; color: #1e293b; direction: rtl; }}
  .header {{ display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #187A5A; padding-bottom: 15px; margin-bottom: 20px; }}
  .title {{ color: #123D32; font-size: 24px; font-weight: bold; }}
  .meta {{ color: #64748B; font-size: 14px; }}
  table {{ width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }}
  tr:nth-child(even) {{ background: #f8fafc; }}
  .footer {{ margin-top: 30px; text-align: center; color: #94a3b8; font-size: 12px; }}
  @media print {{ body {{ margin: 10mm; }} }}
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">{title}</div>
      <div class="meta">الشركة: {company_name} | التاريخ: {datetime.now().strftime('%Y-%m-%d %H:%M')}</div>
    </div>
    <div style="font-size: 20px; font-weight: bold; color: #187A5A;">{logo_markup}</div>
  </div>
  <table>
    <thead><tr>{table_headers}</tr></thead>
    <tbody>{table_rows}</tbody>
  </table>
  <div class="footer">تم إنشاء هذا التقرير آلياً عبر نظام إدارة عمليات تقنية المعلومات - Investor Gate</div>
</body>
</html>"""
    return html


@router.get("/export")
def export_report(
    report_type: str = Query(..., pattern="^(assets|custody|infrastructure|subscriptions|maintenance|tasks|helpdesk|audit)$"),
    format_type: str = Query("excel", pattern="^(excel|csv|html|pdf)$"),
    company_id: Optional[uuid.UUID] = None,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager", "Auditor"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Export system data to Excel/CSV or printable HTML."""
    from app.api.v1.endpoints.workspace import authorize_company, shared_settings
    from app.models.company import Company
    target_cid = resolve_company_scope(current_user, active_cid, company_id)
    authorize_company(db, current_user, target_cid)
    company_name = db.get(Company, target_cid).company_name_ar
    branding = shared_settings(db, target_cid)

    if report_type == "assets":
        title = "تقرير الأصول التقنية (Technical Assets Report)"
        headers = ["كود الأصل", "اسم الأصل", "النوع", "الماركة", "الموديل", "الرقم التسلسلي", "الحالة", "الموظف المعين له", "تاريخ الشراء", "تاريخ انتهاء الضمان"]
        assets = db.query(TechnicalAsset).filter(TechnicalAsset.company_id == target_cid).all()
        rows = [
            [
                a.asset_code,
                a.asset_name,
                a.asset_type,
                a.brand,
                a.model,
                a.serial_number,
                a.status,
                a.assigned_employee.full_name if a.assigned_employee else "غير معين",
                a.purchase_date,
                a.warranty_expiry,
            ]
            for a in assets
        ]

    elif report_type == "custody":
        title = "تقرير عهد الموظفين (Employee Custody Report)"
        headers = ["الموظف", "الرقم الوظيفي", "كود الأصل", "اسم الأصل", "تاريخ التسليم", "تاريخ الإرجاع المتوقع", "حالة الأصل عند التسليم", "حالة العهدة"]
        records = db.query(AssetCustody).filter(AssetCustody.company_id == target_cid).all()
        rows = [
            [
                r.employee.full_name if r.employee else "",
                r.employee.employee_number if r.employee else "",
                r.asset.asset_code if r.asset else "",
                r.asset.asset_name if r.asset else "",
                r.assignment_date.strftime("%Y-%m-%d"),
                r.expected_return_date or "غير محدد",
                r.condition_on_assignment,
                r.status,
            ]
            for r in records
        ]

    elif report_type == "infrastructure":
        title = "تقرير البنية التحتية (IT Infrastructure Report)"
        headers = ["اسم الجهاز", "نوع الجهاز", "الشركة المصنعة", "الموديل", "الرقم التسلسلي", "اسم المضيف", "IP الإدارة", "الشبكة", "VLAN", "الموقع", "الحالة"]
        devs = db.query(ITInfrastructure).filter(ITInfrastructure.company_id == target_cid).all()
        rows = [
            [
                d.device_name,
                d.device_type,
                d.manufacturer,
                d.model,
                d.serial_number,
                d.hostname,
                d.management_ip,
                d.network_name,
                d.vlan,
                d.location,
                d.status,
            ]
            for d in devs
        ]

    elif report_type == "subscriptions":
        title = "تقرير الاشتراكات الخارجية (Subscriptions Report)"
        headers = ["اسم الخدمة", "المزود", "نوع الاشتراك", "الباقة", "دورة الفوترة", "السعر", "العملة", "تاريخ التجديد", "تاريخ الانتهاء", "الحالة"]
        subs = db.query(ThirdPartySubscription).filter(ThirdPartySubscription.company_id == target_cid).all()
        rows = [
            [
                s.service_name,
                s.provider,
                s.subscription_type,
                s.package_type,
                s.billing_cycle,
                s.price,
                s.currency,
                s.renewal_date,
                s.expiry_date,
                s.status,
            ]
            for s in subs
        ]

    elif report_type == "maintenance":
        title = "تقرير سجلات الصيانة والتغيير (Maintenance & Changes Report)"
        headers = ["العنوان", "نوع الإجراء", "الهدف", "الفني المسؤول", "الحالة", "حالة الاعتماد", "التكلفة", "تاريخ البدء", "تاريخ الإنجاز"]
        mrec = db.query(MaintenanceRecord).filter(MaintenanceRecord.company_id == target_cid).all()
        rows = [
            [
                m.title,
                m.action_type,
                m.target_type,
                m.assigned_technician.username if m.assigned_technician else "",
                m.status,
                m.approval_status,
                m.cost,
                m.start_date,
                m.completion_date,
            ]
            for m in mrec
        ]

    elif report_type == "tasks":
        title = "تقرير المهام (Tasks Report)"
        headers = ["عنوان المهمة", "المسند إليه", "الأولوية", "الحالة", "تاريخ البدء", "تاريخ الاستحقاق", "تاريخ الاكتمال"]
        tasks = db.query(Task).filter(Task.company_id == target_cid).all()
        rows = [
            [
                t.title,
                t.assigned_to.full_name if t.assigned_to else "غير مسند",
                t.priority,
                t.status,
                t.start_date,
                t.due_date,
                t.completed_at,
            ]
            for t in tasks
        ]

    elif report_type == "helpdesk":
        title = "تقرير مكتب المساعدة (Help Desk Tickets Report)"
        headers = ["رقم التذكرة", "عنوان المشكلة", "مقدم الطلب", "الفني المكلف", "التصنيف", "الأولوية", "الحالة", "تاريخ الإنشاء", "تاريخ الحل"]
        tix = db.query(HelpDeskTicket).filter(HelpDeskTicket.company_id == target_cid).all()
        rows = [
            [
                t.ticket_number,
                t.issue_title,
                t.requester.full_name if t.requester else "",
                t.assigned_technician.username if t.assigned_technician else "غير مكلف",
                t.category,
                t.priority,
                t.status,
                t.created_at.strftime("%Y-%m-%d %H:%M"),
                t.resolved_at.strftime("%Y-%m-%d %H:%M") if t.resolved_at else "",
            ]
            for t in tix
        ]

    else:  # audit
        title = "تقرير سجل العمليات والمراجعة (Audit Log Report)"
        headers = ["المستخدم", "نوع الإجراء", "المورد", "معرف المورد", "عنوان IP", "التاريخ والوقت"]
        audits = db.query(AuditLog).filter(AuditLog.company_id == target_cid).order_by(AuditLog.created_at.desc()).limit(500).all()
        rows = [
            [
                a.user.username if a.user else "النظام",
                a.action,
                a.resource_type,
                a.resource_id,
                a.ip_address,
                a.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            ]
            for a in audits
        ]

    if format_type in ["excel", "csv"]:
        csv_content = generate_excel_compatible_csv(headers, rows)
        filename = f"{report_type}_report_{datetime.now().strftime('%Y%m%d_%H%M')}.csv"
        return Response(
            content=csv_content.encode("utf-8-sig"),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )
    else:  # html / pdf
        html_content = generate_html_printable_report(title, headers, rows, company_name, branding.logo if branding else None)
        return Response(content=html_content, media_type="text/html; charset=utf-8")


class ImportPayload(BaseModel):
    module: str  # assets | employees | infrastructure
    rows: List[Dict[str, Any]]
    dry_run: bool = False


@router.post("/import")
def import_data(
    payload: ImportPayload,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Import data from Excel/CSV mapped rows into assets, employees, or infrastructure."""
    module = payload.module.lower().strip()
    if module not in ["assets", "employees", "infrastructure"]:
        raise HTTPException(status_code=400, detail="الوحدة المحددة غير مدعومة للاستيراد")

    imported_count = 0
    skipped_count = 0
    errors: List[str] = []

    if module == "assets":
        for idx, row in enumerate(payload.rows, start=1):
            code = str(row.get("كود الأصل") or row.get("asset_code") or "").strip()
            name = str(row.get("اسم الأصل") or row.get("asset_name") or row.get("name") or "").strip()
            if not name:
                errors.append(f"الصف {idx}: اسم الأصل مطلوب")
                skipped_count += 1
                continue

            if not code:
                code = f"AST-IMP-{uuid.uuid4().hex[:6].upper()}"

            existing = db.query(TechnicalAsset).filter(
                TechnicalAsset.company_id == active_cid,
                TechnicalAsset.asset_code == code,
            ).first()
            if existing:
                errors.append(f"الصف {idx}: كود الأصل {code} مسجل مسبقاً")
                skipped_count += 1
                continue

            if not payload.dry_run:
                asset = TechnicalAsset(
                    company_id=active_cid,
                    asset_code=code,
                    asset_name=name,
                    asset_type=str(row.get("النوع") or row.get("asset_type") or "Other").strip(),
                    brand=str(row.get("الماركة") or row.get("brand") or "").strip() or None,
                    model=str(row.get("الموديل") or row.get("model") or "").strip() or None,
                    serial_number=str(row.get("الرقم التسلسلي") or row.get("serial_number") or "").strip() or None,
                    condition=str(row.get("الحالة") or row.get("condition") or "Good").strip(),
                    status="Available",
                    notes="تم الاستيراد آلياً من ملف بيانات",
                )
                db.add(asset)
            imported_count += 1

    elif module == "employees":
        for idx, row in enumerate(payload.rows, start=1):
            emp_num = str(row.get("الرقم الوظيفي") or row.get("employee_number") or "").strip()
            name = str(row.get("الاسم") or row.get("اسم الموظف") or row.get("full_name") or "").strip()
            if not name:
                errors.append(f"الصف {idx}: اسم الموظف مطلوب")
                skipped_count += 1
                continue

            if not emp_num:
                emp_num = f"EMP-IMP-{uuid.uuid4().hex[:5].upper()}"

            existing = db.query(Employee).filter(
                Employee.company_id == active_cid,
                Employee.employee_number == emp_num,
            ).first()
            if existing:
                errors.append(f"الصف {idx}: الرقم الوظيفي {emp_num} مسجل مسبقاً")
                skipped_count += 1
                continue

            if not payload.dry_run:
                emp = Employee(
                    company_id=active_cid,
                    employee_number=emp_num,
                    full_name=name,
                    job_title=str(row.get("المسمى الوظيفي") or row.get("job_title") or "").strip() or None,
                    email=str(row.get("البريد الإلكتروني") or row.get("email") or "").strip() or None,
                    phone=str(row.get("الهاتف") or row.get("phone") or "").strip() or None,
                    employment_status="Active",
                )
                db.add(emp)
            imported_count += 1

    elif module == "infrastructure":
        for idx, row in enumerate(payload.rows, start=1):
            name = str(row.get("اسم الجهاز") or row.get("device_name") or row.get("name") or "").strip()
            dev_type = str(row.get("نوع الجهاز") or row.get("device_type") or "Server").strip()
            if not name:
                errors.append(f"الصف {idx}: اسم جهاز البنية التحتية مطلوب")
                skipped_count += 1
                continue

            if not payload.dry_run:
                dev = ITInfrastructure(
                    company_id=active_cid,
                    device_name=name,
                    device_type=dev_type,
                    manufacturer=str(row.get("الشركة المصنعة") or row.get("manufacturer") or "").strip() or None,
                    model=str(row.get("الموديل") or row.get("model") or "").strip() or None,
                    serial_number=str(row.get("الرقم التسلسلي") or row.get("serial_number") or "").strip() or None,
                    hostname=str(row.get("اسم المضيف") or row.get("hostname") or "").strip() or None,
                    management_ip=str(row.get("IP الإدارة") or row.get("management_ip") or "").strip() or None,
                    location=str(row.get("الموقع") or row.get("location") or "").strip() or None,
                    status="Operational",
                )
                db.add(dev)
            imported_count += 1

    if not payload.dry_run and imported_count > 0:
        db.commit()
        log_audit(
            db=db,
            action="IMPORT",
            resource_type=module.capitalize(),
            resource_id="BULK",
            user_id=current_user.id,
            company_id=active_cid,
            new_values={"count": imported_count, "module": module},
        )

    return success_response(
        data={
            "module": module,
            "imported_count": imported_count,
            "skipped_count": skipped_count,
            "errors": errors,
            "dry_run": payload.dry_run,
        },
        message=f"تم فحص/استيراد البيانات بنجاح: {imported_count} سجل جديد ({skipped_count} متخطى)",
    )

