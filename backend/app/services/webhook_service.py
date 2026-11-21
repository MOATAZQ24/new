# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Outbound Webhook Dispatcher Service for n8n Automation.

Handles:
- Event formatting for operational lifecycle events:
  task.assigned, task.overdue, task.approved, ticket.critical, asset.assigned, subscription.expiring
- HMAC-SHA256 authenticated delivery using shared integration secret
- Comprehensive logging in `integration_logs`
- Non-blocking execution (failsafe delivery)
"""

import hmac
import hashlib
import json
import logging
import urllib.request
import urllib.parse
from datetime import datetime
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session

from app.models.integration import IntegrationConfig, IntegrationLog

logger = logging.getLogger(__name__)


def dispatch_n8n_event(
    db: Session,
    company_id: Optional[Any],
    event_type: str,
    payload: Dict[str, Any],
) -> Optional[IntegrationLog]:
    """Dispatch an event payload to configured n8n webhook endpoint."""
    if not company_id:
        return None

    # Retrieve n8n integration configuration for this company
    cfg = db.query(IntegrationConfig).filter(
        IntegrationConfig.company_id == company_id,
        IntegrationConfig.service_name == "n8n",
        IntegrationConfig.is_enabled == True,
    ).first()

    if not cfg or not cfg.config_data:
        return None

    webhook_url = cfg.config_data.get("webhook_url", "").strip()
    webhook_secret = cfg.config_data.get("webhook_secret", "").strip() or "investorgate_n8n_default_secret"

    if not webhook_url or not webhook_url.startswith("http"):
        return None

    full_payload = {
        "event": event_type,
        "company_id": str(company_id),
        "timestamp": datetime.utcnow().isoformat(),
        "data": payload,
    }
    body_bytes = json.dumps(full_payload, default=str).encode("utf-8")

    # Compute HMAC-SHA256 signature
    signature = hmac.new(
        webhook_secret.encode("utf-8"),
        body_bytes,
        hashlib.sha256,
    ).hexdigest()

    log_entry = IntegrationLog(
        company_id=company_id,
        service_name="n8n",
        event_type=event_type,
        status="Pending",
        payload=full_payload,
    )
    db.add(log_entry)
    db.commit()

    # Outbound POST delivery
    try:
        req = urllib.request.Request(
            webhook_url,
            data=body_bytes,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "InvestorGate-Automation/1.0",
                "X-InvestorGate-Event": event_type,
                "X-InvestorGate-Signature": signature,
            },
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            resp_body = resp.read().decode("utf-8")
            log_entry.status = "Success"
            try:
                log_entry.response_data = json.loads(resp_body)
            except Exception:
                log_entry.response_data = {"raw": resp_body[:500]}
    except Exception as e:
        logger.warning(f"n8n webhook dispatch to {webhook_url} failed: {e}")
        log_entry.status = "Failed"
        log_entry.error_message = str(e)

    db.commit()
    return log_entry
