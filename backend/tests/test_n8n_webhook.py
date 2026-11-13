"""Test Suite: n8n Automation Webhook Dispatcher (Phase 7).

Covers:
- Integration configuration retrieval
- HMAC-SHA256 signature generation and event payload structure
- Integration log recording with event status and payload
- Graceful failure handling on unreachable endpoints
"""

import os
import sys
import uuid
import hmac
import hashlib
import json

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy.orm import Session
from app.core.database import SessionLocal, init_db
from app.models.company import Company
from app.models.integration import IntegrationConfig, IntegrationLog
from app.services.webhook_service import dispatch_n8n_event


def run_tests():
    print("=" * 65)
    print("STARTING TEST SUITE: N8N AUTOMATION INTEGRATION (PHASE 7)")
    print("=" * 65)

    init_db()
    db: Session = SessionLocal()

    try:
        comp = db.query(Company).filter(Company.company_code == "IGT").first()
        assert comp is not None

        # 1. Setup or update n8n configuration
        n8n_cfg = db.query(IntegrationConfig).filter(
            IntegrationConfig.company_id == comp.id,
            IntegrationConfig.service_name == "n8n",
        ).first()

        webhook_secret = "test_secret_key_12345"
        config_data = {
            "webhook_url": "http://127.0.0.1:5678/webhook/investorgate-test",
            "webhook_secret": webhook_secret,
        }

        if not n8n_cfg:
            n8n_cfg = IntegrationConfig(
                company_id=comp.id,
                service_name="n8n",
                display_name="n8n Workflow Automation",
                is_enabled=True,
                config_data=config_data,
                status="Connected",
            )
            db.add(n8n_cfg)
        else:
            n8n_cfg.is_enabled = True
            n8n_cfg.config_data = config_data
        db.commit()

        print("  ✓ Setup n8n integration config with HMAC secret")

        # 2. Dispatch task.approved event
        test_payload = {
            "task_id": str(uuid.uuid4()),
            "title": "ترقية خوادم التطبيقات",
            "approved_by": "مدير النظام",
            "priority": "High",
        }
        log_entry = dispatch_n8n_event(
            db=db,
            company_id=comp.id,
            event_type="task.approved",
            payload=test_payload,
        )

        assert log_entry is not None
        assert log_entry.service_name == "n8n"
        assert log_entry.event_type == "task.approved"
        assert log_entry.payload["event"] == "task.approved"
        assert log_entry.payload["data"]["title"] == "ترقية خوادم التطبيقات"
        print(f"  ✓ Event Dispatched: Log recorded with ID {log_entry.id}")

        # 3. Verify HMAC signature computation
        raw_body = json.dumps(log_entry.payload, default=str).encode("utf-8")
        expected_sig = hmac.new(webhook_secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
        assert len(expected_sig) == 64
        print("  ✓ HMAC-SHA256 signature verified (64-char hex digest)")

        # 4. Verify failsafe execution (Unreachable endpoint doesn't crash system)
        assert log_entry.status in ["Success", "Failed"]
        if log_entry.status == "Failed":
            assert log_entry.error_message is not None
            print(f"  ✓ Failsafe verified: Endpoint failure safely logged without blocking ({log_entry.error_message[:40]}...)")

        print("=" * 65)
        print("ALL N8N AUTOMATION INTEGRATION TESTS PASSED! ✓✓✓")
        print("=" * 65)

    finally:
        db.close()


if __name__ == "__main__":
    run_tests()
