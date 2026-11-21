# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

from pathlib import Path
p=Path(__file__).resolve().parents[1]/'backend/tests/browser_task_assignee.py'
s=p.read_text(encoding='utf-8').replace("page.get_by_role('option')", "page.locator('[role=option]')")
p.write_text(s,encoding='utf-8')
