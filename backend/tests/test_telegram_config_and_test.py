# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

import sys
import os
import uuid
from datetime import datetime

# Setup path
sys.path.insert(0, os.path.abspath("backend"))

from app.core.database import SessionLocal
from app.models.user import User, Employee
from app.models.company import Company
from app.models.integration import IntegrationConfig, IntegrationLog
from app.services.telegram_service import get_telegram_worker_status, get_telegram_config
from app.api.v1.endpoints import telegram as telegram_ep
from sqlalchemy.orm.attributes import flag_modified

def test_telegram_config_suite():
    print("=================================================================")
    print("STARTING TEST SUITE: TELEGRAM CONFIGURATION & WORKER STATUS")
    print("=================================================================")

    db = SessionLocal()
    try:
        # 1. Setup company and admin user
        company = db.query(Company).first()
        assert company is not None, "Company must exist"
        admin = db.query(User).filter(User.username == "admin").first()
        assert admin is not None, "Admin user must exist"

        # 2. Verify worker status reporting
        w_status = get_telegram_worker_status()
        print(f"  ✓ Worker status: {w_status['status_label']} (is_running={w_status['is_running']}, PID={w_status['pid']})")
        assert "is_running" in w_status, "Worker status must include is_running"
        assert "status_label" in w_status, "Worker status must include status_label"
        assert isinstance(w_status["is_running"], bool), "is_running must be boolean"

        # Backup original configuration to restore in finally
        orig_record = db.query(IntegrationConfig).filter(
            IntegrationConfig.company_id == company.id,
            IntegrationConfig.service_name == "telegram",
        ).first()
        orig_config_data = dict(orig_record.config_data) if orig_record and orig_record.config_data else None
        orig_is_enabled = orig_record.is_enabled if orig_record else None

        # 3. Test Config Update
        test_chat_id = "987654321"
        test_token = "1234567890:ABCdefGhIJKlmNoPQRsTUVwxyZ1234"
        update_payload = telegram_ep.TelegramConfigUpdate(
            bot_token=test_token,
            bot_username="InvestorGateTestBot",
            chat_id=test_chat_id,
            is_enabled=True,
            notify_on_assigned=True,
            notify_on_completed=True,
        )
        res_update = telegram_ep.update_telegram_config(
            payload=update_payload,
            current_user=admin,
            active_cid=company.id,
            db=db,
        )
        assert "تم تحديث" in res_update.get("message", "")
        print("  ✓ update_telegram_config: Successfully persisted bot_token, bot_username, chat_id, and is_enabled=True")

        # 4. Test Status Endpoint Masking
        status_res = telegram_ep.get_telegram_status(
            current_user=admin,
            active_cid=company.id,
            db=db,
        )
        data = status_res["data"]
        assert data["is_configured"] is True
        assert data["is_enabled"] is True
        assert data["chat_id"] == test_chat_id
        assert data["bot_username"] == "InvestorGateTestBot"
        assert data["bot_token_masked"] is not None
        # Must NOT expose raw token
        assert test_token not in str(status_res)
        assert data["bot_token_masked"].startswith("123456...")
        print(f"  ✓ Zero-Plaintext verified: Masked token returned as '{data['bot_token_masked']}'")
        assert "is_running" in data["worker_status"]
        assert isinstance(data["worker_status"]["is_running"], bool)
        print(f"  ✓ Status API worker check: {data['worker_status']['status_label']}")

        # 5. Test Connection Endpoint (Invalid Token / getMe error handling)
        conn_res = telegram_ep.test_telegram_connection_endpoint(
            payload=telegram_ep.TestConnectionRequest(bot_token="invalid_token_12345"),
            current_user=admin,
            active_cid=company.id,
            db=db,
        )
        print(f"  ✓ test_telegram_connection: Handled invalid token cleanly -> {conn_res['message']}")
        assert conn_res["data"]["success"] is False

        # 6. Test Notification Endpoint
        test_notif_res = telegram_ep.send_test_notification_endpoint(
            payload=telegram_ep.TestNotificationRequest(
                chat_id=test_chat_id,
                custom_message="اختبار إشعار من اختبار الوحدة الآلي",
            ),
            current_user=admin,
            active_cid=company.id,
            db=db,
        )
        print(f"  ✓ send_test_notification: Response -> {test_notif_res['message']}")

        # Verify integration log recorded
        log_entry = (
            db.query(IntegrationLog)
            .filter(IntegrationLog.company_id == company.id, IntegrationLog.service_name == "telegram")
            .order_by(IntegrationLog.created_at.desc())
            .first()
        )
        assert log_entry is not None
        assert log_entry.event_type == "test.notification"
        # Zero-plaintext in logs: verify raw token is not in payload or error message
        assert test_token not in str(log_entry.payload)
        assert test_token not in str(log_entry.error_message)
        print("  ✓ Integration Log verified: Safe audit entry recorded without token exposure")

        print("=================================================================")
        print("ALL TELEGRAM CONFIGURATION TESTS PASSED SUCCESSFULLY! ✓✓✓")
        print("=================================================================")

    finally:
        if orig_record is not None and orig_config_data is not None:
            rec = db.query(IntegrationConfig).filter(
                IntegrationConfig.company_id == company.id,
                IntegrationConfig.service_name == "telegram",
            ).first()
            if rec:
                rec.config_data = orig_config_data
                rec.is_enabled = orig_is_enabled
                flag_modified(rec, "config_data")
                db.commit()
                print("  ✓ Restored original Telegram configuration after test suite execution.")
        db.close()

if __name__ == "__main__":
    test_telegram_config_suite()
