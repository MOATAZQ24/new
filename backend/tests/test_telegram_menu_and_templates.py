"""Test suite for No-Code Telegram Bot Menu Builder and Arabic Message Templates."""

import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import uuid
from datetime import datetime

from app.core.database import SessionLocal, init_db
from app.models.company import Company
from app.models.user import User, Employee
from app.models.telegram import TelegramBotMenuConfig, TelegramMessageTemplate, TelegramUserLink
from app.services.telegram_service import (
    get_or_create_default_menu_configs,
    get_or_create_default_message_templates,
    build_telegram_reply_keyboard,
    render_template,
    verify_telegram_link,
    unlink_employee_telegram,
)

def run_menu_and_template_tests():
    init_db()
    db = SessionLocal()
    try:
        print("=================================================================")
        print("STARTING TEST SUITE: BOT MENU BUILDER & MESSAGE TEMPLATES")
        print("=================================================================")

        company = db.query(Company).first()
        assert company is not None, "At least one company must exist"
        company_id = company.id

        # 1. Test Seed Default Menu Items
        menu_items = get_or_create_default_menu_configs(db, company_id)
        assert len(menu_items) >= 4, "Must seed at least 4 default menu items"
        labels = [m.label for m in menu_items]
        assert any("مهامي" in l for l in labels), "Must have 'مهامي' button"
        assert any("تذاكري" in l for l in labels), "Must have 'تذاكري' button"
        print(f"  ✓ Default Menu Items Seeded ({len(menu_items)} items): {', '.join(labels)}")

        # 2. Test Dynamic Reply Keyboard Generation
        kb = build_telegram_reply_keyboard(db, company_id)
        assert kb is not None, "Reply keyboard must be generated"
        assert "keyboard" in kb, "Reply keyboard must have 'keyboard' structure"
        assert kb["resize_keyboard"] is True, "Must set resize_keyboard=True"
        assert kb["is_persistent"] is True, "Must set is_persistent=True"
        print(f"  ✓ Dynamic Reply Keyboard Built: {len(kb['keyboard'])} rows of buttons")

        # 3. Test Add Custom Menu Button
        custom_btn = TelegramBotMenuConfig(
            company_id=company_id,
            label="📞 الاتصال بالطوارئ",
            action="cmd:emergency",
            menu_type="reply_keyboard",
            sort_order=10,
            is_enabled=True,
            icon="📞",
            description_ar="الاتصال بفريق الطوارئ التقنية",
        )
        db.add(custom_btn)
        db.commit()

        kb2 = build_telegram_reply_keyboard(db, company_id)
        all_buttons = [btn["text"] for row in kb2["keyboard"] for btn in row]
        assert "📞 الاتصال بالطوارئ" in all_buttons, "Custom button must appear in generated keyboard"
        print("  ✓ Custom Menu Button Added and verified in generated keyboard")

        # Clean up custom button
        db.delete(custom_btn)
        db.commit()

        # 4. Test Seed Default Message Templates
        templates = get_or_create_default_message_templates(db, company_id)
        assert len(templates) >= 3, "Must seed at least 3 default templates"
        keys = [t.template_key for t in templates]
        assert "welcome" in keys, "Must include 'welcome' template"
        assert "link_success" in keys, "Must include 'link_success' template"
        assert "task_assigned" in keys, "Must include 'task_assigned' template"
        print(f"  ✓ Default Arabic Message Templates Seeded: {', '.join(keys)}")

        # 5. Test Template Rendering with Placeholders
        welcome_tmpl = next(t for t in templates if t.template_key == "welcome")
        sample_ctx = {
            "employee_name": "سعود القحطاني",
            "company_name": "شركة بوابة المستثمر",
        }
        rendered = render_template(welcome_tmpl.content_ar, sample_ctx)
        assert "سعود القحطاني" in rendered, "Rendered template must contain employee name"
        assert "شركة بوابة المستثمر" in rendered, "Rendered template must contain company name"
        assert "{" not in rendered and "}" not in rendered, "All recognized placeholders must be replaced"
        print("  ✓ Safe Template Rendering Verified without missing placeholders")

        # 6. Test Unlink & Relink with Strict 1:1 Identity
        emp1 = db.query(Employee).filter(Employee.company_id == company_id).first()
        emp2 = db.query(Employee).filter(Employee.company_id == company_id, Employee.id != emp1.id).first()
        assert emp1 and emp2, "Must have at least two employees for relink test"

        test_tg_id = "777888999"
        test_chat_id = "777888999"

        # Link emp1
        from app.services.telegram_service import generate_telegram_link_token
        tok1_data = generate_telegram_link_token(db, emp1.id, company_id)
        tok1 = tok1_data["token"]
        verify_telegram_link(db, tok1, test_tg_id, test_chat_id, "test_user")

        link1 = db.query(TelegramUserLink).filter(TelegramUserLink.employee_id == emp1.id).first()
        assert link1.is_verified is True
        assert link1.telegram_user_id == test_tg_id
        print("  ✓ Employee 1 Linked successfully to test Telegram account")

        # Now link emp2 to the SAME telegram account -> emp1 must be revoked automatically
        tok2_data = generate_telegram_link_token(db, emp2.id, company_id)
        tok2 = tok2_data["token"]
        verify_telegram_link(db, tok2, test_tg_id, test_chat_id, "test_user")

        db.refresh(link1)
        link2 = db.query(TelegramUserLink).filter(TelegramUserLink.employee_id == emp2.id).first()

        assert link1.is_verified is False, "Previous employee link MUST be revoked when relinked to another employee"
        assert link1.telegram_user_id is None, "Previous employee telegram_user_id must be cleared"
        assert link2.is_verified is True, "New employee must be active and verified"
        assert link2.telegram_user_id == test_tg_id, "New employee must hold the telegram account"
        print("  ✓ Strict 1:1 Identity Enforcement verified: old employee revoked, new employee linked cleanly")

        # Test explicit unlink
        unlink_ok = unlink_employee_telegram(db, emp2.id)
        assert unlink_ok is True
        db.refresh(link2)
        assert link2.is_verified is False
        assert link2.telegram_user_id is None
        print("  ✓ Explicit Unlink verified: account cleared immediately without deleting record")

        print("=================================================================")
        print("ALL BOT MENU & MESSAGE TEMPLATES TESTS PASSED SUCCESSFULLY! ✓✓✓")
        print("=================================================================")

    finally:
        db.close()

if __name__ == "__main__":
    run_menu_and_template_tests()
