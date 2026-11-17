"""Advanced Arabic & Bilingual NLP Pipeline for Investor Gate OS AI Agent 2.0.

Provides:
-Orthographic Arabic normalization (MSA + Saudi/Gulf dialect + informal spelling)
-Clitic/preposition segmentation and missing-space repair (e.g. لمعتز, ويشيك, وخليه)
-Natural-language relative & weekday date extraction in Asia/Riyadh timezone
-Dialect-aware multi-task & multi-intent clause extraction without inventing tasks
-Typo-tolerant fuzzy entity matching powered by RapidFuzz
-Adversarial prompt-injection and secret-exfiltration guardrails
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

try:
    from zoneinfo import ZoneInfo
    RIYADH_TZ = ZoneInfo("Asia/Riyadh")
except Exception:
    RIYADH_TZ = timezone(timedelta(hours=3))

try:
    from rapidfuzz import fuzz
except ImportError:  # pragma: no cover
    fuzz = None  # type: ignore


DIACRITICS_RE = re.compile(r"[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]")
EASTERN_DIGITS_MAP = str.maketrans("٠١٢٣٤٥٦٧٨٩٫", "0123456789.")
ORTHO_MAP = str.maketrans({
    "أ": "ا",
    "إ": "ا",
    "آ": "ا",
    "ٱ": "ا",
    "ة": "ه",
    "ى": "ي",
    "ؤ": "و",
    "ئ": "ي",
})

ARABIC_NUMBER_WORDS: Dict[str, int] = {
    "واحد": 1, "واحدة": 1, "واحده": 1, "اول": 1, "أول": 1,
    "اثنين": 2, "إثنين": 2, "اثنان": 2, "ثنتين": 2, "ثنتان": 2,
    "ثلاث": 3, "ثلاثة": 3, "ثلاثه": 3, "تلث": 3,
    "اربع": 4, "أربع": 4, "اربعة": 4, "أربعة": 4, "اربعه": 4,
    "خمس": 5, "خمسة": 5, "خمسه": 5,
    "ست": 6, "ستة": 6, "سته": 6,
    "سبع": 7, "سبعة": 7, "سبعه": 7,
    "ثمان": 8, "ثمانية": 8, "ثمانيه": 8, "تمان": 8,
    "تسع": 9, "تسعة": 9, "تسعه": 9,
    "عشر": 10, "عشرة": 10, "عشره": 10,
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
}

WEEKDAYS_AR: Dict[str, int] = {
    "الاثنين": 0, "الإثنين": 0, "اثنين": 0, "monday": 0,
    "الثلاثاء": 1, "ثلاثاء": 1, "tuesday": 1,
    "الاربعاء": 2, "الأربعاء": 2, "اربعاء": 2, "wednesday": 2,
    "الخميس": 3, "خميس": 3, "thursday": 3,
    "الجمعة": 4, "الجمعه": 4, "جمعة": 4, "friday": 4,
    "السبت": 5, "سبت": 5, "saturday": 5,
    "الاحد": 6, "الأحد": 6, "احد": 6, "sunday": 6,
}

# Common IT & operational typo / dialect term canonicalization
DIALECT_ACTION_VERBS: List[Tuple[re.Pattern, str]] = [
    (re.compile(r"\b(?:و?\s*)?(?:يشيك|تشيك|شيك|يشيّك|شيّك)\s+(?:على\s+|ع\s+)?", re.I), "فحص ومراجعة "),
    (re.compile(r"\b(?:و?\s*)?(?:يصلح|صلح|تصلح|يضبط|ضبط|يزبط|زبط)\s+", re.I), "إصلاح وصيانة "),
    (re.compile(r"\b(?:و?\s*)?(?:يحدث|حدث|يرقي|رقي)\s+", re.I), "تحديث وترقية "),
    (re.compile(r"\b(?:و?\s*)?(?:يركب|ركب|يثبت|ثبت)\s+", re.I), "تركيب وتثبيت "),
    (re.compile(r"\b(?:و?\s*)?(?:يفحص|افحص)\s+", re.I), "فحص "),
    (re.compile(r"\b(?:و?\s*)?(?:يراجع|راجع)\s+", re.I), "مراجعة "),
    (re.compile(r"\b(?:و?\s*)?(?:يتابع|تابع)\s+", re.I), "متابعة "),
]

SPELLING_CORRECTIONS: List[Tuple[re.Pattern, str]] = [
    (re.compile(r"\bال?سرفر(?:ات)?\b", re.I), "السيرفر"),
    (re.compile(r"\bسرفر\b", re.I), "سيرفر"),
    (re.compile(r"\bالشبكه\b", re.I), "الشبكة"),
    (re.compile(r"\bشبكه\b", re.I), "شبكة"),
    (re.compile(r"\bالنسخه\b", re.I), "النسخة"),
    (re.compile(r"\bالراوترر?\b", re.I), "الراوتر"),
    (re.compile(r"\bالتذكره\b", re.I), "التذكرة"),
    (re.compile(r"\bتذكره\b", re.I), "تذكرة"),
    (re.compile(r"\bمهمه\b", re.I), "مهمة"),
    (re.compile(r"\bمهمات\b", re.I), "مهام"),
    (re.compile(r"\bعاجله\b", re.I), "عاجلة"),
    (re.compile(r"\bمكتمله\b", re.I), "مكتملة"),
    (re.compile(r"\bمتاخره\b", re.I), "متأخرة"),
    (re.compile(r"\bمتأخره\b", re.I), "متأخرة"),
]

PROMPT_INJECTION_PATTERNS = re.compile(
    r"(?:"
    r"ignore\s+(?:all\s+|any\s+)?(?:previous|prior|system)\s+(?:instructions|prompts|rules|permissions)"
    r"|(?:تجاهل|تجاوز|ألغ|الغاء|إلغاء)\s+(?:كل\s+|جميع\s+)?(?:التعليمات|الأوامر|القواعد|الصلاحيات|الحماية|العزل|القيود)\b"
    r"|(?:كل\s+الشركات|جميع\s+الشركات|all\s+tenants|all\s+companies)\s+.*?(?:تجاهل|تجاوز|bypass)"
    r"|bypass\s+(?:rbac|permissions|security|tenant|auth)"
    r"|\b(?:drop\s+table|union\s+select|delete\s+from\s+users|insert\s+into\s+users|update\s+users\s+set)\b"
    r"|(?:اعرض|اطبع|أظهر|هات|كشف|استخرج|read|reveal|print|show|dump|list|get)\s+.*?(?:api[_\s]?key|bot[_\s]?token|password[_\s]?hash|passwords?|secret[_\s]?key|vault|secrets?|كلمات\s+المرور|كلمة\s+المرور|الأسرار|اسرار|مفتاح\s*api|توكن\s*البوت)"
    r")",
    flags=re.I,
)


def riyadh_today() -> date:
    """Return current date in Asia/Riyadh timezone."""
    return datetime.now(RIYADH_TZ).date()


def normalize_arabic_key(text: Optional[str]) -> str:
    """Normalize Arabic/English string for fuzzy & token comparison."""
    if not text:
        return ""
    cleaned = DIACRITICS_RE.sub("", str(text)).translate(EASTERN_DIGITS_MAP).translate(ORTHO_MAP).lower()
    cleaned = re.sub(r"[^\w\s]", " ", cleaned)
    return " ".join(cleaned.split())


def repair_missing_spaces_and_typos(text: str) -> str:
    """Repair common missing spaces and dialectal typos internally without altering proper names."""
    if not text:
        return ""
    out = DIACRITICS_RE.sub("", text).translate(EASTERN_DIGITS_MAP)
    # Separate clitic conjunctions attached to dialectal verbs: "ويشيك" -> "و يشيك", "وخليه" -> "و خليه", "وأرسل" -> "و أرسل"
    out = re.sub(r"(?:^|\s)و(?=(?:يشيك|تشيك|شيك|يصلح|صلح|يضبط|يفحص|يراجع|يحدث|يركب|خليه|خلي|خل|ارسل|أرسل|بلغ|نبه|مهمة|مهمه)\b)", " و ", out)
    # Normalize "خليه يخلصهن" / "خليه يخلصها" / "خليها تخلص" deadline wrappers into space before deadline
    out = re.sub(r"\b(?:و?\s*)?(?:خليه|خليها|خليهم|خلي|خل|لازم|بحيث)\s+(?:يخلصهن|يخلصها|يخلصهم|ينجزها|ينجزهن|ينهيها|ينهيهم|تخلص|ينتهي(?:\s+منها)?)\s*", " ", out)
    for pat, repl in SPELLING_CORRECTIONS:
        out = pat.sub(repl, out)
    return re.sub(r"\s+", " ", out).strip()


def detect_adversarial_or_secret_probe(text: str) -> Optional[str]:
    """Return a security rejection message if the input attempts prompt injection, SQLi, or secret exfiltration."""
    if not text:
        return None
    if PROMPT_INJECTION_PATTERNS.search(text):
        return (
            "⛔ تم رفض الطلب بواسطة جدار الحماية الأمني للوكيل الذكي: "
            "لا يُسمح بتجاوز صلاحيات النظام أو استخراج مفاتيح التكامل السرية أو تنفيذ أوامر غير مصرح بها."
        )
    return None


def extract_natural_date_riyadh(text: str, base_date: Optional[date] = None) -> Tuple[Optional[str], str]:
    """Extract natural-language relative or explicit date in Asia/Riyadh timezone and return (iso_date, cleaned_text)."""
    today = base_date or riyadh_today()
    work = text.translate(EASTERN_DIGITS_MAP)
    low = work.lower()

    # 1. Explicit ISO YYYY-MM-DD
    m_iso = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", work)
    if m_iso:
        cleaned = work.replace(m_iso.group(1), " ").strip()
        return m_iso.group(1), cleaned

    # 2. Relative days: "خلال 5 أيام" / "خلال خمس ايام" / "بعد 3 أيام" / "in 5 days" / "within 3 days"
    num_tokens = "|".join(sorted(ARABIC_NUMBER_WORDS.keys(), key=len, reverse=True))
    m_rel_days = re.search(
        rf"(?:خلال|بعد|في\s+غضون|مدتها|لمدة|قبل\s+مرور|\bin\b|\bwithin\b)\s*(\d+|{num_tokens})\s*(?:أيام|ايام|يومًا|يوما|يوم|days?|d\b)",
        work,
        flags=re.I,
    )
    if m_rel_days:
        raw_n = m_rel_days.group(1).strip().lower()
        days_n = int(raw_n) if raw_n.isdigit() else ARABIC_NUMBER_WORDS.get(raw_n, ARABIC_NUMBER_WORDS.get(normalize_arabic_key(raw_n), 1))
        target = (today + timedelta(days=max(1, min(days_n, 365)))).isoformat()
        cleaned = (work[:m_rel_days.start()] + " " + work[m_rel_days.end():]).strip()
        return target, cleaned

    # Dual Arabic forms: "خلال يومين" / "بعد يومين" / "خلال اسبوعين" / "خلال أسبوع"
    m_dual = re.search(
        r"(?:خلال|بعد|في\s+غضون|لمدة|\bin\b|\bwithin\b)\s*(يومين|يومان|أسبوعين|اسبوعين|أسبوع|اسبوع|شهر|two\s+days|a\s+week|next\s+week|1\s+week)",
        work,
        flags=re.I,
    )
    if m_dual:
        tok = normalize_arabic_key(m_dual.group(1))
        delta = 2 if "يوم" in tok or "two" in tok else (14 if "اسبوعين" in tok else (30 if "شهر" in tok else 7))
        target = (today + timedelta(days=delta)).isoformat()
        cleaned = (work[:m_dual.start()] + " " + work[m_dual.end():]).strip()
        return target, cleaned

    # 3. Day after tomorrow
    m_dat = re.search(r"(?:في\s+)?(بعد\s+غد|بعد\s+بكرة|بعد\s+بكره|\bday\s+after\s+tomorrow\b)", work, flags=re.I)
    if m_dat:
        cleaned = (work[:m_dat.start()] + " " + work[m_dat.end():]).strip()
        return (today + timedelta(days=2)).isoformat(), cleaned

    # 4. Tomorrow ("غدًا", "غدا", "بكرة", "لبكرة", "بكره", "tomorrow")
    m_tom = re.search(r"(?:في\s+|موعدها\s+|خليها\s+|ل(?=بكر|غد))?(غدا|غداً|غدًا|بكرة|بكره|\btomorrow\b)", work, flags=re.I)
    if m_tom:
        cleaned = (work[:m_tom.start()] + " " + work[m_tom.end():]).strip()
        return (today + timedelta(days=1)).isoformat(), cleaned

    # 5. Today ("اليوم", "الآن", "هاليوم", "today")
    m_tod = re.search(r"(?:في\s+|خلال\s+)?(اليوم|هاليوم|\btoday\b)", work, flags=re.I)
    if m_tod:
        cleaned = (work[:m_tod.start()] + " " + work[m_tod.end():]).strip()
        return today.isoformat(), cleaned

    # 6. Named weekday: "الأحد القادم" / "يوم الخميس الجاي" / "next Sunday"
    weekday_keys = "|".join(sorted(WEEKDAYS_AR.keys(), key=len, reverse=True))
    m_wk = re.search(
        rf"(?:يوم\s+|في\s+|\bnext\s+|\bon\s+)?({weekday_keys})(?:\s+(?:القادم|الجاي|المقبل))?",
        work,
        flags=re.I,
    )
    if m_wk and re.search(r"(يوم|القادم|الجاي|المقبل|next\s+)", m_wk.group(0), flags=re.I):
        w_tok = m_wk.group(1).strip().lower()
        target_wd = WEEKDAYS_AR.get(w_tok, WEEKDAYS_AR.get(normalize_arabic_key(w_tok), 0))
        days_ahead = (target_wd - today.weekday()) % 7
        if days_ahead == 0:
            days_ahead = 7
        cleaned = (work[:m_wk.start()] + " " + work[m_wk.end():]).strip()
        return (today + timedelta(days=days_ahead)).isoformat(), cleaned

    return None, work


def extract_dialect_task_clauses(raw_body: str) -> List[str]:
    """Split a dialect or MSA compound task description into concrete individual task titles without inventing tasks."""
    body = repair_missing_spaces_and_typos(raw_body)
    # Strip leading task-count phrases like "اربع مهمات" / "4 مهام" / "مهمتين" / "عدة مهام"
    num_tokens = "|".join(sorted(ARABIC_NUMBER_WORDS.keys(), key=len, reverse=True))
    body = re.sub(
        rf"^(?:(?:عدد\s+)?(?:\d+|{num_tokens}|عدة|مجموعة)\s+)?(?:مهمتين|مهمتان|مهام|مهمات|مهمة|tasks?)\s*[:،,\-]?\s*",
        "",
        body,
        flags=re.I,
    ).strip()

    # Split on explicit task separators or coordinated action verbs
    segments = re.split(
        r"(?:\r?\n+|\s*[،,;]\s*|\s+(?:و\s*)?(?:مهمة|مهمه|وأخرى|واخرى|أخرى|task)\s*[:\-]?\s*|\s+\d+[\).\-]\s*|\s+و(?=\s*(?:يشيك|تشيك|شيك|يصلح|صلح|يضبط|ضبط|يفحص|فحص|يراجع|مراجعة|يحدث|تحديث|يركب|تركيب|يتابع|متابعة|إصلاح|اصلاح|تهيئة|تثبيت|تغيير|إعداد|اعداد)\b)|\s+\band\b\s+)",
        body,
        flags=re.I,
    )

    cleaned_clauses: List[str] = []
    for seg in segments:
        s = seg.strip(" .،,:-")
        if not s:
            continue
        for pat, repl in DIALECT_ACTION_VERBS:
            s = pat.sub(repl, s)
        s = re.sub(r"\s+", " ", s).strip(" .،,:-")
        if len(re.sub(r"[\W_]+", "", s)) >= 3:
            cleaned_clauses.append(s)

    return cleaned_clauses


def fuzzy_rank_employee_candidates(
    query_name: str,
    candidates: Sequence[Dict[str, Any]],
    threshold: float = 77.0,
) -> List[Dict[str, Any]]:
    """Rank serialized employee dicts against a query string using RapidFuzz (typo-tolerant)."""
    norm_q = normalize_arabic_key(query_name)
    if not norm_q or len(norm_q) < 2:
        return []

    scored: List[Tuple[float, Dict[str, Any]]] = []
    q_tokens = norm_q.split()

    for emp in candidates:
        full_norm = normalize_arabic_key(emp.get("full_name"))
        num_norm = normalize_arabic_key(emp.get("employee_number"))
        user_norm = normalize_arabic_key(emp.get("username"))
        job_norm = normalize_arabic_key(emp.get("job_title"))

        # Exact employee number or username match
        if norm_q == num_norm or (user_norm and norm_q == user_norm):
            scored.append((100.0, emp))
            continue

        # All query tokens are substrings of normalized full_name
        if all(t in full_norm for t in q_tokens):
            exact_bonus = 100.0 if full_norm == norm_q else 95.0
            scored.append((exact_bonus, emp))
            continue

        if fuzz is not None:
            # Check token-level similarity against full_name tokens so first-name typos like "معنز" match "معتز قاسم"
            emp_tokens = full_norm.split()
            token_scores = []
            for qt in q_tokens:
                best_tok = max((fuzz.ratio(qt, et) for et in emp_tokens), default=0.0)
                token_scores.append(best_tok)
            avg_token_score = sum(token_scores) / len(token_scores) if token_scores else 0.0
            w_score = max(
                fuzz.WRatio(norm_q, full_norm),
                fuzz.token_set_ratio(norm_q, full_norm),
                avg_token_score,
                fuzz.partial_ratio(norm_q, f"{full_norm} {job_norm} {num_norm}") if len(norm_q) >= 4 else 0.0,
            )
            if avg_token_score >= threshold or w_score >= threshold:
                scored.append((float(max(avg_token_score, w_score)), emp))

    if not scored:
        return []

    max_score = max(s for s, _ in scored)
    # Keep top tier matches within 6 points of max_score so two employees with the same name both stay!
    cutoff = max(threshold, max_score - 6.0)
    filtered = [emp for s, emp in sorted(scored, key=lambda x: x[0], reverse=True) if s >= cutoff]
    return filtered
