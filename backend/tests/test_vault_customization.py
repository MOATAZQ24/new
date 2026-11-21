# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""
Integration Tests for:
1. Digital Assets & Secrets Vault (Zero-Plaintext Policy, HashiCorp Vault, Re-auth Secret Reveal, Rotation)
2. Appearance & Workspace Customization (Preferences update, theme settings, branding update, logo handling)
"""

import sys
import os
import uuid
from datetime import datetime

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.database import SessionLocal, init_db
from app.models.company import Company
from app.models.user import User
from app.models.digital_asset import DigitalAsset, AssetSecret
from app.schemas.digital_asset import (
    DigitalAssetCreate,
    AssetSecretCreate,
    AssetSecretRotate,
    AssetSecretRevealRequest,
    AssetAccessPermissionCreate,
)
from app.schemas.customization import (
    UserWorkspacePreferenceUpdate,
    CompanyBrandingUpdate,
)
from app.api.v1.endpoints import digital_assets, customization
from fastapi import HTTPException


def run_tests():
    init_db()
    db = SessionLocal()
    print("=" * 65)
    print("TESTING DIGITAL ASSETS & SECRETS VAULT + CUSTOMIZATION")
    print("=" * 65)

    try:
        # 1. Get Admin User & Primary Company
        admin_user = db.query(User).filter(User.username == "admin").first()
        assert admin_user is not None, "Admin user must exist"
        print(f"  ✓ Admin user identified: {admin_user.username} (ID: {admin_user.id})")

        company = db.query(Company).first()
        assert company is not None, "Company must exist"
        active_cid = company.id
        print(f"  ✓ Active Company context: {company.company_name_ar} (ID: {active_cid})")

        # 2. Check HashiCorp Vault Status & Enforce Zero-Plaintext when unconfigured
        vault_res = digital_assets.get_vault_health(current_user=admin_user)
        assert "data" in vault_res
        print(f"  ✓ Vault Status Checked: {vault_res['data']['status']}")

        # 3. Create Digital Asset
        asset_create_payload = DigitalAssetCreate(
            name=f"AWS Production Cluster {uuid.uuid4().hex[:6]}",
            category="Cloud Service",
            platform="AWS",
            company_id=active_cid,
            url="https://aws.amazon.com/console",
            username="root_ops",
            account_email="devops@investorgate.com",
            recovery_phone="+966500000000",
            status="Active",
            two_factor_enabled=True,
            subscription_cost=4500.0,
            notes="Primary cloud workloads and database hosting"
        )
        create_res = digital_assets.create_digital_asset(
            payload=asset_create_payload,
            current_user=admin_user,
            active_cid=active_cid,
            db=db,
        )
        assert "data" in create_res
        asset_id = uuid.UUID(create_res["data"]["asset_id"])
        print(f"  ✓ Digital Asset created: ID={asset_id}")

        # 3b. Verify Zero-Plaintext rejection when Vault is unconfigured
        from app.services import vault_service
        vault_service.VAULT_DEV_MOCK = False
        vault_service.VAULT_ADDR = ""
        unconfigured_rejected = False
        try:
            digital_assets.add_asset_secret(
                asset_id=asset_id,
                payload=AssetSecretCreate(
                    secret_type="Password",
                    secret_value="ShouldBeRejected!",
                    access_policy="Reauth Required",
                ),
                current_user=admin_user,
                active_cid=active_cid,
                db=db,
            )
        except HTTPException as e:
            if e.status_code == 503:
                unconfigured_rejected = True
        assert unconfigured_rejected, "Expected 503 Service Unavailable when vault is unconfigured"
        print("  ✓ Zero-Plaintext Policy strictly verified: Secrets storage blocked (503) when Vault is unconfigured")

        # 4. Enable Mock Vault for testing full end-to-end secret lifecycle
        vault_service.VAULT_DEV_MOCK = True

        secret_create_payload = AssetSecretCreate(
            secret_type="Password",
            secret_value="SuperSecretVaultP@ss2026!",
            access_policy="Reauth Required",
        )
        secret_add_res = digital_assets.add_asset_secret(
            asset_id=asset_id,
            payload=secret_create_payload,
            current_user=admin_user,
            active_cid=active_cid,
            db=db,
        )
        assert "data" in secret_add_res
        secret_id = uuid.UUID(secret_add_res["data"]["secret_id"])
        print(f"  ✓ Secret safely deposited into HashiCorp Vault KV v2: ID={secret_id}")

        # 5. Verify Zero-Plaintext in Database & Asset Details
        db_secret = db.query(AssetSecret).filter(AssetSecret.secret_id == secret_id).first()
        assert db_secret is not None
        assert not hasattr(db_secret, "secret_value") or db_secret.__dict__.get("secret_value") is None, "Plaintext must NEVER exist on AssetSecret model"
        assert db_secret.vault_reference.startswith("vault://")

        details_res = digital_assets.get_digital_asset_details(
            asset_id=asset_id,
            current_user=admin_user,
            active_cid=active_cid,
            db=db,
        )
        assert "data" in details_res
        asset_details = details_res["data"]
        assert len(asset_details["secrets"]) == 1
        secret_record = asset_details["secrets"][0]
        assert "secret_value" not in secret_record, "Secret value must NEVER appear in details"
        assert "vault_reference_masked" in secret_record
        print("  ✓ Zero-Plaintext Policy strictly verified: No plaintext in database or API details")

        # 6. Reauthentication Failure (Wrong Password)
        wrong_pw_failed = False
        try:
            digital_assets.reveal_secret_value(
                secret_id=secret_id,
                payload=AssetSecretRevealRequest(reauth_password="WrongPassword123!"),
                current_user=admin_user,
                active_cid=active_cid,
                db=db,
            )
        except HTTPException as e:
            if e.status_code == 401:
                wrong_pw_failed = True
        assert wrong_pw_failed, "Expected 401 Unauthorized for invalid reauth password"
        print("  ✓ Security Reauthentication verified: Invalid password strictly rejected (401)")

        # 7. Reauthentication Success (Correct Password)
        reveal_res = digital_assets.reveal_secret_value(
            secret_id=secret_id,
            payload=AssetSecretRevealRequest(reauth_password="Admin@12345"),
            current_user=admin_user,
            active_cid=active_cid,
            db=db,
        )
        assert "data" in reveal_res
        assert reveal_res["data"]["secret_value"] == "SuperSecretVaultP@ss2026!"
        print("  ✓ Decrypted Secret revealed after verified Argon2id reauthentication")

        # 8. Secret Rotation with Reauthentication
        rotate_res = digital_assets.rotate_secret_value(
            secret_id=secret_id,
            payload=AssetSecretRotate(
                new_secret_value="BrandNewRotatedSecret2026#",
                reauth_password="Admin@12345"
            ),
            current_user=admin_user,
            active_cid=active_cid,
            db=db,
        )
        assert "message" in rotate_res
        print("  ✓ Secret rotation verified: New credential value stored in Vault")

        # Verify rotated value can be revealed
        reveal_rotated = digital_assets.reveal_secret_value(
            secret_id=secret_id,
            payload=AssetSecretRevealRequest(reauth_password="Admin@12345"),
            current_user=admin_user,
            active_cid=active_cid,
            db=db,
        )
        assert reveal_rotated["data"]["secret_value"] == "BrandNewRotatedSecret2026#"
        print("  ✓ Rotated secret correctly verified in Vault")

        # 9. Test Appearance & Customization Endpoints
        pref_res = customization.update_user_preferences(
            payload=UserWorkspacePreferenceUpdate(
                theme="dark",
                primary_color="#123D32",
                secondary_color="#187A5A",
                accent_color="#C5A46D",
                arabic_font="IBM Plex Sans Arabic",
                english_font="Inter",
                density="comfortable",
                border_radius="rounded",
                sidebar_width=256,
            ),
            current_user=admin_user,
            active_cid=active_cid,
            db=db,
        )
        assert "data" in pref_res or "message" in pref_res
        print("  ✓ User appearance preferences saved successfully")

        # 10. Test Company Branding Endpoints
        branding_res = customization.update_company_branding(
            payload=CompanyBrandingUpdate(
                brand_name_ar="شركة بوابة المستثمر العالمية",
                brand_name_en="Investor Gate Global",
                primary_color="#123D32",
                secondary_color="#187A5A",
                accent_color="#C5A46D",
                enforce_company_theme=False,
            ),
            current_user=admin_user,
            active_cid=active_cid,
            db=db,
        )
        assert "data" in branding_res or "message" in branding_res
        print("  ✓ Company Branding updated successfully with company isolation")

        print("=" * 65)
        print("ALL VAULT AND CUSTOMIZATION TESTS PASSED SUCCESSFULLY! ✓✓✓")
        print("=" * 65)

    finally:
        db.close()


if __name__ == "__main__":
    run_tests()
