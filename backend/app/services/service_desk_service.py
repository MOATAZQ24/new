# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""
Enterprise IT Service Desk Service Engine.
Handles:
- Service Catalog provisioning and schema-driven dynamic form validation
- Multi-stage approval routing (Manager, IT Security, Finance)
- Declarative workflow state transitions & automated SLA monitoring
- Seed data defaults for enterprise service desk catalogs and SLA tiers
"""

import os
import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session

from app.models.company import Company
from app.models.ticket import (
    HelpDeskTicket,
    TicketComment,
    ServiceCatalogItem,
    TicketApproval,
    ServiceWorkflow,
    SlaPolicy,
)
from app.models.user import User, Employee
from app.services.audit_service import log_audit
from app.services.notification_service import create_notification


DEFAULT_CATALOG_ITEMS = [
    {
        "category": "Hardware",
        "name_ar": "صيانة حاسب آلي محمول أو مكتبي",
        "name_en": "Laptop or Desktop Hardware Maintenance",
        "description_ar": "الإبلاغ عن أعطال العتاد (شاشة، لوحة مفاتيح، بطارية، ارتفاع حرارة) لأجهزة العمل المسندة للموظف.",
        "icon": "Laptop",
        "default_priority": "High",
        "estimated_duration_hours": 8,
        "requires_approval": False,
        "workflow_template": "Standard_Incident",
        "display_order": 1,
        "dynamic_form_schema": {
            "fields": [
                {
                    "name": "hardware_type",
                    "label_ar": "نوع الجهاز المتأثر",
                    "type": "select",
                    "required": True,
                    "options": ["كمبيوتر محمول (Laptop)", "كمبيوتر مكتبي (Desktop)", "محطة عمل (Workstation)", "شاشة خارجية (Monitor)"],
                },
                {
                    "name": "symptom_category",
                    "label_ar": "العَرَض أو طبيعة العطل",
                    "type": "select",
                    "required": True,
                    "options": ["الجهاز لا يعمل نهائياً", "شاشة زرقاء / إعادة تشغيل متكررة", "بطء شديد وتجمد مفاجئ", "تلف في كابل الطاقة أو البطارية", "عطل لوحة المفاتيح أو لوحة اللمس"],
                },
                {
                    "name": "is_power_connected",
                    "label_ar": "هل تم التأكد من توصيل محول الطاقة ومصدر الكهرباء؟",
                    "type": "radio",
                    "required": True,
                    "options": ["نعم، موصول ويعمل", "لا، لم يتم التأكد"],
                },
            ]
        },
    },
    {
        "category": "Hardware",
        "name_ar": "طلب استبدال جهاز معطوب أو ترقية عتاد",
        "name_en": "Defective Hardware Replacement Request",
        "description_ar": "طلب استبدال جهاز غير قابل للإصلاح بجهاز بديل من العهد المتاحة بعد الفحص الفني.",
        "icon": "RefreshCw",
        "default_priority": "High",
        "estimated_duration_hours": 24,
        "requires_approval": True,
        "approval_type": "Manager",
        "workflow_template": "Approval_Gated",
        "display_order": 2,
        "dynamic_form_schema": {
            "fields": [
                {
                    "name": "replacement_reason",
                    "label_ar": "سبب طلب الاستبدال",
                    "type": "select",
                    "required": True,
                    "options": ["تلف كلي غير اقتصادي للإصلاح", "قدم الجهاز وعدم توافقه مع متطلبات العمل", "فقدان أو سرقة مع تقرير رسمي", "حاجة لترقية المواصفات لمشروع عاجل"],
                },
                {
                    "name": "data_backup_status",
                    "label_ar": "حالة النسخ الاحتياطي لملفات العمل الحالية",
                    "type": "select",
                    "required": True,
                    "options": ["تم رفع كافة الملفات على السحابة (OneDrive/SharePoint)", "توجد ملفات محلية تحتاج نقل فني", "القرص الصلب معطوب لا يستجيب"],
                },
                {
                    "name": "business_impact",
                    "label_ar": "الأثر على سير العمل",
                    "type": "textarea",
                    "required": True,
                    "placeholder": "اشرح الأثر اليومي على المهام والتقارير في حال تأخر الاستبدال...",
                },
            ]
        },
    },
    {
        "category": "Network",
        "name_ar": "الإبلاغ عن انقطاع أو بطء شبكة الإنترنت",
        "name_en": "Network Connectivity Outage or Latency",
        "description_ar": "مشاكل الاتصال بالإنترنت، عدم الوصول للمواقع المصرحة، أو انقطاع الاتصال اللاسلكي Wi-Fi.",
        "icon": "Wifi",
        "default_priority": "Urgent",
        "estimated_duration_hours": 4,
        "requires_approval": False,
        "workflow_template": "Standard_Incident",
        "display_order": 3,
        "dynamic_form_schema": {
            "fields": [
                {
                    "name": "connection_type",
                    "label_ar": "طريقة الاتصال المستخدمة",
                    "type": "select",
                    "required": True,
                    "options": ["شبكة لاسلكية (Wi-Fi المكتبي)", "كيبل شبكة جداري (Ethernet)", "شبكة الضيوف (Guest Wi-Fi)"],
                },
                {
                    "name": "scope_of_issue",
                    "label_ar": "نطاق المشكلة",
                    "type": "select",
                    "required": True,
                    "options": ["جهازي فقط", "جميع الزملاء في نفس المكتب / الغرفة", "كامل القسم أو الطابق"],
                },
                {
                    "name": "error_message",
                    "label_ar": "رمز الخطأ أو الرسالة الظاهرة (إن وُجدت)",
                    "type": "text",
                    "required": False,
                    "placeholder": "مثال: No Internet Access, DNS Probe Finished, IP Conflict",
                },
            ]
        },
    },
    {
        "category": "Access",
        "name_ar": "طلب صلاحية دخول لنظام داخلي أو مجلد مشترك",
        "name_en": "Internal System / Shared Folder Access Request",
        "description_ar": "طلب منح أو تعديل صلاحيات الوصول على الخوادم الداخلية، المجلدات المشتركة، أو التطبيقات المحمية.",
        "icon": "ShieldCheck",
        "default_priority": "Medium",
        "estimated_duration_hours": 12,
        "requires_approval": True,
        "approval_type": "Manager",
        "workflow_template": "Approval_Gated",
        "display_order": 4,
        "dynamic_form_schema": {
            "fields": [
                {
                    "name": "target_system",
                    "label_ar": "النظام أو المورد المطلوب الصلاحية عليه",
                    "type": "select",
                    "required": True,
                    "options": ["المجلد المشترك للقسم (Shared Drive)", "نظام إدارة العمليات Investor Gate OS", "بوابة التقارير المالية والإدارية", "خادم قواعد البيانات التجريبي", "شبكة VPN للعمل عن بُعد"],
                },
                {
                    "name": "access_level",
                    "label_ar": "مستوى الصلاحية المطلوب",
                    "type": "select",
                    "required": True,
                    "options": ["قراءة فقط (Read-Only)", "قراءة وكتابة وتعديل (Read/Write)", "صلاحيات مسؤول نظام كامل (Admin Access)"],
                },
                {
                    "name": "business_justification",
                    "label_ar": "المبرر العملي والمشروع المرتبط",
                    "type": "textarea",
                    "required": True,
                    "placeholder": "اذكر سبب الحاجة للصلاحية، اسم المشرف المباشر، والمدة المتوقعة للاستخدام...",
                },
            ]
        },
    },
    {
        "category": "Software",
        "name_ar": "تثبيت أو ترخيص برمجيات وأدوات هندسية",
        "name_en": "Software Installation or License Provisioning",
        "description_ar": "طلب تثبيت حزم البرمجيات المعتمدة للعمل، برامج التصميم، البرمجيات الإحصائية، أو تجديد الرخص.",
        "icon": "Box",
        "default_priority": "Medium",
        "estimated_duration_hours": 16,
        "requires_approval": True,
        "approval_type": "IT_Security",
        "workflow_template": "Approval_Gated",
        "display_order": 5,
        "dynamic_form_schema": {
            "fields": [
                {
                    "name": "software_name",
                    "label_ar": "اسم البرنامج المطلوب",
                    "type": "select",
                    "required": True,
                    "options": ["Microsoft Office 365 ProPlus", "Adobe Acrobat Pro / Creative Cloud", "Visual Studio Code & Dev Tools", "حزمة أدوات الأمن السيبراني المعتمدة", "برنامج آخر يتطلب مراجعة الأمان"],
                },
                {
                    "name": "license_type",
                    "label_ar": "نوع الترخيص المتوقع",
                    "type": "select",
                    "required": True,
                    "options": ["اشتراك سحابي للشركة (Enterprise Cloud)", "ترخيص دائم متاح (Standard License)", "نسخة مجانية مفتوحة المصدر معتمدة"],
                },
            ]
        },
    },
    {
        "category": "Email",
        "name_ar": "مشاكل البريد الإلكتروني والتقويم المؤسسي",
        "name_en": "Corporate Email & Calendar Technical Support",
        "description_ar": "الدعم الفني لصناديق البريد المشتركة، تعذر إرسال أو استقبال الرسائل، ومزامنة التقويم على الهواتف.",
        "icon": "Mail",
        "default_priority": "High",
        "estimated_duration_hours": 4,
        "requires_approval": False,
        "workflow_template": "Standard_Incident",
        "display_order": 6,
        "dynamic_form_schema": {
            "fields": [
                {
                    "name": "mailbox_affected",
                    "label_ar": "صندوق البريد المتأثر",
                    "type": "text",
                    "required": True,
                    "placeholder": "user@investorgate.com.sa أو اسم الصندوق المشترك",
                },
                {
                    "name": "issue_nature",
                    "label_ar": "طبيعة الخلل في البريد",
                    "type": "select",
                    "required": True,
                    "options": ["تعذر إرسال الرسائل (رسائل معلقة في الصادر)", "عدم استلام رسائل من جهات خارجية", "البريد ممتلئ وتجاوز الحصة (Mailbox Quota Full)", "مشكلة مزامنة على الهاتف الذكي", "استلام رسائل تصيد مشبوهة (Phishing Alert)"],
                },
            ]
        },
    },
]


def seed_service_desk_defaults(db: Session, company_id: uuid.UUID):
    """Provisions default enterprise service catalog items and SLA policies for a company."""
    # 1. Seed Service Catalog Items
    existing_count = db.query(ServiceCatalogItem).filter(ServiceCatalogItem.company_id == company_id).count()
    if existing_count == 0:
        for idx, item in enumerate(DEFAULT_CATALOG_ITEMS):
            cat_item = ServiceCatalogItem(
                company_id=company_id,
                category=item["category"],
                name_ar=item["name_ar"],
                name_en=item["name_en"],
                description_ar=item["description_ar"],
                description_en=item.get("name_en"),
                icon=item["icon"],
                default_priority=item["default_priority"],
                estimated_duration_hours=item["estimated_duration_hours"],
                requires_approval=item["requires_approval"],
                approval_type=item.get("approval_type"),
                dynamic_form_schema=item.get("dynamic_form_schema"),
                workflow_template=item.get("workflow_template", "Standard_Incident"),
                is_active=True,
                display_order=idx + 1,
            )
            db.add(cat_item)

    # 2. Seed Default SLA Policies
    sla_count = db.query(SlaPolicy).filter(SlaPolicy.company_id == company_id).count()
    if sla_count == 0:
        default_slas = [
            {"name": "SLA - حرجة وعاجلة جداً (Critical)", "priority": "Critical", "first_response_minutes": 15, "resolution_minutes": 240, "escalation_notify_minutes": 30},
            {"name": "SLA - عاجلة (Urgent)", "priority": "Urgent", "first_response_minutes": 30, "resolution_minutes": 480, "escalation_notify_minutes": 60},
            {"name": "SLA - مرتفعة (High)", "priority": "High", "first_response_minutes": 60, "resolution_minutes": 1440, "escalation_notify_minutes": 120},
            {"name": "SLA - متوسطة (Medium)", "priority": "Medium", "first_response_minutes": 240, "resolution_minutes": 4320, "escalation_notify_minutes": 480},
            {"name": "SLA - اعتيادية منخفضة (Low)", "priority": "Low", "first_response_minutes": 480, "resolution_minutes": 7200, "escalation_notify_minutes": 960},
        ]
        for sla in default_slas:
            db.add(SlaPolicy(
                company_id=company_id,
                name=sla["name"],
                priority=sla["priority"],
                first_response_minutes=sla["first_response_minutes"],
                resolution_minutes=sla["resolution_minutes"],
                escalation_notify_minutes=sla["escalation_notify_minutes"],
                business_hours_only=True,
                is_active=True,
            ))

    # 3. Seed Default Workflow Definition
    wf_count = db.query(ServiceWorkflow).filter(ServiceWorkflow.company_id == company_id).count()
    if wf_count == 0:
        default_nodes = [
            {"id": "node-1", "type": "start", "label": "تقديم التذكرة (Submitted)", "position": {"x": 50, "y": 150}},
            {"id": "node-2", "type": "triage", "label": "الفرز والإسناد (Triage & Assignment)", "position": {"x": 250, "y": 150}},
            {"id": "node-3", "type": "work", "label": "قيد المعالجة (In Progress)", "position": {"x": 480, "y": 150}},
            {"id": "node-4", "type": "approval", "label": "اعتماد إداري (Manager Approval)", "position": {"x": 480, "y": 300}},
            {"id": "node-5", "type": "resolved", "label": "تم الحل (Resolved)", "position": {"x": 720, "y": 150}},
            {"id": "node-6", "type": "closed", "label": "إغلاق رسمي (Closed)", "position": {"x": 940, "y": 150}},
        ]
        default_transitions = [
            {"from": "Open", "to": "Assigned", "action": "assign"},
            {"from": "Assigned", "to": "In Progress", "action": "start_work"},
            {"from": "In Progress", "to": "Pending Approval", "action": "request_approval"},
            {"from": "Pending Approval", "to": "In Progress", "action": "approve"},
            {"from": "Pending Approval", "to": "Rejected", "action": "reject"},
            {"from": "In Progress", "to": "Waiting for User", "action": "request_info"},
            {"from": "Waiting for User", "to": "In Progress", "action": "provide_info"},
            {"from": "In Progress", "to": "Resolved", "action": "resolve"},
            {"from": "Resolved", "to": "Closed", "action": "close"},
            {"from": "Resolved", "to": "In Progress", "action": "reopen"},
        ]
        db.add(ServiceWorkflow(
            company_id=company_id,
            workflow_key="enterprise_standard",
            name_ar="مسار الدعم والخدمات التقنية الموحد",
            name_en="Unified Enterprise Service Desk Workflow",
            description="مسار العمل القياسي المتوافق مع ITIL 4 للاستجابة والاعتماد وحل التذاكر.",
            version=1,
            status="Published",
            nodes_json=default_nodes,
            transitions_json=default_transitions,
            is_active=True,
        ))

    db.commit()


def process_ticket_approval(
    db: Session,
    ticket: HelpDeskTicket,
    approval_id: uuid.UUID,
    decision: str,  # "Approved" or "Rejected"
    decider_user: User,
    notes: Optional[str] = None,
) -> TicketApproval:
    """Processes an approval decision on a service request."""
    appr = db.query(TicketApproval).filter(
        TicketApproval.id == approval_id,
        TicketApproval.ticket_id == ticket.id,
        TicketApproval.company_id == ticket.company_id,
    ).first()

    if not appr:
        raise ValueError("سجل الاعتماد غير موجود أو غير مرتبط بالتذكرة.")

    if appr.status != "Pending":
        raise ValueError(f"هذا الاعتماد تمت معالجته مسبقاً بحالة ({appr.status}).")

    appr.status = decision
    appr.decision_notes = notes
    appr.decided_at = datetime.utcnow()
    appr.decided_by_id = decider_user.id

    # Check if there are further pending approval stages
    remaining_pending = db.query(TicketApproval).filter(
        TicketApproval.ticket_id == ticket.id,
        TicketApproval.status == "Pending",
        TicketApproval.id != appr.id,
    ).count()

    if decision == "Rejected":
        ticket.approval_status = "Rejected"
        ticket.status = "Cancelled"
        ticket.notes = (ticket.notes or "") + f"\n[تم رفض طلب الاعتماد]: {notes or 'بدون مبرر إضافي'}"
    elif decision == "Approved":
        if remaining_pending == 0:
            ticket.approval_status = "Approved"
            if ticket.status in ["Open", "Pending Approval"]:
                ticket.status = "Assigned"
        else:
            ticket.approval_status = "Pending"

    db.commit()
    return appr
