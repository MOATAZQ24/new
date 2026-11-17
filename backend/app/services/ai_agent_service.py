"""Investor Gate OS AI Action Agent Orchestrator.

Coordinates:
- Company-scoped Google Gemini REST API function calling (when configured & enabled)
- Resilient bilingual (Arabic/English) deterministic NLU tool planner fallback (air-gapped / no-key / API fallback)
- Real-time step progress emission for compact UI status updates
- Server-side idempotency caching & high-impact action confirmation tokens
- Grounded result formatting strictly from verified backend tool responses
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import secrets
import urllib.error
import urllib.request
import uuid
from datetime import date, datetime, timedelta
from typing import Any, Callable, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.core.rbac import Action, Module, has_module_permission
from app.models.ai_agent import AIAgentExecution
from app.models.integration import IntegrationConfig
from app.models.user import User
from app.schemas.ai_agent import AgentChatRequest
from app.services import ai_agent_tools as tools
from app.services import arabic_nlp, task_workflow as wf
from app.services.audit_service import log_audit

logger = logging.getLogger(__name__)

DEFAULT_GEMINI_MODEL = "gemini-3-flash-preview"
FALLBACK_GEMINI_MODELS = ("gemini-3-flash-preview", "gemini-flash-latest", "gemini-2.5-flash-lite")

FUNCTION_DECLARATIONS: List[Dict[str, Any]] = [
    {
        "name": "resolve_employee",
        "description": "Search the active company employee directory by clean human name (without prefixes like 'الموظف' or 'employee') before assigning tasks or sending notifications. Always call this first when an employee name is referenced or searched.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "name": {"type": "STRING", "description": "Clean Arabic or English employee name (strip honorifics/titles like الموظف, الأستاذ, employee)"}
            },
            "required": ["name"],
        },
    },
    {
        "name": "create_task",
        "description": "Prepare and (once confirmed) create ONE operational IT task for a single assignee and optionally notify them. Never put single-letter fragments like 'ة' in title.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "title": {"type": "STRING", "description": "Clear complete actionable task title"},
                "description": {"type": "STRING", "description": "Optional detailed task description"},
                "assignee_id": {"type": "STRING", "description": "Resolved UUID of the employee if already resolved"},
                "assignee_name": {"type": "STRING", "description": "Clean employee name without honorifics"},
                "priority": {"type": "STRING", "description": "Low, Medium, High, or Urgent"},
                "due_date": {"type": "STRING", "description": "ISO YYYY-MM-DD, today, or tomorrow"},
                "notify_employee": {"type": "BOOLEAN", "description": "Whether to notify the assignee"},
                "explicit_notify": {"type": "BOOLEAN", "description": "True when user explicitly asked to send a notification"},
            },
            "required": ["title"],
        },
    },
    {
        "name": "create_tasks_batch",
        "description": "Prepare and (once confirmed) create multiple distinct tasks OR assign one task across multiple employees. Use whenever the user asks for multiple tasks or multiple assignees.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "tasks": {
                    "type": "ARRAY",
                    "description": "List of task objects when tasks have different titles or different assignees",
                    "items": {
                        "type": "OBJECT",
                        "properties": {
                            "title": {"type": "STRING"},
                            "assignee_name": {"type": "STRING"},
                            "priority": {"type": "STRING"},
                            "due_date": {"type": "STRING"},
                            "notify_employee": {"type": "BOOLEAN"},
                        },
                        "required": ["title"],
                    },
                },
                "title": {"type": "STRING", "description": "Shared task title when assigning one task to multiple employees"},
                "assignee_names": {
                    "type": "ARRAY",
                    "description": "List of employee names for shared multi-assignment",
                    "items": {"type": "STRING"},
                },
                "priority": {"type": "STRING"},
                "due_date": {"type": "STRING"},
            },
        },
    },
    {
        "name": "update_task_status",
        "description": "Transition an existing task status (complete, start, accept, clarify, reject, cancel, reopen).",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "task_reference": {"type": "STRING", "description": "Task ref like TASK-1234ABCD, UUID, or title keywords"},
                "target_status": {"type": "STRING", "description": "Desired state or action: complete, start, accept, clarify, reject, cancel, reopen"},
                "reason": {"type": "STRING", "description": "Optional reason when rejecting, clarifying, or cancelling"},
            },
            "required": ["target_status"],
        },
    },
    {
        "name": "send_employee_notification",
        "description": "Send a direct notification message to an employee via In-App + verified Telegram account.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "assignee_name": {"type": "STRING", "description": "Employee name"},
                "employee_id": {"type": "STRING", "description": "Resolved employee UUID"},
                "title": {"type": "STRING", "description": "Short notification subject"},
                "message": {"type": "STRING", "description": "Notification body text"},
                "ticket_number": {"type": "STRING", "description": "Optional referenced Help Desk ticket number (e.g. 125 or TCK-2026-0125)"},
                "priority": {"type": "STRING", "description": "Low, Normal, High, or Urgent"},
            },
            "required": ["message"],
        },
    },
    {
        "name": "create_ticket",
        "description": "Create a new IT Help Desk ticket with automatic AI categorization and priority suggestion.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "issue_title": {"type": "STRING", "description": "Title of the IT issue"},
                "issue_description": {"type": "STRING", "description": "Detailed description of the problem"},
                "category": {"type": "STRING", "description": "Hardware, Software, Network, Email, Access, or Other"},
                "priority": {"type": "STRING", "description": "Low, Medium, High, or Urgent"},
            },
            "required": ["issue_title"],
        },
    },
    {
        "name": "convert_ticket_to_task",
        "description": "Convert an existing Help Desk ticket into an operational task and optionally assign it.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "ticket_number": {"type": "STRING", "description": "Ticket reference or ID (e.g. TCK-2026-0001 or 125)"},
                "assignee_name": {"type": "STRING", "description": "Technician/employee name to assign"},
                "assignee_id": {"type": "STRING", "description": "Resolved employee UUID"},
            },
        },
    },
    {
        "name": "query_operations",
        "description": "Query overdue tasks, filtered tasks list, Help Desk tickets, technical assets, or generate an operational summary.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "query_type": {
                    "type": "STRING",
                    "description": "One of: overdue_tasks, tasks, tickets, assets, operational_summary",
                },
                "search": {"type": "STRING", "description": "Optional search keyword or reference"},
                "filter_mode": {"type": "STRING", "description": "my or team"},
                "status": {"type": "STRING", "description": "Optional status filter: active, new, in_progress, waiting, completed, rejected, cancelled, overdue"},
                "assignee_name": {"type": "STRING", "description": "Optional employee name to filter tasks by assignee"},
                "limit": {"type": "INTEGER", "description": "Maximum records to return (default 25, max 50)"},
            },
            "required": ["query_type"],
        },
    },
]


def resolve_company_gemini_config(db: Session, company_id: uuid.UUID) -> Tuple[bool, str, str]:
    """Read company-specific Gemini integration config without exposing secrets."""
    cfg = (
        db.query(IntegrationConfig)
        .filter(
            IntegrationConfig.company_id == company_id,
            IntegrationConfig.service_name == "gemini",
        )
        .first()
    )
    if cfg:
        data = cfg.config_data or {}
        api_key = str(data.get("api_key") or "").strip()
        model = str(data.get("model") or DEFAULT_GEMINI_MODEL).strip() or DEFAULT_GEMINI_MODEL
        if cfg.is_enabled and len(api_key) > 20:
            return True, api_key, model
        # If admin explicitly disabled Gemini for this company, respect that decision
        if cfg.is_enabled is False and api_key:
            return False, "", model

    env_key = os.getenv("GEMINI_API_KEY", "").strip()
    if len(env_key) > 20 and os.getenv("AI_AGENT_DISABLE_LIVE_GEMINI", "").lower() != "true":
        return True, env_key, os.getenv("GEMINI_MODEL", DEFAULT_GEMINI_MODEL)
    return False, "", DEFAULT_GEMINI_MODEL


def _step_to_dict(step: Dict[str, Any], collected: List[Dict[str, Any]]) -> None:
    for idx, existing in enumerate(collected):
        if existing["key"] == step["key"]:
            collected[idx] = step
            return
    collected.append(step)


# ── Bilingual Offline Tool Planner (Fallback / Air-gapped) ──────────────────

def _strip_polite_wrappers(text: str) -> str:
    cleaned = arabic_nlp.repair_missing_spaces_and_typos(text.strip()).rstrip(".!؟?")
    cleaned = re.sub(r"^(من فضلك|لو سمحت|رجاءً|رجاء|ممكن|يا ليت|ياليت|ابغى|أبغى|ابي|أبي|اريد|أريد|please|kindly)\s+", "", cleaned, flags=re.I)
    return cleaned.strip()


def _extract_date_from_text(text: str) -> Tuple[Optional[str], str]:
    return arabic_nlp.extract_natural_date_riyadh(text)


def _extract_priority_from_text(text: str) -> Tuple[str, str]:
    low = text.lower()
    if re.search(r"(عاجلة?|حرجة?|طارئة?|\burgent\b|\bcritical\b)", low):
        cleaned = re.sub(r"(بأولوية\s+)?(عاجلة?|حرجة?|طارئة?|\burgent\b|\bcritical\b)", "", text, flags=re.I)
        return "Urgent", cleaned
    if re.search(r"(أولوية\s+(مرتفعة|عالية)|\bhigh priority\b|\bhigh\b)", low):
        cleaned = re.sub(r"(ب?أولوية\s+(مرتفعة|عالية)|\bhigh priority\b)", "", text, flags=re.I)
        return "High", cleaned
    if re.search(r"(أولوية\s+منخفضة|\blow priority\b)", low):
        cleaned = re.sub(r"(ب?أولوية\s+منخفضة|\blow priority\b)", "", text, flags=re.I)
        return "Low", cleaned
    return "Medium", text


def _parse_single_task_clause(
    clause: str,
    default_due: Optional[str] = None,
    default_prio: str = "Medium",
    default_assignee: Optional[str] = None,
    explicit_notify: bool = False,
) -> Optional[Dict[str, Any]]:
    work = re.sub(
        r"^(?:(?:و?\s*)?(?:أنشئ|انشئ|أنشي|انشي|إنشاء|انشاء|إضافة|أضف|اضف|سج[ّ]?ل|create|add|assign|new)\s+(?:a\s+|new\s+)?(?:مهمة|task)\s*)+",
        "",
        clause.strip(),
        flags=re.I,
    ).strip()
    work = re.sub(r"^(?:مهمة\s*:?\s*|task\s*:?\s*|\d+[\).\-\s]+)", "", work, flags=re.I).strip()
    if not work:
        return None

    due_token, work = _extract_date_from_text(work)
    if due_token == "after_tomorrow_iso":
        due_token = (date.today() + timedelta(days=2)).isoformat()
    prio_val, work = _extract_priority_from_text(work)
    assignee_name = default_assignee
    title = work

    # Explicit delimiter (supports 1-4 word names + optional leading role keyword)
    m_ar_sep = re.match(
        r"^(?:لـ\s*|للموظفة?\s+|إلى\s+الموظفة?\s+|الى\s+الموظفة?\s+|لـ\s*الموظفة?\s+|للفني\s+|إلى\s+|الى\s+|ل)"
        r"([^\s].{0,55}?)\s+(?:بعنوان\s+|بخصوص\s+|عن\s+|كي\s+|لأجل\s+|:\s*)\s*(.+)$",
        work,
    )
    m_ar = m_ar_sep or re.match(
        r"^(?:لـ\s*|للموظفة?\s+|إلى\s+الموظفة?\s+|الى\s+الموظفة?\s+|لـ\s*الموظفة?\s+|للفني\s+|إلى\s+|الى\s+|ل)"
        r"([^\s]+?(?:\s+[^\s]+?)?)\s+(?:لـ\s*|ل(?=[أاإآء-ي]{3,}))\s*(.+)$",
        work,
    )
    if m_ar:
        cand_emp = tools.clean_employee_query(m_ar.group(1))
        if cand_emp:
            assignee_name = cand_emp
            title = m_ar.group(2).strip()
    else:
        m_en = re.match(r"^(?:for|to)\s+([^\s][^:]{1,45}?)\s+(?:to|regarding|about|for|:)\s+(.+)$", work, flags=re.I)
        if m_en:
            cand_emp = tools.clean_employee_query(m_en.group(1))
            if cand_emp:
                assignee_name = cand_emp
                title = m_en.group(2).strip()
        else:
            # Handle trailing "لمعتز قاسم" at end of clause when title came first
            m_tail = re.match(
                r"^(.+?)\s+(?:لـ\s*|للموظفة?\s+|إلى\s+الموظفة?\s+|الى\s+|for\s+(?:employee\s+)?)([^\s.,،]+(?:\s+[^\s.,،]+){0,2})$",
                work,
                flags=re.I,
            )
            if m_tail:
                cand_emp = tools.clean_employee_query(m_tail.group(2))
                if cand_emp and len(m_tail.group(1).strip()) >= 3:
                    title = m_tail.group(1).strip()
                    assignee_name = cand_emp

    clean_title = tools._sanitize_task_title(title)
    if not clean_title:
        return None
    return {
        "title": clean_title,
        "assignee_name": assignee_name,
        "priority": prio_val if prio_val != "Medium" else default_prio,
        "due_date": due_token or default_due,
        "notify_employee": True,
        "explicit_notify": explicit_notify,
    }


def _parse_multi_task_command(text: str) -> Optional[Dict[str, Any]]:
    """Parse multi-task, dialectal, or multi-assignee commands cleanly without inventing tasks or producing 'ة'."""
    norm_text = arabic_nlp.repair_missing_spaces_and_typos(text)
    low = norm_text.lower()
    has_create_verb = bool(
        re.search(
            r"(أنشئ|انشئ|أنشي|انشي|إنشاء|انشاء|إضافة|أضف|اضف|سج[ّ]?ل|اسند|أسند|كلف|كلّف|سوي|سوّي|اعمل|حط|ضيف|وجه|create|add|assign|make)",
            low,
        )
    )
    if not has_create_verb:
        return None

    explicit_notify = bool(re.search(r"(وأرسل|ارسل|أرسل|تنبيه|إشعار|اشعار|notify)", low))
    work = re.sub(r"(?:\band\s+|و?\s*)(?:أرسل|ارسل|قم بإرسال|بلغ(?:هم|ه|ها)?|نبه(?:هم|ه|ها)?|notify)\b.*$", "", norm_text, flags=re.I).strip()
    due_global, work = _extract_date_from_text(work)
    prio_global, work = _extract_priority_from_text(work)

    num_words = "|".join(sorted(arabic_nlp.ARABIC_NUMBER_WORDS.keys(), key=len, reverse=True))
    # Case 0: Dialectal "اسند لمعتز اربع مهمات يصلح السرفر ويشيك الشبكه..." (verb + ל-employee + counted tasks + clauses)
    m_dialect_emp_first = re.match(
        rf"^(?:أنشئ|انشئ|إنشاء|انشاء|أضف|اضف|اسند|أسند|كلف|كلّف|سوي|سوّي|اعمل|حط|وجه|assign|create|give)\s+"
        rf"(?:لـ\s*|للموظفة?\s+|إلى\s+الموظفة?\s+|الى\s+|ل|to\s+|for\s+)([^\s،,:]+(?:\s+[^\s،,:]+)*?)\s+"
        rf"(?:(?:عدد\s+)?(?:\d+|{num_words}|عدة|مجموعة)\s+)?(?:مهمتين|مهمتان|مهام|مهمات|مهمة|tasks?)\s*[:،,\-]?\s*(.+)$",
        work,
        flags=re.I,
    )
    if m_dialect_emp_first:
        shared_emp = tools.clean_employee_query(m_dialect_emp_first.group(1))
        clauses = arabic_nlp.extract_dialect_task_clauses(m_dialect_emp_first.group(2))
        if shared_emp and len(clauses) >= 2:
            return {
                "tool": "create_tasks_batch",
                "args": {
                    "tasks": [
                        {
                            "title": c,
                            "assignee_name": shared_emp,
                            "priority": prio_global,
                            "due_date": due_global,
                            "notify_employee": True,
                            "explicit_notify": explicit_notify,
                        }
                        for c in clauses
                    ]
                },
            }
        if shared_emp and len(clauses) == 1:
            return {
                "tool": "create_task",
                "args": {
                    "title": clauses[0],
                    "assignee_name": shared_emp,
                    "priority": prio_global,
                    "due_date": due_global,
                    "notify_employee": True,
                    "explicit_notify": explicit_notify,
                },
            }

    # Case A: Repeated "مهمة ... ومهمة ..." OR plural/counted marker ("مهمتين", "مهام", "اربع مهمات", "4 مهام", "2 tasks")
    is_explicit_plural = bool(
        re.search(
            rf"(مهمتين|مهمتان|(?:عدة|مجموعة|\d+|{num_words})\s+(?:مهام|مهمات|مهمة)|مهام\s+(?:متعددة|جديدة|لـ|ل|إلى|عن|:)|multiple\s+tasks|\d+\s+tasks|\btasks\b)",
            low,
        )
    )
    has_repeated_task_word = len(re.findall(r"(?:^|[\s،,])(?:و\s*)?(?:مهمة|task)\b", low)) >= 2
    if is_explicit_plural or has_repeated_task_word:
        stripped = re.sub(
            rf"^(?:أنشئ|انشئ|أنشي|انشي|إنشاء|انشاء|إضافة|أضف|اضف|سج[ّ]?ل|اسند|أسند|كلف|كلّف|سوي|سوّي|اعمل|create|add|assign|make)\s+"
            rf"(?:عدة\s+|مجموعة\s+|(?:\d+|{num_words})\s+|multiple\s+|several\s+)?"
            rf"(?:مهمتين|مهمتان|مهام|مهمات|مهمة|tasks|task)\s*(?:متعددة|جديدة|منفصلة)?\s*(?:تتضمن|تشمل|كالتالي|وهي|:)?\s*",
            "",
            work,
            flags=re.I,
        ).strip()

        shared_emp = None
        if ":" in stripped and stripped.index(":") < 50:
            head, tail = stripped.split(":", 1)
            if not re.search(r"(مهمة|task)", head, re.I):
                cand = tools.clean_employee_query(head)
                if cand:
                    shared_emp = cand
                    stripped = tail.strip()
        else:
            m_head_emp = re.match(
                r"^(?:لـ\s*|للموظفة?\s+|إلى\s+الموظفة?\s+|الى\s+|for\s+|to\s+|ل)([^\s،,]+(?:\s+[^\s،,]+)?)\s+(?:لـ\s*|بعنوان\s+|:\s*|ل(?=[أاإآء-ي]{3,})|يصلح|يشيك|يفحص|يراجع)\s*(.+)$",
                stripped,
                flags=re.I,
            )
            if m_head_emp and not re.search(r"(مهمة|task)", m_head_emp.group(1), re.I):
                cand = tools.clean_employee_query(m_head_emp.group(1))
                if cand:
                    shared_emp = cand
                    # Keep dialectal verb if it matched in the delimiter
                    verb_match = re.search(r"(يصلح|يشيك|يفحص|يراجع)\s*(.+)$", stripped)
                    stripped = verb_match.group(0).strip() if verb_match else m_head_emp.group(2).strip()

        raw_parts = re.split(
            r"(?:\r?\n+|\s*[،,;]\s*|\s+(?:و\s*)?(?:مهمة|وأخرى|أخرى|task)\s*[:\-]?\s*|\s+\d+[\).\-]\s*|\s+(?:و(?=[أاإآء-ي])|and\s+))",
            stripped,
            flags=re.I,
        )
        parsed_tasks: List[Dict[str, Any]] = []
        for seg in raw_parts:
            for pat, repl in arabic_nlp.DIALECT_ACTION_VERBS:
                seg = pat.sub(repl, seg)
            item = _parse_single_task_clause(
                seg,
                default_due=due_global,
                default_prio=prio_global,
                default_assignee=shared_emp,
                explicit_notify=explicit_notify,
            )
            if item:
                parsed_tasks.append(item)

        if len(parsed_tasks) >= 2:
            return {"tool": "create_tasks_batch", "args": {"tasks": parsed_tasks}}
        if len(parsed_tasks) == 1:
            return {"tool": "create_task", "args": parsed_tasks[0]}
        if is_explicit_plural:
            return {
                "tool": "create_tasks_batch",
                "args": {"tasks": []},
            }

    # Case B: Single task assigned to multiple employees ("أنشئ مهمة لـ معتز وسالم لمراجعة الخادم")
    m_multi_emp = re.match(
        r"^(?:أنشئ|انشئ|أنشي|انشي|إنشاء|انشاء|إضافة|أضف|create|add|assign)\s+(?:a\s+|new\s+)?(?:مهمة|task)\s+"
        r"(?:لكل\s+من\s+|لـ\s*|للموظفين\s+|للموظفة?\s+|إلى\s+|to\s+|for\s+)(.+?)\s+(?:بعنوان\s+|بخصوص\s+|عن\s+|لـ\s*|:\s*|to\s+|ل(?=[أاإآء-ي]{3,}))\s*(.+)$",
        work,
        flags=re.I,
    )
    if m_multi_emp:
        emp_blob = m_multi_emp.group(1).strip()
        raw_emps = [tools.clean_employee_query(x) for x in re.split(r"(?:\s*[،,&]\s*|\s+و\s*|\s+\band\b\s+)", emp_blob, flags=re.I)]
        clean_emps = [e for e in raw_emps if e]
        clean_title = tools._sanitize_task_title(m_multi_emp.group(2))
        if len(clean_emps) >= 2 and clean_title:
            return {
                "tool": "create_tasks_batch",
                "args": {
                    "title": clean_title,
                    "assignee_names": clean_emps,
                    "priority": prio_global,
                    "due_date": due_global,
                    "notify_employee": True,
                    "explicit_notify": explicit_notify,
                },
            }

    return None


def _offline_plan_intent(message: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Deterministic bilingual Arabic/English command parser into verified tool calls."""
    text = _strip_polite_wrappers(message)
    low = text.lower()

    # 0. Explicit Employee Search / Lookup
    m_emp_search = re.match(
        r"^(?:ابحث\s+عن|بحث\s+عن|اعرض\s+بيانات|اعرض\s+ملف|ملف\s+الموظف|بيانات|معلومات|من\s+هو|من\s+هي|تحقق\s+من|find|search|lookup|get|show)\s+(?:عن\s+|for\s+|ملف\s+)?(?:الموظفة?\s+|الزميلة?\s+|المهندسة?\s+|الفني\s+|الأستاذة?\s+|employee\s+|staff\s+|engineer\s+|profile\s+of\s+)?(.+)$",
        text,
        flags=re.I,
    )
    if m_emp_search and re.search(r"(الموظف|موظف|المهندس|مهندس|الفني|الزميل|ملف|employee|staff|engineer|profile|من\s+هو|بيانات|تحقق\s+من)", low) and not re.search(r"(مهم|تذك|إشعار|اشعار|أصل|جهاز|اشتراك|فرع|حضور|task|ticket|notif|asset|subscription|branch|attendance)", low):
        cleaned_emp = tools.clean_employee_query(m_emp_search.group(1))
        return {"tool": "resolve_employee", "args": {"name": cleaned_emp}}

    # 1. Convert Ticket to Task
    if re.search(r"(حو[ّ]?ل|تحويل|convert).*(تذك|ticket)", low) and re.search(r"(مهم|task)", low):
        t_match = re.search(r"(TCK-\d{4}-\d+|\b\d+\b)", text, re.I)
        ticket_number = t_match.group(1) if t_match else None
        if not ticket_number and context and context.get("selected_ticket_id"):
            ticket_number = str(context["selected_ticket_id"])

        assignee_name = None
        if not re.search(r"(الفني المسؤول|المسؤول الحالي|responsible technician)", low):
            m_asg = re.search(
                r"(?:و?أسند(?:ها)?\s*(?:إلى|لـ|ل)\s*|و?أسند(?:ها)?\s+|إلى\s+|لـ\s+|assign(?:\s+to)?\s+|to\s+)(.+)$",
                text,
                re.I,
            )
            if m_asg and "مهمة" not in m_asg.group(1) and "task" not in m_asg.group(1).lower():
                assignee_name = tools.clean_employee_query(m_asg.group(1)) or None

        return {
            "tool": "convert_ticket_to_task",
            "args": {
                "ticket_number": ticket_number,
                "assignee_name": assignee_name,
            },
        }

    # 2. Update Task Status (guard against pure read queries starting with "اعرض"/"show")
    if (
        not re.search(r"^(?:اعرض|عرض|أظهر|اظهر|ابحث|كم|قائمة|show|list|get|find|what|how many)\b", low)
        and re.search(r"(غي[ّ]?ر|تغيير|حد[ّ]?ث|تحديث|اجعل|ضع|أكمل|انه|أنه|إنهاء|ابدأ|اقبل|إلغاء|الغاء|ألغ|رفض|أعد فتح|update|change|mark|complete|close|cancel|reopen)", low)
        and re.search(r"(مهمة|المهمة|task|حالة|مكتمل|مكتملة|قيد التنفيذ|مقبول|ملغاة|ملغية|done|completed|progress|cancelled)", low)
        and not re.search(r"(أنشئ|انشئ|إنشاء|انشاء|اعمل|اضف|أضف|create|new task|add task)", low)
    ):
        task_ref_match = re.search(r"(TASK-[0-9A-Za-z]+)", text, re.I)
        task_ref = task_ref_match.group(1).upper() if task_ref_match else None
        if not task_ref and context and context.get("selected_task_id"):
            task_ref = str(context["selected_task_id"])
        target_status = "complete"
        if re.search(r"(قيد التنفيذ|ابدأ|in progress|start)", low):
            target_status = "start"
        elif re.search(r"(مقبول|قبول|accept)", low):
            target_status = "accept"
        elif re.search(r"(توضيح|clarif|wait)", low):
            target_status = "clarify"
        elif re.search(r"(إلغاء|الغاء|ملغ|ألغ|cancel)", low):
            target_status = "cancel"
        elif re.search(r"(إعادة فتح|اعادة فتح|reopen)", low):
            target_status = "reopen"
        elif re.search(r"(رفض|reject)", low):
            target_status = "reject"

        return {
            "tool": "update_task_status",
            "args": {
                "task_reference": task_ref,
                "selected_task_id": str(context["selected_task_id"]) if context and context.get("selected_task_id") else None,
                "target_status": target_status,
            },
        }

    # 3A. Multi-Task & Multi-Assignee Commands (BEFORE single task or list queries)
    multi_plan = _parse_multi_task_command(text)
    if multi_plan:
        return multi_plan

    # 3B. Create & Assign Single Task
    if re.search(r"(أنشئ|انشئ|أنشي|انشي|إنشاء|انشاء|إضافة|أضف|اضف|سج[ّ]?ل|create|add|assign|new)\s+(?:a\s+|new\s+)?(مهمة|مهمه|task)", low):
        explicit_notify = bool(re.search(r"(وأرسل|ارسل|أرسل|تنبيه|إشعار|اشعار|notify)", low))
        due_token, work = _extract_date_from_text(text)
        if due_token == "after_tomorrow_iso":
            due_token = (date.today() + timedelta(days=2)).isoformat()
        priority_val, work = _extract_priority_from_text(work)
        work = re.sub(r"(?:\band\s+|و?\s*)(?:أرسل|ارسل|قم بإرسال|بلغه?|نبهه?|notify)\b.*$", "", work, flags=re.I).strip()

        parsed_single = _parse_single_task_clause(
            work,
            default_due=due_token,
            default_prio=priority_val,
            explicit_notify=explicit_notify,
        )
        return {
            "tool": "create_task",
            "args": parsed_single or {
                "title": "",
                "assignee_name": None,
                "priority": priority_val,
                "due_date": due_token,
                "notify_employee": True,
                "explicit_notify": explicit_notify,
            },
        }

    # 4. Send Direct Employee Notification
    if re.search(r"(أرسل|ارسل|إرسال|ارسال|بعث|إبلاغ|ابلغ|نب[ّ]?ه|send|notify)\b", low) and re.search(r"(إشعار|اشعار|تنبيه|رسالة|notification|alert|message|\bto\b|لـ|للموظف|إلى)", low):
        ticket_match = re.search(r"(?:تذكرة|التذكرة|ticket)\s*(?:رقم|#)?\s*(TCK-\d{4}-\d+|\d+)", text, re.I)
        ticket_num = ticket_match.group(1) if ticket_match else None

        stripped = re.sub(
            r"^(?:أرسل|ارسل|إرسال|ارسال|نب[ّ]?ه|send|notify)\s+(?:إشعار(?:ا|اً|ًا)?|اشعار(?:ا|اً|ًا)?|تنبيه(?:ا|اً|ًا)?|رسالة|a?\s*notification|an?\s*alert|message)?\s*",
            "",
            text,
            flags=re.I,
        ).strip()
        assignee_name = None
        msg_body = stripped

        # Capture recipient cleanly AFTER explicit recipient prepositions (never match "ل" inside "التذكرة"!)
        m_emp_msg = re.match(
            r"^(?:لـ\s+|للموظفة?\s+|إلى\s+الموظفة?\s+|الى\s+الموظفة?\s+|لـ\s*الموظفة?\s+|إلى\s+|الى\s+|to\s+(?:employee\s+)?|(?<![أ-يa-zA-Z])ل(?=[أاإآء-ي]{2,}))"
            r"((?:(?:الموظفة?|الأستاذ|المهندس|الفني)\s+)?[^\s.,،]+(?:\s+[^\s.,،]+){0,2}?)"
            r"(?=\s+(?:بضرورة|بخصوص|عن|حول|أن|ان|بأن|لأجل|كي|about|regarding|that|to\b)|[،,.]|$)\s*(.*)$",
            stripped,
            flags=re.I,
        )
        if m_emp_msg:
            cand_emp = tools.clean_employee_query(m_emp_msg.group(1))
            # Guard: do NOT treat message verbs like "مراجعة" / "تذكرة" as an employee name!
            if cand_emp and not re.match(r"^(?:مراجعة|فحص|متابعة|تذكرة|التذكرة|بضرورة|review|check)\b", cand_emp, re.I):
                assignee_name = cand_emp
                tail = re.sub(r"^(?:بضرورة\s+|بخصوص\s+|أن\s+|ان\s+|بأن\s+|about\s+|regarding\s+|that\s+|to\s+)", "", m_emp_msg.group(2).strip(), flags=re.I)
                msg_body = tail or stripped
        else:
            msg_body = re.sub(r"^(?:بضرورة\s+|بخصوص\s+)", "", stripped).strip() or text

        return {
            "tool": "send_employee_notification",
            "args": {
                "assignee_name": assignee_name,
                "message": msg_body or stripped or text,
                "ticket_number": ticket_num,
            },
        }

    # 5. Create Help Desk Ticket
    if re.search(r"(أنشئ|انشئ|إنشاء|انشاء|افتح|فتح|سج[ّ]?ل|أضف|create|open|submit|report)\s+(?:a\s+|an\s+|new\s+)?(?:urgent\s+)?(تذكرة|بلاغ|عطل|مشكلة|ticket|issue)", low):
        priority_val, work = _extract_priority_from_text(text)
        title = re.sub(
            r"^(?:أنشئ|انشئ|إنشاء|انشاء|افتح|فتح|سج[ّ]?ل|أضف|create|open|submit|report)\s+(?:a\s+|an\s+|new\s+)?(?:تذكرة|بلاغ|دعم فني|عطل|مشكلة|ticket|issue)\s*(?:دعم\s*فني\s*)?(?:عن|بخصوص|بعنوان|في|for|about|:)?\s*",
            "",
            work,
            flags=re.I,
        ).strip()
        return {
            "tool": "create_ticket",
            "args": {
                "issue_title": title or text,
                "issue_description": text,
                "priority": priority_val if priority_val != "Medium" else None,
            },
        }

    # 6. Operational Queries: Overdue Tasks, Filtered Tasks, Tickets, Assets, Custody, Subscriptions, Attendance, CRM, Projects, Approvals, Summary
    if re.search(r"(متأخرة?|تأخير|overdue)", low):
        m_ovd_emp = re.search(r"(?:عند|لدى|لـ|للموظف\s+|الخاصة\s+بـ?)\s*([^\s؟?.,،]+(?:\s+[^\s؟?.,،]+)?)$", text, flags=re.I)
        emp_ovd = tools.clean_employee_query(m_ovd_emp.group(1)) if m_ovd_emp and not re.search(r"(فريقي|الفريق|الشركة|القسم|team|all)", m_ovd_emp.group(1), re.I) else None
        mode = "team" if re.search(r"(فريقي|الفريق|الشركة|القسم|team|all)", low) else ("my" if re.search(r"(مهامي|my tasks)", low) else "team")
        return {"tool": "query_operations", "args": {"query_type": "overdue_tasks", "filter_mode": mode, "assignee_name": emp_ovd, "limit": 25}}

    if re.search(r"(حضور|انصراف|غياب|تقرير\s+الحضور|attendance)", low):
        return {"tool": "query_operations", "args": {"query_type": "attendance", "limit": 25}}

    if re.search(r"(اشتراك|اشتراكات|ينتهي\s+خلال|تجديد|subscription)", low):
        return {"tool": "query_operations", "args": {"query_type": "subscriptions", "limit": 25}}

    if re.search(r"(عهدة|عهد|مين\s+عنده\s+عهدة|custody)", low):
        m_br = re.search(r"(?:فرع)\s+([^\s؟?.,،]+)", text)
        return {"tool": "query_operations", "args": {"query_type": "custody", "search": m_br.group(1) if m_br else None, "limit": 25}}

    if re.search(r"(عملاء|فرص\s+بيعية|مبيعات|crm|pipeline|customers)", low):
        return {"tool": "query_operations", "args": {"query_type": "crm"}}

    if re.search(r"(مشاريع|المشاريع|projects)", low):
        return {"tool": "query_operations", "args": {"query_type": "projects"}}

    if re.search(r"(اعتمادات|موافقات|طلبات\s+الشراء|approvals)", low):
        return {"tool": "query_operations", "args": {"query_type": "approvals"}}

    if re.search(r"(ملخص|إحصائيات\s+العامة|تقرير سريع|الوضع الحالي|ملخص\s+أداء|summary|overview|kpi|status report)", low) and not re.search(r"(تذاكر|التذاكر|tickets)", low):
        return {"tool": "query_operations", "args": {"query_type": "operational_summary"}}

    if re.search(r"(مهام|المهام|tasks|my tasks|مهامي)", low):
        mode = "my" if re.search(r"(مهامي|المسندة إلي|my tasks)", low) else "team"
        status_filter = tools._normalize_task_filter_status(text)
        assignee_filter = None
        m_for = re.search(r"(?:المسندة\s+(?:لـ|إلى|ل)|الخاصة\s+بـ?|مهام\s+(?:الموظف\s+)?)(?!المكتملة|النشطة|المفتوحة|المتأخرة|الجديدة|الملغاة|المرفوضة|الفريق|الشركة|جميع|كل|قيد\s+التنفيذ)([^\s.,،]+(?:\s+[^\s.,،]+){0,2})$", text, flags=re.I)
        if m_for:
            assignee_filter = tools.clean_employee_query(m_for.group(1)) or None
        return {
            "tool": "query_operations",
            "args": {
                "query_type": "tasks",
                "filter_mode": mode,
                "status": status_filter,
                "assignee_name": assignee_filter,
                "limit": 25,
            },
        }

    if re.search(r"(تذاكر|التذاكر|بلاغات|tickets)", low):
        return {"tool": "query_operations", "args": {"query_type": "tickets", "limit": 25}}

    if re.search(r"(أصول|الأصول|أجهزة|الأجهزة|لابتوب|تحت\s+الصيانة|assets)", low):
        st = "Under Maintenance" if re.search(r"(تحت\s+الصيانة|صيانة|maintenance)", low) else None
        return {"tool": "query_operations", "args": {"query_type": "assets", "status": st, "limit": 25}}

    return {"tool": None, "args": {}}


# ── Grounded Summary Formatting (Zero Hallucinations) ───────────────────────

def _format_grounded_response(tool_name: str, res: Dict[str, Any]) -> str:
    if res.get("status") == "denied":
        return f"⛔ تعذر التنفيذ: {res.get('error', 'صلاحيات غير كافية.')}"
    if res.get("status") in {"needs_clarification", "ambiguous", "not_found"}:
        return res.get("error") or "يرجى توضيح المعلومات المطلوبة."
    if res.get("status") == "needs_confirmation":
        conf = res.get("confirmation_action") or {}
        return f"⚠️ يتطلب هذا الإجراء تأكيدك قبل التنفيذ الفعلي:\n{conf.get('summary', '')}"
    if not res.get("ok"):
        return f"❌ {res.get('error') or 'تعذر تنفيذ العملية المطلوبة.'}"

    d = res.get("data") or {}
    rtype = d.get("type")

    if rtype == "employee_list":
        items = d.get("items") or []
        if not items:
            return "لم يتم العثور على موظفين مطابقين."
        lines = [f"👤 نتائج دليل الموظفين ({len(items)}):"]
        for it in items:
            tg = "مرتبط بـ Telegram ✅" if it.get("telegram_linked") else "غير مرتبط بـ Telegram"
            dept = f" • {it['department_name']}" if it.get("department_name") else ""
            role = f" ({it['job_title']}{dept})" if it.get("job_title") else dept
            lines.append(f"• {it['full_name']}{role} — {tg}")
        return "\n".join(lines)

    if rtype == "task_batch":
        tasks_list = d.get("tasks") or []
        lines = [f"✅ تم إنشاء {len(tasks_list)} مهام بنجاح:"]
        for t in tasks_list:
            who = f" ← {t['assignee_name']}" if t.get("assignee_name") else " (مسودة)"
            tg = f" [{t.get('telegram_status')}]" if t.get("telegram_status") and t.get("telegram_status") != "Skipped" else ""
            lines.append(f"• {t.get('reference')}: {t.get('title')}{who}{tg}")
        return "\n".join(lines)

    if rtype == "task":
        lines = [
            f"{'⚠️ تم إنشاء المهمة مع ملاحظة في الإشعار' if res.get('status') == 'partial_failure' else '✅ تم تنفيذ العملية بنجاح'}:",
            f"• المرجع: {d.get('reference')}",
            f"• العنوان: {d.get('title')}",
            f"• الحالة: {d.get('status')}",
        ]
        if d.get("assignee_name"):
            lines.append(f"• المسند إليه: {d.get('assignee_name')}")
        if d.get("due_date"):
            lines.append(f"• تاريخ الاستحقاق: {d.get('due_date')}")
        if d.get("notification_summary"):
            lines.append(f"• حالة الإشعار: {d.get('notification_summary')}")
        return "\n".join(lines)

    if rtype == "notification":
        prefix = "✅ تم إرسال الإشعار:" if res.get("status") == "executed" else "⚠️ نتيجة إرسال الإشعار:"
        return f"{prefix}\n• المستلم: {d.get('assignee_name')}\n• النتيجة الموثقة: {d.get('notification_summary')}"

    if rtype == "ticket":
        return (
            f"✅ تم فتح تذكرة الدعم الفني بنجاح:\n"
            f"• رقم التذكرة: {d.get('ticket_number')}\n"
            f"• العنوان: {d.get('title')}\n"
            f"• التصنيف الذكي: {d.get('category')} | الأولوية: {d.get('priority')}"
        )

    if rtype == "summary":
        return (
            "📊 الملخص التشغيلي الحالي للمنشأة:\n"
            f"• المهام النشطة: {d.get('open_tasks', 0)} (منها {d.get('overdue_tasks', 0)} متأخرة عن الموعد)\n"
            f"• المهام المكتملة: {d.get('completed_tasks', 0)}\n"
            f"• تذاكر الدعم المفتوحة: {d.get('open_tickets', 0)} (حرجة: {d.get('urgent_tickets', 0)})\n"
            f"• الأصول المسجلة: {d.get('total_assets', 0)} | الصيانة المعلقة: {d.get('pending_maintenance', 0)}"
        )

    if rtype == "task_list":
        items = d.get("items") or []
        total_cnt = d.get("total_count", len(items))
        flabel = d.get("filter_label") or ("المهام المتأخرة" if d.get("query_type") in {"overdue", "overdue_tasks"} else "قائمة المهام")
        if not items:
            return f"✅ لا توجد مهام مطابقة ({flabel}) حالياً."
        shown = min(len(items), 15)
        lines = [f"📋 {flabel} — عرض {len(items)} من أصل {total_cnt} مهمة:"]
        if d.get("scope_note"):
            lines.append(f"({d['scope_note']})")
        for it in items[:shown]:
            due_part = f" — موعد: {it['due_date']}" if it.get("due_date") else ""
            over_part = f" (تأخير {it['days_overdue']} يوم)" if it.get("days_overdue") else ""
            lines.append(f"• {it['reference']}: {it['title']} [{it['assignee_name']} • {it['status']}]{due_part}{over_part}")
        if total_cnt > shown:
            lines.append(f"… وهناك {total_cnt - shown} مهمة أخرى مطابقة متوفرة في صفحة المهام.")
        return "\n".join(lines)

    if rtype == "ticket_list":
        items = d.get("items") or []
        total_cnt = d.get("total_count", len(items))
        if not items:
            return "لا توجد تذاكر مطابقة حالياً."
        lines = [f"🎫 تذاكر الدعم — عرض {len(items)} من أصل {total_cnt}:"]
        for it in items[:10]:
            lines.append(f"• {it['ticket_number']}: {it['title']} [{it['category']} • {it['priority']} • {it['status']}]")
        return "\n".join(lines)

    if rtype == "asset_list":
        items = d.get("items") or []
        total_cnt = d.get("total_count", len(items))
        if not items:
            return "لا توجد أصول أو عهد مطابقة حالياً."
        lines = [f"💻 الأصول والعهد — عرض {len(items)} من أصل {total_cnt}:"]
        for it in items[:10]:
            who = f" → {it['assigned_to']}" if it.get("assigned_to") else ""
            lines.append(f"• {it['asset_code']}: {it['asset_name']} ({it.get('asset_type') or 'عهدة'} • {it['status']}){who}")
        return "\n".join(lines)

    if rtype == "subscriptions_summary":
        items = d.get("items") or []
        lines = [
            f"💳 الاشتراكات الخارجية: إجمالي ({d.get('total_subscriptions', 0)}) — ينتهي خلال 30 يوماً ({d.get('expiring_30d_count', 0)}):"
        ]
        for s in items[:8]:
            lines.append(f"• {s['service_name']} ({s.get('provider') or '—'}) — التجديد: {s.get('renewal_date') or '—'} — {s.get('price', 0)} ر.س")
        return "\n".join(lines)

    if rtype == "attendance_summary":
        return (
            f"🕒 ملخص سجل الحضور والانصراف الفعلي:\n"
            f"• إجمالي السجلات: {d.get('total_records', 0)} | حضور: {d.get('present_count', 0)} | تأخير: {d.get('late_count', 0)} | غياب مؤكد: {d.get('absent_count', 0)}"
        )

    if rtype == "crm_summary":
        return (
            f"🤝 ملخص إدارة علاقات العملاء (CRM):\n"
            f"• العملاء المسجلون: {d.get('total_customers', 0)} | الفرص البيعية: {d.get('total_opportunities', 0)} | قيمة الفرص المفتوحة: {d.get('open_pipeline_value_sar', 0):,.2f} ر.س"
        )

    if rtype == "projects_summary":
        return f"📁 ملخص المشاريع: إجمالي المشاريع ({d.get('total_projects', 0)}) — المشاريع النشطة ({d.get('active_projects', 0)})"

    if rtype == "approvals_summary":
        return f"✅ مركز الاعتمادات الموحد: يوجد ({d.get('pending_approvals', 0)}) طلب بانتظار الاعتماد."

    return "تمت معالجة الطلب."


# ── Live Google Gemini Function Calling Loop ────────────────────────────────

def _candidate_models(preferred: str) -> List[str]:
    ordered: List[str] = []
    for m in [preferred, *FALLBACK_GEMINI_MODELS]:
        clean = (m or "").strip()
        if clean and clean not in ordered:
            ordered.append(clean)
    return ordered


def _call_gemini_function_agent(
    db: Session,
    current_user: User,
    target_cid: uuid.UUID,
    api_key: str,
    model: str,
    payload: AgentChatRequest,
    ip_address: str,
    progress_cb: Optional[Callable[[Dict[str, Any]], None]] = None,
) -> Optional[Dict[str, Any]]:
    """Run Gemini REST v1beta multi-turn function calling with automatic deprecated/404 model fallback."""
    today = date.today()
    tomorrow = today + timedelta(days=1)
    ctx_parts = []
    if payload.context:
        if payload.context.current_page:
            ctx_parts.append(f"Current UI Page: {payload.context.current_page}")
        if payload.context.selected_task_id:
            ctx_parts.append(f"Selected Task ID: {payload.context.selected_task_id}")
        if payload.context.selected_ticket_id:
            ctx_parts.append(f"Selected Ticket ID: {payload.context.selected_ticket_id}")

    system_text = (
        "You are Investor Gate OS AI Action Agent for enterprise IT Operations Management.\n"
        f"Today: {today.isoformat()}, Tomorrow: {tomorrow.isoformat()}.\n"
        f"Current User: {current_user.username}. {', '.join(ctx_parts)}\n"
        "Strict Rules:\n"
        "1. Always strip role/title prefixes (like 'الموظف', 'الأستاذ', 'المهندس', 'employee') when passing employee names.\n"
        "2. When an employee name is referenced or searched, call resolve_employee(name) first (or pass clean assignee_name).\n"
        "3. When user requests multiple tasks or multiple assignees, ALWAYS call create_tasks_batch with complete, meaningful titles — NEVER extract broken fragments like 'ة'.\n"
        "4. Write actions (create_task, create_tasks_batch, send_employee_notification, convert_ticket_to_task) enforce server confirmation automatically — invoke the tool normally and let the backend security layer emit the confirmation card.\n"
        "5. If any tool returns status='ambiguous', 'not_found', 'needs_clarification', 'needs_confirmation', or 'denied', STOP calling more tools.\n"
        "6. NEVER invent references, IDs, or statuses. Respond concisely in the user's language (Arabic or English)."
    )

    contents: List[Dict[str, Any]] = []
    for h in payload.history[-10:]:
        if h.content and h.content.strip():
            contents.append({"role": "user" if h.role == "user" else "model", "parts": [{"text": h.content}]})
    contents.append({"role": "user", "parts": [{"text": payload.message}]})

    models_to_try = _candidate_models(model)
    active_model = models_to_try[0]
    last_tool_name: Optional[str] = None
    last_tool_res: Optional[Dict[str, Any]] = None
    steps: List[Dict[str, Any]] = []

    def track_progress(s: Dict[str, Any]):
        _step_to_dict(s, steps)
        if progress_cb:
            progress_cb(s)

    for _hop in range(4):
        body = {
            "system_instruction": {"parts": [{"text": system_text}]},
            "contents": contents,
            "tools": [{"functionDeclarations": FUNCTION_DECLARATIONS}],
            "toolConfig": {"functionCallingConfig": {"mode": "AUTO"}},
            "generationConfig": {"temperature": 0.1},
        }
        payload_bytes = json.dumps(body).encode("utf-8")

        raw = None
        if _hop == 0:
            for candidate_m in models_to_try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{candidate_m}:generateContent?key={api_key}"
                req = urllib.request.Request(url, data=payload_bytes, headers={"Content-Type": "application/json"}, method="POST")
                try:
                    with urllib.request.urlopen(req, timeout=15) as resp:
                        raw = json.loads(resp.read().decode("utf-8"))
                    active_model = candidate_m
                    break
                except urllib.error.HTTPError as exc:
                    if exc.code in {404, 429, 503}:
                        logger.warning("Gemini model %s returned HTTP %s; trying next fallback model", candidate_m, exc.code)
                        continue
                    logger.warning("Gemini HTTP error on %s (%s); falling back to offline planner", candidate_m, exc)
                    break
                except Exception as exc:
                    logger.warning("Gemini request error on %s (%s); falling back to offline planner", candidate_m, exc)
                    break
        else:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{active_model}:generateContent?key={api_key}"
            req = urllib.request.Request(url, data=payload_bytes, headers={"Content-Type": "application/json"}, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    raw = json.loads(resp.read().decode("utf-8"))
            except Exception as exc:
                logger.warning("Gemini multi-turn hop error on %s (%s)", active_model, exc)
                raw = None

        if raw is None:
            if last_tool_res:
                return {
                    "reply": _format_grounded_response(last_tool_name or "", last_tool_res),
                    "tool_name": last_tool_name,
                    "tool_res": last_tool_res,
                    "steps": steps,
                    "engine_source": f"Gemini AI ({active_model})",
                }
            return None

        candidates = raw.get("candidates") or []
        if not candidates or not (candidates[0].get("content") or {}).get("parts"):
            if last_tool_res:
                return {
                    "reply": _format_grounded_response(last_tool_name or "", last_tool_res),
                    "tool_name": last_tool_name,
                    "tool_res": last_tool_res,
                    "steps": steps,
                    "engine_source": f"Gemini AI ({active_model})",
                }
            return None
        model_content = candidates[0].get("content") or {}
        parts = model_content.get("parts") or []

        contents.append({"role": "model", "parts": parts})
        fn_calls = [p["functionCall"] for p in parts if isinstance(p, dict) and "functionCall" in p]

        if not fn_calls:
            text_out = "\n".join(
                p.get("text", "")
                for p in parts
                if isinstance(p, dict) and "text" in p and not p.get("thought")
            ).strip()
            if last_tool_res:
                grounded = _format_grounded_response(last_tool_name or "", last_tool_res)
                return {
                    "reply": grounded if (last_tool_name in {"query_operations", "create_task", "create_tasks_batch", "send_employee_notification", "resolve_employee"} or not last_tool_res.get("ok")) else (text_out or grounded),
                    "grounded_summary": grounded,
                    "tool_name": last_tool_name,
                    "tool_res": last_tool_res,
                    "steps": steps,
                    "engine_source": f"Gemini AI ({active_model})",
                }
            # Fallback if Gemini tried to greet/reset while message matched an actionable offline command or follow-up
            return None

        fn_response_parts = []
        for fc in fn_calls:
            fname = fc.get("name")
            fargs = fc.get("args") if isinstance(fc.get("args"), dict) else {}
            if fname not in tools.TOOL_REGISTRY:
                fr_err: Dict[str, Any] = {"name": fname, "response": {"ok": False, "error": "Unknown tool"}}
                if fc.get("id"):
                    fr_err["id"] = fc["id"]
                fn_response_parts.append({"functionResponse": fr_err})
                continue

            res = _execute_tool_dispatch(
                db, current_user, target_cid, fname, fargs, confirmed=False, ip_address=ip_address, progress_cb=track_progress
            )
            last_tool_name = fname
            last_tool_res = res

            if res.get("status") in {"ambiguous", "not_found", "needs_clarification", "needs_confirmation", "denied"}:
                if fname == "resolve_employee" and not res.get("pending_action"):
                    inferred = _offline_plan_intent(payload.message, payload.context.model_dump() if payload.context else None)
                    if inferred.get("tool") and inferred["tool"] != "resolve_employee":
                        res["pending_action"] = {"tool": inferred["tool"], "args": inferred.get("args", {}), "missing_field": "assignee"}
                return {
                    "reply": _format_grounded_response(fname, res),
                    "tool_name": fname,
                    "tool_res": res,
                    "steps": steps,
                    "engine_source": f"Gemini AI ({active_model})",
                }

            fr_payload: Dict[str, Any] = {"name": fname, "response": res}
            if fc.get("id"):
                fr_payload["id"] = fc["id"]
            fn_response_parts.append({"functionResponse": fr_payload})

        contents.append({"role": "user", "parts": fn_response_parts})

    if last_tool_res:
        return {
            "reply": _format_grounded_response(last_tool_name or "", last_tool_res),
            "tool_name": last_tool_name,
            "tool_res": last_tool_res,
            "steps": steps,
            "engine_source": f"Gemini AI ({active_model})",
        }
    return None


# ── Main Agent Entrypoint ───────────────────────────────────────────────────

def _execute_tool_dispatch(
    db: Session,
    current_user: User,
    target_cid: uuid.UUID,
    tool_name: str,
    args: Dict[str, Any],
    confirmed: bool,
    ip_address: str,
    progress_cb: Optional[Callable[[Dict[str, Any]], None]],
) -> Dict[str, Any]:
    if tool_name == "resolve_employee":
        return tools.tool_resolve_employee(
            db,
            current_user,
            target_cid,
            name=tools._safe_str(args.get("name")),
            employee_id=args.get("employee_id"),
            progress_cb=progress_cb,
        )
    if tool_name == "create_task":
        return tools.tool_create_task(db, current_user, target_cid, args, confirmed=confirmed, ip_address=ip_address, progress_cb=progress_cb)
    if tool_name == "create_tasks_batch":
        return tools.tool_create_tasks_batch(db, current_user, target_cid, args, confirmed=confirmed, ip_address=ip_address, progress_cb=progress_cb)
    if tool_name == "update_task_status":
        return tools.tool_update_task_status(db, current_user, target_cid, args, confirmed=confirmed, ip_address=ip_address, progress_cb=progress_cb)
    if tool_name == "send_employee_notification":
        return tools.tool_send_employee_notification(db, current_user, target_cid, args, confirmed=confirmed, ip_address=ip_address, progress_cb=progress_cb)
    if tool_name == "create_ticket":
        return tools.tool_create_ticket(db, current_user, target_cid, args, ip_address=ip_address, progress_cb=progress_cb)
    if tool_name == "convert_ticket_to_task":
        return tools.tool_convert_ticket_to_task(db, current_user, target_cid, args, confirmed=confirmed, ip_address=ip_address, progress_cb=progress_cb)
    if tool_name == "query_operations":
        return tools.tool_query_operations(db, current_user, target_cid, args, progress_cb=progress_cb)
    return {"ok": False, "status": "error", "error": "أداة غير معروفة."}


def _save_execution_record(
    db: Session,
    target_cid: uuid.UUID,
    current_user: User,
    idem_key: str,
    action_name: str,
    request_payload: Dict[str, Any],
    response_payload: Dict[str, Any],
    confirmation_token: Optional[str] = None,
) -> None:
    record = AIAgentExecution(
        company_id=target_cid,
        user_id=current_user.id,
        idempotency_key=idem_key[:128],
        confirmation_token=confirmation_token,
        action_name=action_name[:80],
        status=str(response_payload.get("status", "executed"))[:40],
        request_payload=request_payload,
        result_payload=response_payload,
    )
    db.add(record)
    db.commit()


def _is_affirmative_reply(msg: str) -> bool:
    low = msg.strip().lower().strip(".!؟")
    return low in {
        "نعم", "تأكيد", "تاكيد", "موافق", "أكيد", "اكيد", "نفذ", "نفذها", "نفذهم",
        "نفذهم كلهم", "اعتمد", "إعتماد", "اعتماد", "تم", "تمام", "اوكي", "أوكي",
        "yes", "confirm", "ok", "proceed", "approve", "execute", "execute all",
    }


def _is_negative_reply(msg: str) -> bool:
    low = msg.strip().lower().strip(".!؟")
    return low in {"لا", "إلغاء", "الغاء", "تراجع", "ألغ", "الغ", "رفض", "no", "cancel", "abort", "stop"}


def _pick_candidate_choice(msg: str, candidates: Optional[List[Dict[str, Any]]]) -> Optional[Dict[str, Any]]:
    """Select a candidate from an ambiguous list ONLY when uniquely identified by index, ID, employee number, or distinguishing detail. Never auto-selects the first match when multiple candidates match!"""
    if not candidates:
        return None
    raw = msg.strip().strip(".!؟")
    low = raw.lower()
    idx_map = {
        "1": 0, "الأول": 0, "الاول": 0, "اول واحد": 0, "أول واحد": 0, "الموظف الأول": 0, "الموظف الاول": 0, "first": 0,
        "2": 1, "الثاني": 1, "ثاني واحد": 1, "الموظف الثاني": 1, "second": 1,
        "3": 2, "الثالث": 2, "الموظف الثالث": 2, "third": 2,
        "4": 3, "الرابع": 3, "fourth": 3,
    }
    if low in idx_map and idx_map[low] < len(candidates):
        return candidates[idx_map[low]]

    norm_msg = arabic_nlp.normalize_arabic_key(raw)
    if not norm_msg:
        return None

    # 1. Match by exact employee_id UUID, short_id, employee_number, or username
    id_matches = [
        c for c in candidates
        if str(c.get("employee_id") or "").lower() == low
        or str(c.get("short_id") or "").lower() == low.lstrip("#")
        or str(c.get("employee_number") or "").lower() == low.lstrip("#")
        or (c.get("username") and str(c["username"]).lower() == low.lstrip("@"))
        or (c.get("employee_number") and str(c["employee_number"]) in norm_msg.split())
    ]
    if len(id_matches) == 1:
        return id_matches[0]

    # 2. Match by Telegram link status if user specifies "المرتبط بتليجرام" / "تليجرام"
    if any(k in norm_msg for k in ["تليجرام", "تيليجرام", "telegram", "مرتبط"]):
        tg_matches = [c for c in candidates if c.get("telegram_linked")]
        if len(tg_matches) == 1:
            return tg_matches[0]

    # 3. Match by distinguishing job_title, department_name, or branch_name
    attr_matches = []
    for c in candidates:
        attrs = " ".join(
            arabic_nlp.normalize_arabic_key(c.get(k))
            for k in ("job_title", "department_name", "branch_name", "employee_number", "username")
            if c.get(k)
        )
        if attrs and any(tok in attrs for tok in norm_msg.split() if len(tok) >= 3):
            attr_matches.append(c)
    if len(attr_matches) == 1:
        return attr_matches[0]

    # 4. Match by full_name ONLY if exactly 1 candidate has that full_name!
    clean_emp = tools.clean_employee_query(raw)
    if clean_emp:
        from app.services.task_assignment import normalize_name
        norm_q = normalize_name(clean_emp)
        exact = [c for c in candidates if normalize_name(str(c.get("full_name") or "")) == norm_q]
        if len(exact) == 1:
            return exact[0]
    return None


def _apply_clarification_answer(
    p_tool: str,
    p_args: Dict[str, Any],
    msg: str,
    resolved_employee_id: Optional[str],
    candidates: Optional[List[Dict[str, Any]]] = None,
) -> None:
    """Merge follow-up employee name, candidate selection, or missing field back into pending intent cleanly."""
    clean_emp = tools.clean_employee_query(msg)
    picked = None if resolved_employee_id else _pick_candidate_choice(msg, candidates)
    chosen_emp_id = resolved_employee_id or (picked.get("employee_id") if picked else None)

    if p_tool == "create_tasks_batch" and isinstance(p_args.get("tasks"), list) and p_args["tasks"]:
        idx = int(p_args.get("clarify_index") or 0)
        target_name = p_args["tasks"][idx].get("assignee_name") if 0 <= idx < len(p_args["tasks"]) else None
        for i, item in enumerate(p_args["tasks"]):
            same_unresolved = (i == idx) or (target_name and item.get("assignee_name") == target_name) or (not item.get("assignee_id") and not item.get("assignee_name"))
            if same_unresolved:
                if chosen_emp_id:
                    item["assignee_id"] = str(chosen_emp_id)
                    item.pop("assignee_name", None)
                elif clean_emp:
                    item["assignee_name"] = clean_emp
        return

    if chosen_emp_id:
        if p_tool in {"create_task", "convert_ticket_to_task", "query_operations"}:
            p_args["assignee_id"] = str(chosen_emp_id)
        elif p_tool == "send_employee_notification":
            p_args["employee_id"] = str(chosen_emp_id)
        elif p_tool == "create_ticket":
            p_args["requester_id"] = str(chosen_emp_id)
        return

    if clean_emp:
        p_args["assignee_name"] = clean_emp
    elif msg.strip():
        p_args["assignee_name"] = msg.strip()


def _close_open_clarifications(db: Session, target_cid: uuid.UUID, user_id: uuid.UUID) -> None:
    try:
        db.query(AIAgentExecution).filter(
            AIAgentExecution.company_id == target_cid,
            AIAgentExecution.user_id == user_id,
            AIAgentExecution.status == "needs_clarification",
        ).update({"status": "superseded"}, synchronize_session=False)
        db.commit()
    except Exception:
        db.rollback()


def _resolve_recent_employee_reference(db: Session, target_cid: uuid.UUID, user_id: uuid.UUID) -> Optional[str]:
    """Find the most recently resolved employee_id from the user's execution history in the active company."""
    recent_rows = (
        db.query(AIAgentExecution)
        .filter(
            AIAgentExecution.company_id == target_cid,
            AIAgentExecution.user_id == user_id,
        )
        .order_by(AIAgentExecution.created_at.desc())
        .limit(10)
        .all()
    )
    for row in recent_rows:
        req = row.request_payload or {}
        args = req.get("args") or {}
        if args.get("assignee_id") or args.get("employee_id"):
            return str(args.get("assignee_id") or args.get("employee_id"))
        if isinstance(args.get("tasks"), list):
            for t in args["tasks"]:
                if isinstance(t, dict) and t.get("assignee_id"):
                    return str(t["assignee_id"])
        res_card = (row.result_payload or {}).get("result_card") or {}
        if res_card.get("assignee_id"):
            return str(res_card["assignee_id"])
        if res_card.get("type") == "employee_list" and isinstance(res_card.get("items"), list) and len(res_card["items"]) == 1:
            return str(res_card["items"][0].get("employee_id"))
    return None


def _extract_followup_modification(msg: str) -> Optional[Dict[str, str]]:
    """Detect follow-up parameter tweaks like 'خليها بكرة' or 'خلي الأولوية عاجلة'."""
    low = msg.strip().lower()
    if not re.match(r"^(?:خليها|خليه|خليهم|خلي|اجعلها|اجعل|غير|غيّر|عدل|عدّل|موعدها|الموعد|الأولوية|الاولوية|تكون|يكون)\b", low):
        return None
    mods: Dict[str, str] = {}
    due_iso, _ = _extract_date_from_text(msg)
    if due_iso:
        mods["due_date"] = due_iso
    if re.search(r"(عاجل|حرجة|طارئ|مرتفع|عالي|منخفض|متوسط|urgent|high|low|medium)", low):
        prio, _ = _extract_priority_from_text(msg)
        mods["priority"] = prio
    return mods or None


def process_agent_request(
    db: Session,
    current_user: User,
    target_cid: uuid.UUID,
    payload: AgentChatRequest,
    ip_address: str = "127.0.0.1",
    progress_cb: Optional[Callable[[Dict[str, Any]], None]] = None,
) -> Dict[str, Any]:
    """Process one conversational AI Agent command securely with memory, confirmation guard, idempotency, RBAC, and audit."""
    steps: List[Dict[str, Any]] = []

    def track_progress(step: Dict[str, Any]) -> None:
        _step_to_dict(step, steps)
        if progress_cb:
            progress_cb(step)

    try:
        # 0. Adversarial Prompt Injection & Secret Exfiltration Guardrail
        sec_block = arabic_nlp.detect_adversarial_or_secret_probe(payload.message)
        if sec_block:
            try:
                log_audit(
                    db=db,
                    action="AI_AGENT_SECURITY_BLOCK",
                    resource_type="AIAgent",
                    resource_id="security_guard",
                    user_id=current_user.id,
                    company_id=target_cid,
                    new_values={"blocked_prompt_preview": payload.message[:120]},
                    ip_address=ip_address,
                )
            except Exception:
                db.rollback()
            return {
                "status": "denied",
                "reply": sec_block,
                "steps": [{"key": "security_guard", "label": "تم حظر أمر غير مصرح به أمنياً", "status": "denied"}],
                "duplicate": False,
                "engine_source": "Agent Security Guard",
            }

        # 1. Explicit Idempotency Key Replay Protection (for non-confirmation calls)
        idem_key = (payload.idempotency_key or "").strip()[:128]
        if idem_key and not payload.confirmation_token:
            existing = (
                db.query(AIAgentExecution)
                .filter(
                    AIAgentExecution.company_id == target_cid,
                    AIAgentExecution.user_id == current_user.id,
                    AIAgentExecution.idempotency_key == idem_key,
                )
                .first()
            )
            if existing and existing.result_payload and existing.status in {"executed", "partial_failure"}:
                cached = dict(existing.result_payload)
                cached["duplicate"] = True
                return cached

        # 1b. Follow-up parameter modification on open confirmation ("خليها بكرة" / "خلي الأولوية عاجلة")
        mod_patch = _extract_followup_modification(payload.message) if not payload.confirmation_token else None
        if mod_patch:
            latest_open_conf = (
                db.query(AIAgentExecution)
                .filter(
                    AIAgentExecution.company_id == target_cid,
                    AIAgentExecution.user_id == current_user.id,
                    AIAgentExecution.status == "needs_confirmation",
                    AIAgentExecution.created_at >= datetime.utcnow() - timedelta(minutes=30),
                )
                .order_by(AIAgentExecution.created_at.desc())
                .first()
            )
            if latest_open_conf and latest_open_conf.request_payload:
                c_tool = latest_open_conf.request_payload.get("tool")
                c_args = dict(latest_open_conf.request_payload.get("args") or {})
                if c_tool == "create_tasks_batch" and isinstance(c_args.get("tasks"), list):
                    for t_item in c_args["tasks"]:
                        t_item.update(mod_patch)
                else:
                    c_args.update(mod_patch)
                latest_open_conf.status = "superseded"
                db.commit()
                tool_res = _execute_tool_dispatch(
                    db, current_user, target_cid, c_tool, c_args, confirmed=False, ip_address=ip_address, progress_cb=track_progress
                )
                return _finalize_and_persist(
                    db, current_user, target_cid, idem_key, payload.message, c_tool, c_args, tool_res, steps, "Conversation Memory", track_progress
                )

        # 2. Confirmation Token Resume Flow (explicit button or typed confirmation against active token)
        active_conf_token = payload.confirmation_token
        conf_decision = payload.confirm_decision
        if not active_conf_token and (_is_affirmative_reply(payload.message) or _is_negative_reply(payload.message)):
            latest_conf = (
                db.query(AIAgentExecution)
                .filter(
                    AIAgentExecution.company_id == target_cid,
                    AIAgentExecution.user_id == current_user.id,
                    AIAgentExecution.status == "needs_confirmation",
                    AIAgentExecution.confirmation_token.isnot(None),
                    AIAgentExecution.created_at >= datetime.utcnow() - timedelta(minutes=30),
                )
                .order_by(AIAgentExecution.created_at.desc())
                .first()
            )
            if latest_conf:
                active_conf_token = latest_conf.confirmation_token
                conf_decision = "cancel" if _is_negative_reply(payload.message) else "confirm"

        if active_conf_token:
            pending_rec = (
                db.query(AIAgentExecution)
                .filter(
                    AIAgentExecution.company_id == target_cid,
                    AIAgentExecution.user_id == current_user.id,
                    AIAgentExecution.confirmation_token == active_conf_token,
                )
                .first()
            )
            if not pending_rec:
                return {
                    "status": "error",
                    "reply": "رمز التأكيد منتهي الصلاحية أو غير صالح.",
                    "steps": [],
                    "duplicate": False,
                    "engine_source": "Agent Security Guard",
                }
            if pending_rec.status in {"executed", "partial_failure"} and pending_rec.result_payload:
                cached_conf = dict(pending_rec.result_payload)
                cached_conf["duplicate"] = True
                return cached_conf
            if pending_rec.status != "needs_confirmation":
                return {
                    "status": "error",
                    "reply": "رمز التأكيد تم إلغاؤه أو لم يعد صالحاً.",
                    "steps": [],
                    "duplicate": False,
                    "engine_source": "Agent Security Guard",
                }

            if conf_decision == "cancel":
                pending_rec.status = "cancelled"
                db.commit()
                return {
                    "status": "cancelled",
                    "reply": "تم إلغاء الإجراء المطلوب بناءً على طلبك دون أي تغيير في البيانات.",
                    "steps": [],
                    "duplicate": False,
                    "engine_source": "Agent Security Guard",
                }

            saved_req = pending_rec.request_payload or {}
            tool_name = saved_req.get("tool")
            tool_args = saved_req.get("args") or {}
            tool_res = _execute_tool_dispatch(
                db, current_user, target_cid, tool_name, tool_args, confirmed=True, ip_address=ip_address, progress_cb=track_progress
            )
            final_resp = _build_agent_response(
                db, current_user, target_cid, idem_key or pending_rec.idempotency_key,
                tool_name, tool_args, tool_res, steps, "Agent Execution Engine", track_progress
            )
            pending_rec.status = final_resp["status"]
            pending_rec.result_payload = final_resp
            db.commit()
            return final_resp

        # 3. Conversation Memory & Follow-Up Clarification Resume Flow
        ctx_dict = payload.context.model_dump() if payload.context else None
        standalone_plan = _offline_plan_intent(payload.message, ctx_dict)
        is_explicit_new_cmd = bool(
            standalone_plan.get("tool")
            and not (standalone_plan["tool"] == "resolve_employee" and len(payload.message.split()) <= 2)
        )

        active_pending = None if (is_explicit_new_cmd and not payload.resolved_employee_id) else payload.pending_intent
        saved_candidates = None
        if not is_explicit_new_cmd and not _is_negative_reply(payload.message):
            latest_clarif = (
                db.query(AIAgentExecution)
                .filter(
                    AIAgentExecution.company_id == target_cid,
                    AIAgentExecution.user_id == current_user.id,
                    AIAgentExecution.status == "needs_clarification",
                    AIAgentExecution.created_at >= datetime.utcnow() - timedelta(minutes=30),
                )
                .order_by(AIAgentExecution.created_at.desc())
                .first()
            )
            if latest_clarif:
                if not active_pending and latest_clarif.request_payload:
                    active_pending = latest_clarif.request_payload.get("pending_action")
                saved_candidates = (latest_clarif.result_payload or {}).get("clarification_options")

        if active_pending and _is_negative_reply(payload.message) and not payload.resolved_employee_id:
            _close_open_clarifications(db, target_cid, current_user.id)
            return {
                "status": "cancelled",
                "reply": "تم إلغاء المتابعة الحالية بناءً على طلبك. يمكنك كتابة أمر جديد في أي وقت.",
                "steps": [],
                "duplicate": False,
                "engine_source": "Conversation Memory",
            }

        if active_pending and (payload.resolved_employee_id or payload.message.strip()):
            p_tool = active_pending.get("tool")
            p_args = dict(active_pending.get("args") or {})
            missing_field = active_pending.get("missing_field")
            resolved_emp_override = payload.resolved_employee_id
            if not resolved_emp_override and re.search(r"(نفس\s+الموظف|نفس\s+الشخص|نفسه|same\s+employee)", payload.message, re.I):
                resolved_emp_override = _resolve_recent_employee_reference(db, target_cid, current_user.id)

            if mod_patch and not resolved_emp_override:
                if p_tool == "create_tasks_batch" and isinstance(p_args.get("tasks"), list):
                    for t_item in p_args["tasks"]:
                        t_item.update(mod_patch)
                else:
                    p_args.update(mod_patch)
            elif missing_field == "title" and not resolved_emp_override:
                clean_t = tools._sanitize_task_title(payload.message)
                p_args["title"] = clean_t or payload.message.strip()
            elif missing_field == "ticket" and not resolved_emp_override:
                p_args["ticket_number"] = payload.message.strip()
            else:
                _apply_clarification_answer(
                    p_tool, p_args, payload.message, resolved_emp_override, saved_candidates
                )

            if p_tool in tools.TOOL_REGISTRY:
                _close_open_clarifications(db, target_cid, current_user.id)
                tool_res = _execute_tool_dispatch(
                    db, current_user, target_cid, p_tool, p_args, confirmed=False, ip_address=ip_address, progress_cb=track_progress
                )
                return _finalize_and_persist(
                    db, current_user, target_cid, idem_key, payload.message, p_tool, p_args, tool_res, steps, "Conversation Memory", track_progress
                )

        # Resolve "نفس الموظف" / "الموظف السابق" in standalone commands before tool dispatch
        if re.search(r"(نفس\s+الموظف|الموظف\s+السابق|same\s+employee)", payload.message, re.I) and standalone_plan.get("tool"):
            recent_emp_id = _resolve_recent_employee_reference(db, target_cid, current_user.id)
            if recent_emp_id:
                s_args = standalone_plan.setdefault("args", {})
                if standalone_plan["tool"] in {"create_task", "convert_ticket_to_task", "query_operations"}:
                    s_args["assignee_id"] = recent_emp_id
                    s_args.pop("assignee_name", None)
                elif standalone_plan["tool"] == "send_employee_notification":
                    s_args["employee_id"] = recent_emp_id
                    s_args.pop("assignee_name", None)

        # 4. Try Live Gemini Function Calling (if enabled + key present), else Offline Tool Planner
        gemini_enabled, api_key, model_name = resolve_company_gemini_config(db, target_cid)
        llm_result = None
        if gemini_enabled and api_key:
            llm_result = _call_gemini_function_agent(
                db, current_user, target_cid, api_key, model_name, payload, ip_address=ip_address, progress_cb=track_progress
            )

        if llm_result is not None and llm_result.get("tool_res") is not None:
            _close_open_clarifications(db, target_cid, current_user.id)
            return _finalize_and_persist(
                db, current_user, target_cid, idem_key, payload.message,
                llm_result["tool_name"], {}, llm_result["tool_res"], steps, llm_result["engine_source"], track_progress,
                override_reply=llm_result["reply"],
            )

        # 5. Deterministic Offline Agent Planner
        tool_name = standalone_plan.get("tool")
        tool_args = standalone_plan.get("args") or {}

        if not tool_name:
            return {
                "status": "info",
                "reply": (
                    "أهلاً بك! يمكنني مساعدتك في تنفيذ العمليات التالية بأمان:\n"
                    "• البحث عن موظف (مثال: «ابحث عن الموظف معتز قاسم»)\n"
                    "• إنشاء مهمة أو عدة مهام بعد تأكيدك (مثال: «أنشئ مهمة لـ معتز لمراجعة السيرفر غدًا وأرسل له إشعارًا»)\n"
                    "• إرسال إشعار مباشر لموظف بعد تأكيدك (مثال: «أرسل إشعارًا لـ معتز بضرورة مراجعة التذكرة رقم 125»)\n"
                    "• تحديث حالة مهمة أو فتح تذكرة أو تحويل تذكرة لمهمة\n"
                    "• استعراض المهام المتأخرة أو المكتملة أو الملخص التشغيلي"
                ),
                "steps": [],
                "duplicate": False,
                "engine_source": "Offline Agent Planner",
            }

        _close_open_clarifications(db, target_cid, current_user.id)
        tool_res = _execute_tool_dispatch(
            db, current_user, target_cid, tool_name, tool_args, confirmed=False, ip_address=ip_address, progress_cb=track_progress
        )
        return _finalize_and_persist(
            db, current_user, target_cid, idem_key, payload.message,
            tool_name, tool_args, tool_res, steps, "Offline Agent Planner", track_progress
        )
    except Exception as exc:
        logger.exception("Unhandled AI agent orchestration error: %s", exc)
        try:
            db.rollback()
        except Exception:
            pass
        return {
            "status": "error",
            "reply": "حدث خطأ غير متوقع أثناء معالجة الطلب دون تغيير البيانات. يرجى إعادة المحاولة بصياغة واضحة.",
            "steps": steps,
            "duplicate": False,
            "engine_source": "Agent Error Guard",
        }


def _build_agent_response(
    db: Session,
    current_user: User,
    target_cid: uuid.UUID,
    idem_key: str,
    tool_name: str,
    tool_args: Dict[str, Any],
    tool_res: Dict[str, Any],
    steps: List[Dict[str, Any]],
    engine_source: str,
    track_progress: Optional[Callable[[Dict[str, Any]], None]] = None,
    override_reply: Optional[str] = None,
) -> Dict[str, Any]:
    res_status = tool_res.get("status")
    norm_status = (
        "executed"
        if res_status == "unique"
        else ("needs_clarification" if res_status in {"ambiguous", "not_found", "needs_clarification"} else res_status)
    )
    reply = override_reply or _format_grounded_response(tool_name, tool_res)

    resp: Dict[str, Any] = {
        "status": norm_status,
        "reply": reply,
        "steps": steps,
        "result_card": tool_res.get("data"),
        "clarification_options": tool_res.get("candidates") or tool_res.get("task_candidates") or tool_res.get("ticket_candidates"),
        "pending_intent": tool_res.get("pending_action"),
        "suggested_followups": tool_res.get("suggested_followups") or [],
        "duplicate": bool(tool_res.get("duplicate", False)),
        "idempotency_key": idem_key,
        "engine_source": engine_source,
    }

    if res_status == "needs_confirmation":
        conf = tool_res.get("confirmation_action") or {}
        token = secrets.token_urlsafe(24)
        resp["pending_confirmation"] = {
            "confirmation_token": token,
            "action_label": conf.get("action_label", "تأكيد التنفيذ"),
            "summary": conf.get("summary", "تأكيد تنفيذ العملية"),
        }
        pending_exec_key = f"conf:{token}"
        _save_execution_record(
            db, target_cid, current_user, pending_exec_key, tool_name,
            {"tool": conf.get("tool", tool_name), "args": conf.get("args", tool_args)},
            resp, confirmation_token=token,
        )
    return resp


def _finalize_and_persist(
    db: Session,
    current_user: User,
    target_cid: uuid.UUID,
    idem_key: str,
    raw_message: str,
    tool_name: str,
    tool_args: Dict[str, Any],
    tool_res: Dict[str, Any],
    steps: List[Dict[str, Any]],
    engine_source: str,
    track_progress: Optional[Callable[[Dict[str, Any]], None]] = None,
    override_reply: Optional[str] = None,
) -> Dict[str, Any]:
    effective_key = idem_key or hashlib.sha256(f"{current_user.id}:{raw_message}:{secrets.token_hex(4)}".encode("utf-8")).hexdigest()[:48]
    resp = _build_agent_response(
        db, current_user, target_cid, effective_key,
        tool_name, tool_args, tool_res, steps, engine_source, track_progress, override_reply
    )
    if (resp["status"] in {"executed", "partial_failure"} and idem_key) or (resp["status"] == "needs_clarification" and resp.get("pending_intent")):
        try:
            _save_execution_record(
                db, target_cid, current_user, f"clarif:{effective_key}" if resp["status"] == "needs_clarification" else effective_key,
                tool_name,
                {"message": raw_message, "args": tool_args, "pending_action": resp.get("pending_intent")},
                resp,
            )
        except Exception:
            db.rollback()
    return resp


def get_agent_capabilities(db: Session, current_user: User, target_cid: uuid.UUID) -> Dict[str, Any]:
    gemini_enabled, _, model_name = resolve_company_gemini_config(db, target_cid)
    display_model = DEFAULT_GEMINI_MODEL if model_name in {"gemini-2.0-flash", "gemini-1.5-flash"} else model_name
    return {
        "gemini_live_configured": gemini_enabled,
        "model": display_model if gemini_enabled else "Offline Agent Planner",
        "can_create_tasks": has_module_permission(current_user, Module.TASKS, Action.CREATE, target_cid, db),
        "can_assign_tasks": has_module_permission(current_user, Module.TASKS, Action.ASSIGN, target_cid, db),
        "can_create_tickets": has_module_permission(current_user, Module.TICKETS, Action.CREATE, target_cid, db),
        "can_view_assets": has_module_permission(current_user, Module.ASSETS, Action.VIEW, target_cid, db),
    }
