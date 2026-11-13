"""Google Gemini AI Operations Assistant Service.

Provides:
- Ticket summarization & classification suggestions
- Task risk evaluation & bottleneck prediction
- Troubleshooting checklists & guidance
- Air-gapped fallback with heuristic rule engine when GEMINI_API_KEY is not configured
- Clear advisory disclaimer on all outputs (human in the loop)
"""

import os
import json
import logging
import urllib.request
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)

DISCLAIMER_TEXT = "تنبيه: هذه المقترحات والتحليلات صادرة عن المساعد الذكي للاسترشاد فقط، وتتطلب مراجعة واعتماد الفني المختص قبل التنفيذ."


def analyze_ticket_ai(
    title: str,
    description: Optional[str] = None,
    current_category: Optional[str] = None,
    current_priority: Optional[str] = "Medium",
    api_key: Optional[str] = None,
) -> Dict[str, Any]:
    """Analyze an IT Help Desk ticket and produce intelligent recommendations."""
    key = api_key or os.getenv("GEMINI_API_KEY", "").strip()
    full_text = f"{title}\n{description or ''}"

    # If live Gemini API key is configured, query Gemini REST API
    if key and len(key) > 20:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={key}"
            prompt = (
                f"أنت خبير دعم فني وتشغيل لنظام IT Operations. حلل تذكرة الدعم الفني التالية بدقة باللغة العربية:\n"
                f"العنوان: {title}\n"
                f"الوصف: {description or 'لا يوجد'}\n"
                f"أعد الإجابة بتنسيق JSON حصراً بالمفاتيح التالية:\n"
                f"- summary: ملخص تنفيذي موجز في سطر واحد\n"
                f"- suggested_category: التصنيف الفني المقترح (الشبكات، الخوادم، البرمجيات، الأجهزة، أمن المعلومات)\n"
                f"- suggested_priority: الأولوية المقترحة (Low, Medium, High, Urgent)\n"
                f"- troubleshooting_steps: مصفوفة من 3 إلى 4 خطوات فنية للتشخيص والحل"
            )
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"},
            }
            body = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=12) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                candidate = data.get("candidates", [{}])[0]
                content = candidate.get("content", {}).get("parts", [{}])[0].get("text", "")
                result = json.loads(content)
                result["source"] = "Gemini AI (Live)"
                result["disclaimer"] = DISCLAIMER_TEXT
                return result
        except Exception as e:
            logger.warning(f"Live Gemini API call failed, falling back to heuristic engine: {e}")

    # Air-gapped / Local Rule-based Heuristic Engine
    lower_text = full_text.lower()
    suggested_cat = current_category or "البرمجيات والأنظمة"
    suggested_prio = current_priority or "Medium"
    steps = [
        "التحقق من سجلات الأخطاء في الخادم (Logs) للتأكد من عدم وجود انهيار للخدمة",
        "فحص اتصال الشبكة واختبار منافذ الوصول المعنية (Ping / Telnet / Port Check)",
        "التحقق من حالة الحساب وصلاحيات المستخدم المسجلة في Active Directory / DB",
    ]

    if any(k in lower_text for k in ["انقطاع", "توقف الخادم", "حريق", "فقدان البيانات", "database down", "security breach"]):
        suggested_prio = "Urgent"
        suggested_cat = "الخوادم والبنية التحتية"
        steps.insert(0, "تفعيل خطة التعافي من الكوارث والتأكد من توفر أحدث نسخة احتياطية سليمة")
    elif any(k in lower_text for k in ["شبكة", "واي فاي", "بطء الاتصال", "switch", "router", "vpn"]):
        suggested_cat = "الشبكات والاتصالات"
        steps = [
            "فحص مؤشرات الـ Switch وجدار الحماية للتأكد من عدم وجود تشبع في الحزمة (Bandwidth Saturation)",
            "إعادة تعيين جلسة الـ VPN وفحص تعارض عناوين IP على الخادم المحلي",
            "اختبار مسار الحزم (Traceroute) نحو البوابة الافتراضية",
        ]
    elif any(k in lower_text for k in ["كلمة المرور", "تسجيل الدخول", "login", "auth", "حساب"]):
        suggested_cat = "الحسابات والمصادقة"
        steps = [
            "التحقق من قفل الحساب بسبب تكرار المحاولات الخاطئة في جدول user_sessions",
            "إرسال رابط إعادة تعيين كلمة المرور المشفر إلى البريد الرسمي المعتمد للموظف",
            "التأكد من تفعيل صلاحيات الشركة النشطة في جدول عضويات الشركات (Company Membership)",
        ]

    summary = f"تذكرة فنية تتعلق بـ ({title})، تتطلب تدخل فريق {suggested_cat}."
    return {
        "summary": summary,
        "suggested_category": suggested_cat,
        "suggested_priority": suggested_prio,
        "troubleshooting_steps": steps,
        "source": "Heuristic Rules Engine (Offline/Air-Gapped)",
        "disclaimer": DISCLAIMER_TEXT,
    }


def analyze_task_risk(
    title: str,
    description: Optional[str] = None,
    priority: str = "Medium",
) -> Dict[str, Any]:
    """Evaluate technical risk and bottlenecks for an operational task."""
    full_text = f"{title} {description or ''}".lower()

    risk_level = "Low"
    factors = []
    mitigations = []

    if any(k in full_text for k in ["ترقية", "migration", "قواعد بيانات", "firewall", "production", "live"]):
        risk_level = "High"
        factors.append("تعديل على أنظمة حيوية قد يؤثر على استمرارية العمل")
        mitigations.append("إنشاء نقطة استعادة ونسخة احتياطية والتحقق من سلامتها قبل البدء")
        mitigations.append("تنفيذ العمل خارج أوقات الذروة الرسمية لتقليل الأثر التشغيلي")

    if priority == "Urgent":
        risk_level = "Critical"
        factors.append("أولوية عاجلة تتطلب استجابة سريعة وتنسيقاً بين أكثر من فريق")

    if not factors:
        factors.append("مهمة روتينية منخفضة المخاطر على البنية التحتية")
        mitigations.append("اتباع دليل الإجراءات القياسي وتوثيق وقت الإنجاز")

    return {
        "risk_level": risk_level,
        "risk_factors": factors,
        "mitigation_suggestions": mitigations,
        "disclaimer": DISCLAIMER_TEXT,
    }
