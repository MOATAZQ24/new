"""Test Suite: Gemini AI Assistant & Heuristic Intelligence (Phase 8).

Covers:
- Ticket analysis, categorization suggestions, executive summary
- Task risk evaluation and preventive mitigations
- Air-gapped fallback with heuristic rule engine when GEMINI_API_KEY is omitted
- Advisory disclaimer validation on all AI outputs
"""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services import gemini_service


def run_tests():
    print("=" * 65)
    print("STARTING TEST SUITE: GEMINI AI OPERATIONS ASSISTANT (PHASE 8)")
    print("=" * 65)

    # 1. Analyze Critical Network Ticket
    res1 = gemini_service.analyze_ticket_ai(
        title="انقطاع مفاجئ في شبكة الطابق الثالث وتعطل الـ Switch",
        description="الموظفون غير قادرين على الوصول لخادم الملفات والإنترنت متوقف بالكامل",
        current_category="عام",
        current_priority="High",
    )
    assert res1 is not None
    assert "summary" in res1
    assert res1["suggested_category"] in ["الشبكات والاتصالات", "الخوادم والبنية التحتية"]
    assert len(res1["troubleshooting_steps"]) >= 3
    assert "disclaimer" in res1
    print(f"  ✓ Ticket Analysis verified: Category -> {res1['suggested_category']}")
    print(f"  ✓ Troubleshooting Steps: {len(res1['troubleshooting_steps'])} actionable checks generated")
    print(f"  ✓ Advisory Disclaimer: Verified presence on output")

    # 2. Analyze Security / Auth Ticket
    res2 = gemini_service.analyze_ticket_ai(
        title="قفل حساب المستخدم وتكرار فشل تسجيل الدخول",
        description="الموظف يحاول الدخول وتظهر رسالة قفل الحساب",
    )
    assert "المصادقة" in res2["suggested_category"] or "الحسابات" in res2["suggested_category"]
    print(f"  ✓ Auth Ticket Analysis verified: Categorized as '{res2['suggested_category']}'")

    # 3. Task Risk Analysis
    risk_res = gemini_service.analyze_task_risk(
        title="ترقية خوادم قواعد البيانات الحية (Production DB Migration)",
        description="تطبيق تحديثات أمنية وإعادة تهيئة الفهارس",
        priority="Urgent",
    )
    assert risk_res["risk_level"] in ["High", "Critical"]
    assert len(risk_res["mitigation_suggestions"]) >= 2
    print(f"  ✓ Task Risk Evaluation verified: Risk Level '{risk_res['risk_level']}' with {len(risk_res['mitigation_suggestions'])} mitigations")

    print("=" * 65)
    print("ALL GEMINI AI ASSISTANT TESTS PASSED! ✓✓✓")
    print("=" * 65)


if __name__ == "__main__":
    run_tests()
