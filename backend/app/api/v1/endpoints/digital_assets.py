import uuid
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, get_user_company_id, require_role, verify_password
from app.core.response import success_response, paginate
from app.models.user import User, Employee
from app.models.company import Company, Branch
from app.models.digital_asset import DigitalAsset, AssetSecret, AssetAccessPermission
from app.schemas.digital_asset import (
    DigitalAssetCreate,
    DigitalAssetUpdate,
    AssetSecretCreate,
    AssetSecretRotate,
    AssetSecretRevealRequest,
    AssetAccessPermissionCreate,
    AssetAccessPermissionUpdate,
)
from app.services.audit_service import log_audit
from app.services.vault_service import (
    is_vault_configured,
    get_vault_status,
    store_secret_in_vault,
    retrieve_secret_from_vault,
    delete_secret_from_vault,
    VaultSecurityException,
)

router = APIRouter(prefix="/digital-assets", tags=["Digital Assets & Secrets Vault"])


def check_asset_access(
    asset: DigitalAsset,
    user: User,
    db: Session,
    require_secret_access: bool = False,
    require_admin: bool = False,
) -> bool:
    """Validate server-side user permissions on a specific digital asset."""
    if user.is_superadmin:
        return True

    # Owner has full rights
    if asset.owner_id == user.id:
        return True

    perm = db.query(AssetAccessPermission).filter(
        AssetAccessPermission.asset_id == asset.asset_id,
        AssetAccessPermission.user_id == user.id,
        AssetAccessPermission.status == "Active",
    ).first()

    if not perm:
        return False

    if perm.expires_at and perm.expires_at < datetime.utcnow():
        return False

    if require_admin and perm.access_level not in ["Owner", "Admin"]:
        return False

    if require_secret_access and not (perm.can_reveal_secrets or perm.access_level in ["Owner", "Admin"]):
        return False

    return True


# ── Digital Assets CRUD ───────────────────────────────────────────────

@router.get("")
def list_digital_assets(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    company_id: Optional[uuid.UUID] = None,
    branch_id: Optional[uuid.UUID] = None,
    category: Optional[str] = None,
    platform: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """List digital assets with company isolation. NEVER includes secrets in output."""
    target_cid = company_id or active_cid
    query = db.query(DigitalAsset).filter(DigitalAsset.company_id == target_cid)

    if branch_id:
        query = query.filter(DigitalAsset.branch_id == branch_id)
    if category:
        query = query.filter(DigitalAsset.category == category)
    if platform:
        query = query.filter(DigitalAsset.platform == platform)
    if status_filter:
        query = query.filter(DigitalAsset.status == status_filter)
    if search:
        s = f"%{search}%"
        query = query.filter(
            (DigitalAsset.name.ilike(s))
            | (DigitalAsset.platform.ilike(s))
            | (DigitalAsset.username.ilike(s))
            | (DigitalAsset.account_email.ilike(s))
            | (DigitalAsset.url.ilike(s))
        )

    total = query.count()
    items = (
        query.order_by(DigitalAsset.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    data = []
    for a in items:
        assigned_name = a.assigned_employee.full_name if a.assigned_employee else None
        secrets_count = len(a.secrets)
        data.append({
            "asset_id": str(a.asset_id),
            "name": a.name,
            "category": a.category,
            "platform": a.platform,
            "company_id": str(a.company_id),
            "company_name": a.company.company_name_ar if a.company else None,
            "branch_id": str(a.branch_id) if a.branch_id else None,
            "branch_name": a.branch.branch_name if a.branch else None,
            "url": a.url,
            "username": a.username,
            "account_email": a.account_email,
            "recovery_email": a.recovery_email,
            "recovery_phone": a.recovery_phone,
            "two_factor_method": a.two_factor_method or "Authenticator App (TOTP)",
            "two_factor_phone": a.two_factor_phone,
            "domain_registrar": a.domain_registrar,
            "nameservers": a.nameservers,
            "subscription_tier": a.subscription_tier,
            "payment_method": a.payment_method,
            "assigned_employee_id": str(a.assigned_employee_id) if a.assigned_employee_id else None,
            "assigned_employee_name": assigned_name,
            "status": a.status,
            "subscription_cost": a.subscription_cost,
            "two_factor_enabled": a.two_factor_enabled,
            "expires_at": a.expires_at,
            "secrets_count": secrets_count,
            "created_at": a.created_at,
        })

    pagination = paginate(total=total, page=page, per_page=per_page)
    return success_response(data=data, pagination=pagination)


@router.post("")
def create_digital_asset(
    payload: DigitalAssetCreate,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Create a new digital asset metadata record."""
    target_cid = payload.company_id or active_cid

    asset = DigitalAsset(
        name=payload.name.strip(),
        category=payload.category.strip(),
        platform=payload.platform.strip(),
        company_id=target_cid,
        branch_id=payload.branch_id,
        url=payload.url,
        username=payload.username,
        account_email=payload.account_email,
        recovery_email=payload.recovery_email,
        recovery_phone=payload.recovery_phone,
        two_factor_method=payload.two_factor_method or "Authenticator App (TOTP)",
        two_factor_phone=payload.two_factor_phone,
        domain_registrar=payload.domain_registrar,
        nameservers=payload.nameservers,
        subscription_tier=payload.subscription_tier,
        payment_method=payload.payment_method,
        assigned_employee_id=payload.assigned_employee_id,
        owner_id=current_user.id,
        status=payload.status,
        expires_at=payload.expires_at,
        subscription_cost=payload.subscription_cost,
        two_factor_enabled=payload.two_factor_enabled,
        notes=payload.notes,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)

    # Automatically grant Owner permission to creator
    perm = AssetAccessPermission(
        asset_id=asset.asset_id,
        user_id=current_user.id,
        company_id=target_cid,
        access_level="Owner",
        can_reveal_secrets=True,
        granted_by=current_user.id,
        status="Active",
    )
    db.add(perm)
    db.commit()

    log_audit(
        db=db,
        action="CREATE",
        resource_type="DigitalAsset",
        resource_id=str(asset.asset_id),
        user_id=current_user.id,
        company_id=target_cid,
        new_values={"name": asset.name, "platform": asset.platform, "category": asset.category},
    )

    return success_response(
        data={"asset_id": str(asset.asset_id), "name": asset.name},
        message="تم إنشاء الأصل الرقمي بنجاح",
    )


@router.get("/{asset_id}")
def get_digital_asset_details(
    asset_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Get full details drawer for a digital asset, including masked secrets and permissions."""
    asset = db.query(DigitalAsset).filter(DigitalAsset.asset_id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="الأصل الرقمي غير موجود")

    if not current_user.is_superadmin and asset.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية الوصول إلى هذا الأصل")

    user_can_reveal = check_asset_access(asset, current_user, db, require_secret_access=True)

    # Format secrets list (strictly without plaintext!)
    secrets_data = [
        {
            "secret_id": str(s.secret_id),
            "secret_type": s.secret_type,
            "access_policy": s.access_policy,
            "vault_reference_masked": f"vault://.../{s.secret_type.lower()}",
            "last_rotated": s.last_rotated,
            "rotation_due": s.rotation_due,
            "last_accessed": s.last_accessed,
            "status": s.status,
            "created_at": s.created_at,
        }
        for s in asset.secrets
    ]

    # Format permissions list
    perms_data = [
        {
            "permission_id": str(p.permission_id),
            "user_id": str(p.user_id),
            "username": p.user.username if p.user else "مستخدم",
            "full_name": p.user.employee.full_name if p.user and p.user.employee else None,
            "access_level": p.access_level,
            "can_reveal_secrets": p.can_reveal_secrets,
            "granted_at": p.granted_at,
            "expires_at": p.expires_at,
            "status": p.status,
        }
        for p in asset.permissions
    ]

    data = {
        "asset_id": str(asset.asset_id),
        "name": asset.name,
        "category": asset.category,
        "platform": asset.platform,
        "company_id": str(asset.company_id),
        "company_name": asset.company.company_name_ar if asset.company else None,
        "branch_id": str(asset.branch_id) if asset.branch_id else None,
        "branch_name": asset.branch.branch_name if asset.branch else None,
        "url": asset.url,
        "username": asset.username,
        "account_email": asset.account_email,
        "recovery_email": asset.recovery_email,
        "recovery_phone": asset.recovery_phone,
        "two_factor_method": asset.two_factor_method or "Authenticator App (TOTP)",
        "two_factor_phone": asset.two_factor_phone,
        "domain_registrar": asset.domain_registrar,
        "nameservers": asset.nameservers,
        "subscription_tier": asset.subscription_tier,
        "payment_method": asset.payment_method,
        "assigned_employee_id": str(asset.assigned_employee_id) if asset.assigned_employee_id else None,
        "assigned_employee_name": asset.assigned_employee.full_name if asset.assigned_employee else None,
        "owner_id": str(asset.owner_id) if asset.owner_id else None,
        "owner_name": asset.owner.username if asset.owner else None,
        "status": asset.status,
        "subscription_cost": asset.subscription_cost,
        "two_factor_enabled": asset.two_factor_enabled,
        "notes": asset.notes,
        "expires_at": asset.expires_at,
        "created_at": asset.created_at,
        "updated_at": asset.updated_at,
        "can_reveal_secrets": user_can_reveal,
        "secrets": secrets_data,
        "permissions": perms_data,
    }
    return success_response(data=data)


@router.put("/{asset_id}")
def update_digital_asset(
    asset_id: uuid.UUID,
    payload: DigitalAssetUpdate,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Update digital asset metadata."""
    asset = db.query(DigitalAsset).filter(DigitalAsset.asset_id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="الأصل الرقمي غير موجود")

    if not current_user.is_superadmin and asset.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية التعديل على هذا الأصل")

    if payload.name is not None:
        asset.name = payload.name.strip()
    if payload.category is not None:
        asset.category = payload.category.strip()
    if payload.platform is not None:
        asset.platform = payload.platform.strip()
    if payload.branch_id is not None:
        asset.branch_id = payload.branch_id
    if payload.url is not None:
        asset.url = payload.url
    if payload.username is not None:
        asset.username = payload.username
    if payload.account_email is not None:
        asset.account_email = payload.account_email
    if payload.recovery_email is not None:
        asset.recovery_email = payload.recovery_email
    if payload.recovery_phone is not None:
        asset.recovery_phone = payload.recovery_phone
    if payload.two_factor_method is not None:
        asset.two_factor_method = payload.two_factor_method
    if payload.two_factor_phone is not None:
        asset.two_factor_phone = payload.two_factor_phone
    if payload.domain_registrar is not None:
        asset.domain_registrar = payload.domain_registrar
    if payload.nameservers is not None:
        asset.nameservers = payload.nameservers
    if payload.subscription_tier is not None:
        asset.subscription_tier = payload.subscription_tier
    if payload.payment_method is not None:
        asset.payment_method = payload.payment_method
    if payload.assigned_employee_id is not None:
        asset.assigned_employee_id = payload.assigned_employee_id
    if payload.status is not None:
        asset.status = payload.status
    if payload.expires_at is not None:
        asset.expires_at = payload.expires_at
    if payload.subscription_cost is not None:
        asset.subscription_cost = payload.subscription_cost
    if payload.two_factor_enabled is not None:
        asset.two_factor_enabled = payload.two_factor_enabled
    if payload.notes is not None:
        asset.notes = payload.notes

    asset.updated_at = datetime.utcnow()
    db.commit()

    log_audit(
        db=db,
        action="UPDATE",
        resource_type="DigitalAsset",
        resource_id=str(asset.asset_id),
        user_id=current_user.id,
        company_id=asset.company_id,
        new_values=payload.model_dump(exclude_unset=True),
    )

    return success_response(message="تم تحديث بيانات الأصل الرقمي بنجاح")


@router.delete("/{asset_id}")
def delete_digital_asset(
    asset_id: uuid.UUID,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Delete digital asset and its associated secrets from Vault."""
    asset = db.query(DigitalAsset).filter(DigitalAsset.asset_id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="الأصل الرقمي غير موجود")

    if not current_user.is_superadmin and asset.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية الحذف")

    # Clean up secrets in vault
    for s in asset.secrets:
        try:
            delete_secret_from_vault(s.vault_reference)
        except Exception:
            pass

    log_audit(
        db=db,
        action="DELETE",
        resource_type="DigitalAsset",
        resource_id=str(asset.asset_id),
        user_id=current_user.id,
        company_id=asset.company_id,
    )

    db.delete(asset)
    db.commit()
    return success_response(message="تم حذف الأصل الرقمي بنجاح")


# ── Vault & Secrets Operations ────────────────────────────────────────

@router.get("/vault/status")
def get_vault_health(
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
):
    """Check HashiCorp Vault connection and security readiness."""
    status_info = get_vault_status()
    return success_response(data=status_info)


@router.post("/{asset_id}/secrets")
def add_asset_secret(
    asset_id: uuid.UUID,
    payload: AssetSecretCreate,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Add a credential secret directly into HashiCorp Vault. ZERO plaintext stored in database."""
    asset = db.query(DigitalAsset).filter(DigitalAsset.asset_id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="الأصل الرقمي غير موجود")

    if not current_user.is_superadmin and asset.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية إضافة أسرار لهذا الأصل")

    try:
        vault_ref = store_secret_in_vault(
            asset_id=asset.asset_id,
            secret_type=payload.secret_type,
            secret_value=payload.secret_value,
        )
    except VaultSecurityException as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))

    secret = AssetSecret(
        asset_id=asset.asset_id,
        secret_type=payload.secret_type,
        vault_reference=vault_ref,
        access_policy=payload.access_policy,
        last_rotated=datetime.utcnow(),
        rotation_due=payload.rotation_due,
        status="Active",
    )
    db.add(secret)
    db.commit()
    db.refresh(secret)

    log_audit(
        db=db,
        action="ADD_SECRET",
        resource_type="AssetSecret",
        resource_id=str(secret.secret_id),
        user_id=current_user.id,
        company_id=asset.company_id,
        new_values={"secret_type": payload.secret_type, "vault_reference": vault_ref},
    )

    return success_response(
        data={"secret_id": str(secret.secret_id), "secret_type": secret.secret_type},
        message="تم حفظ السر بنجاح داخل خزنة الأسرار المشفرة (HashiCorp Vault)",
    )


@router.post("/secrets/{secret_id}/reveal")
def reveal_secret_value(
    secret_id: uuid.UUID,
    payload: AssetSecretRevealRequest,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Retrieve decrypted secret from HashiCorp Vault. Reauthentication is strictly required."""
    # 1. Strictly verify password for reauthentication
    if not verify_password(payload.reauth_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="كلمة المرور غير صحيحة. إعادة المصادقة مطلوبة للوصول إلى الأسرار وكلمات المرور.",
        )

    secret = db.query(AssetSecret).filter(AssetSecret.secret_id == secret_id).first()
    if not secret:
        raise HTTPException(status_code=404, detail="السر غير موجود")

    asset = secret.digital_asset
    if not current_user.is_superadmin and asset.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية الوصول إلى هذا الأصل")

    # 2. Check secret reveal permissions
    has_perm = check_asset_access(asset, current_user, db, require_secret_access=True)
    if not has_perm:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية كشف الأسرار (Reveal Permission) لهذا الأصل")

    # 3. Retrieve plaintext from Vault
    try:
        secret_plaintext = retrieve_secret_from_vault(secret.vault_reference)
    except VaultSecurityException as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))

    # 4. Record secret access timestamp
    secret.last_accessed = datetime.utcnow()
    db.commit()

    # 5. Log audit (ZERO secret values recorded in audit log!)
    log_audit(
        db=db,
        action="REVEAL_SECRET",
        resource_type="AssetSecret",
        resource_id=str(secret.secret_id),
        user_id=current_user.id,
        company_id=asset.company_id,
        new_values={"asset_name": asset.name, "secret_type": secret.secret_type},
    )

    return success_response(
        data={"secret_value": secret_plaintext, "secret_type": secret.secret_type},
        message="تم كشف السر بنجاح بعد التحقق من الهوية والصلاحيات",
    )


@router.post("/secrets/{secret_id}/rotate")
def rotate_secret_value(
    secret_id: uuid.UUID,
    payload: AssetSecretRotate,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Rotate secret value in HashiCorp Vault. Reauthentication required."""
    if not verify_password(payload.reauth_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="كلمة المرور غير صحيحة.")

    secret = db.query(AssetSecret).filter(AssetSecret.secret_id == secret_id).first()
    if not secret:
        raise HTTPException(status_code=404, detail="السر غير موجود")

    asset = secret.digital_asset
    if not check_asset_access(asset, current_user, db, require_admin=True):
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية تدوير السر لهذا الأصل")

    try:
        new_ref = store_secret_in_vault(
            asset_id=asset.asset_id,
            secret_type=secret.secret_type,
            secret_value=payload.new_secret_value,
        )
    except VaultSecurityException as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))

    secret.vault_reference = new_ref
    secret.last_rotated = datetime.utcnow()
    secret.status = "Active"
    db.commit()

    log_audit(
        db=db,
        action="ROTATE_SECRET",
        resource_type="AssetSecret",
        resource_id=str(secret.secret_id),
        user_id=current_user.id,
        company_id=asset.company_id,
        new_values={"secret_type": secret.secret_type},
    )

    return success_response(message="تم تدوير وتحديث السر بنجاح في خزنة الأسرار")


@router.delete("/secrets/{secret_id}")
def delete_asset_secret(
    secret_id: uuid.UUID,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Revoke and delete a secret from Vault and database."""
    secret = db.query(AssetSecret).filter(AssetSecret.secret_id == secret_id).first()
    if not secret:
        raise HTTPException(status_code=404, detail="السر غير موجود")

    asset = secret.digital_asset
    if not current_user.is_superadmin and asset.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية الحذف")

    try:
        delete_secret_from_vault(secret.vault_reference)
    except Exception:
        pass

    log_audit(
        db=db,
        action="DELETE_SECRET",
        resource_type="AssetSecret",
        resource_id=str(secret.secret_id),
        user_id=current_user.id,
        company_id=asset.company_id,
    )

    db.delete(secret)
    db.commit()
    return success_response(message="تم حذف السر بنجاح من الخزنة والنظام")


# ── Permissions Management ───────────────────────────────────────────

@router.post("/{asset_id}/permissions")
def grant_asset_permission(
    asset_id: uuid.UUID,
    payload: AssetAccessPermissionCreate,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Grant or update user permissions on a digital asset."""
    asset = db.query(DigitalAsset).filter(DigitalAsset.asset_id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="الأصل الرقمي غير موجود")

    if not current_user.is_superadmin and asset.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية إدارة الصلاحيات")

    existing = db.query(AssetAccessPermission).filter(
        AssetAccessPermission.asset_id == asset.asset_id,
        AssetAccessPermission.user_id == payload.user_id,
    ).first()

    if existing:
        existing.access_level = payload.access_level
        existing.can_reveal_secrets = payload.can_reveal_secrets
        existing.expires_at = payload.expires_at
        existing.status = "Active"
    else:
        perm = AssetAccessPermission(
            asset_id=asset.asset_id,
            user_id=payload.user_id,
            company_id=asset.company_id,
            access_level=payload.access_level,
            can_reveal_secrets=payload.can_reveal_secrets,
            granted_by=current_user.id,
            expires_at=payload.expires_at,
            status="Active",
        )
        db.add(perm)

    db.commit()

    log_audit(
        db=db,
        action="GRANT_PERMISSION",
        resource_type="AssetAccessPermission",
        resource_id=str(asset.asset_id),
        user_id=current_user.id,
        company_id=asset.company_id,
        new_values={"target_user": str(payload.user_id), "level": payload.access_level, "can_reveal": payload.can_reveal_secrets},
    )

    return success_response(message="تم منح الصلاحيات بنجاح")


@router.delete("/permissions/{permission_id}")
def revoke_asset_permission(
    permission_id: uuid.UUID,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin", "IT Manager"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Revoke user permission from a digital asset."""
    perm = db.query(AssetAccessPermission).filter(AssetAccessPermission.permission_id == permission_id).first()
    if not perm:
        raise HTTPException(status_code=404, detail="الصلاحية غير موجودة")

    if not current_user.is_superadmin and perm.company_id != active_cid:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية الإلغاء")

    perm.status = "Revoked"
    db.commit()

    log_audit(
        db=db,
        action="REVOKE_PERMISSION",
        resource_type="AssetAccessPermission",
        resource_id=str(perm.permission_id),
        user_id=current_user.id,
        company_id=perm.company_id,
    )

    return success_response(message="تم إلغاء الصلاحية بنجاح")
