# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Secure HashiCorp Vault integration service for Digital Asset Secrets.
Adheres strictly to the Zero-Plaintext Storage security policy.
"""

import os
import uuid
import logging
from typing import Optional, Dict, Any
from urllib.parse import quote

import httpx

logger = logging.getLogger(__name__)

VAULT_ADDR = os.getenv("VAULT_ADDR", "").rstrip("/")
VAULT_TOKEN = os.getenv("VAULT_TOKEN", "")
VAULT_MOUNT = os.getenv("VAULT_MOUNT_POINT", "secret")
VAULT_DEV_MOCK = os.getenv("VAULT_DEV_MOCK", "").lower() in ("true", "1", "yes")

# In-memory secure mock store strictly for local dev/testing when Vault is unavailable
_DEV_MOCK_VAULT_STORE: Dict[str, str] = {}


class VaultSecurityException(Exception):
    """Raised when vault security checks fail or vault is not configured."""
    pass


def is_vault_configured() -> bool:
    """Check if external HashiCorp Vault address and authentication token are provided, or dev mock is active."""
    return bool(VAULT_ADDR and VAULT_TOKEN) or VAULT_DEV_MOCK


def get_vault_status() -> Dict[str, Any]:
    """Return status and configuration details for the secrets vault."""
    if VAULT_DEV_MOCK:
        return {
            "is_configured": True,
            "provider": "HashiCorp Vault KV v2 (Dev-Mock)",
            "vault_addr": "http://127.0.0.1:8200 (Mock)",
            "mount_point": VAULT_MOUNT,
            "status": "Ready",
            "mock_mode": True,
            "message": "وضع التطوير الآمن: محاكاة HashiCorp Vault KV v2 المشفرة نشطة للاختبارات والتطوير",
        }

    configured = bool(VAULT_ADDR and VAULT_TOKEN)
    if configured:
        # Check health
        try:
            with httpx.Client(timeout=3.0) as client:
                res = client.get(f"{VAULT_ADDR}/v1/sys/health")
                is_sealed = res.status_code == 503 or res.json().get("sealed", False)
                return {
                    "is_configured": True,
                    "provider": "HashiCorp Vault KV v2",
                    "vault_addr": VAULT_ADDR,
                    "mount_point": VAULT_MOUNT,
                    "is_sealed": is_sealed,
                    "status": "Sealed" if is_sealed else "Ready",
                    "message": "خزنة HashiCorp Vault متصلة ومفعلة للتخزين المشفر بالكامل",
                }
        except Exception as e:
            return {
                "is_configured": True,
                "provider": "HashiCorp Vault KV v2",
                "vault_addr": VAULT_ADDR,
                "mount_point": VAULT_MOUNT,
                "status": "Unreachable",
                "message": f"تعذر الاتصال بـ HashiCorp Vault: {str(e)}",
            }

    return {
        "is_configured": False,
        "provider": "HashiCorp Vault KV v2 (Required)",
        "vault_addr": None,
        "mount_point": VAULT_MOUNT,
        "status": "Disabled",
        "required_env": ["VAULT_ADDR", "VAULT_TOKEN"],
        "message": "خزنة الأسرار المشفرة غير مهيأة حالياً. لحماية البيانات ومنع تخزين الأسرار بنص صريح، تم تعطيل حفظ الأسرار لحين ضبط VAULT_ADDR و VAULT_TOKEN.",
    }


def store_secret_in_vault(asset_id: uuid.UUID, secret_type: str, secret_value: str) -> str:
    """Securely store a credential in HashiCorp Vault KV v2 and return reference key.
    Never stores plaintext credentials in the database.
    """
    if not is_vault_configured():
        raise VaultSecurityException(
            "خزنة الأسرار المشفرة (Secrets Vault) غير متصلة حالياً. "
            "النظام يطبق سياسة الأمان الإلزامية ويمنع تخزين كلمات المرور أو مفاتيح API بنص صريح (Plaintext). "
            "يرجى ضبط متغيرات البيئة VAULT_ADDR و VAULT_TOKEN لتفعيل الحفظ المشفر."
        )

    safe_secret_type = quote(secret_type.replace(" ", "_").lower())
    path = f"investor-gate/digital-assets/{asset_id}/{safe_secret_type}"

    if VAULT_DEV_MOCK:
        ref = f"vault://{VAULT_MOUNT}/data/{path}"
        _DEV_MOCK_VAULT_STORE[ref] = secret_value
        return ref

    url = f"{VAULT_ADDR}/v1/{VAULT_MOUNT}/data/{path}"

    headers = {
        "X-Vault-Token": VAULT_TOKEN,
        "Content-Type": "application/json",
    }
    payload = {
        "data": {
            "value": secret_value,
            "asset_id": str(asset_id),
            "secret_type": secret_type,
        }
    }

    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.post(url, headers=headers, json=payload)
            if resp.status_code not in (200, 204):
                raise VaultSecurityException(f"فشل حفظ السر في HashiCorp Vault: كود {resp.status_code} - {resp.text}")
            return f"vault://{VAULT_MOUNT}/data/{path}"
    except httpx.RequestError as e:
        raise VaultSecurityException(f"خطأ في الاتصال مع HashiCorp Vault: {str(e)}")


def retrieve_secret_from_vault(vault_reference: str) -> str:
    """Retrieve secret plaintext directly from HashiCorp Vault after successful reauthentication.
    Never returns or logs secrets in application tables.
    """
    if not is_vault_configured():
        raise VaultSecurityException("خزنة الأسرار المشفرة غير مهيأة. لا يمكن استرجاع السر.")

    if not vault_reference.startswith("vault://"):
        raise VaultSecurityException("مرجع الخزنة غير صالح")

    if VAULT_DEV_MOCK:
        if vault_reference in _DEV_MOCK_VAULT_STORE:
            return _DEV_MOCK_VAULT_STORE[vault_reference]
        raise VaultSecurityException("السر غير موجود في الخزنة")

    # Parse vault://{mount}/{path}
    clean_ref = vault_reference.replace("vault://", "")
    url = f"{VAULT_ADDR}/v1/{clean_ref}"

    headers = {
        "X-Vault-Token": VAULT_TOKEN,
    }

    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.get(url, headers=headers)
            if resp.status_code != 200:
                raise VaultSecurityException(f"فشل استرجاع السر من الخزنة: {resp.status_code}")
            data = resp.json()
            secret_val = data.get("data", {}).get("data", {}).get("value")
            if not secret_val:
                raise VaultSecurityException("القيمة السرية غير موجودة في سجل الخزنة")
            return secret_val
    except httpx.RequestError as e:
        raise VaultSecurityException(f"تعذر الاتصال بـ HashiCorp Vault: {str(e)}")


def delete_secret_from_vault(vault_reference: str) -> bool:
    """Permanently delete a secret from HashiCorp Vault."""
    if not is_vault_configured() or not vault_reference.startswith("vault://"):
        return False

    if VAULT_DEV_MOCK:
        _DEV_MOCK_VAULT_STORE.pop(vault_reference, None)
        return True

    clean_ref = vault_reference.replace("vault://", "").replace("/data/", "/metadata/")
    url = f"{VAULT_ADDR}/v1/{clean_ref}"

    headers = {"X-Vault-Token": VAULT_TOKEN}
    try:
        with httpx.Client(timeout=5.0) as client:
            client.delete(url, headers=headers)
            return True
    except Exception as e:
        logger.warning(f"Failed to delete secret from vault: {str(e)}")
        return False
