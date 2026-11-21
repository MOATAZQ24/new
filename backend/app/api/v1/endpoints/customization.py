# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, get_user_company_id, require_role
from app.core.response import success_response
from app.models.user import User
from app.models.company import Company
from app.models.customization import UserWorkspacePreference, CompanyBranding
from app.schemas.customization import UserWorkspacePreferenceUpdate, CompanyBrandingUpdate
from app.services.audit_service import log_audit

router = APIRouter(prefix="/customization", tags=["Appearance & Workspace Customization"])

DEFAULT_DASHBOARD_LAYOUT = [
    {"id": "quick_actions", "enabled": True, "order": 1, "title": "الإجراءات السريعة"},
    {"id": "alerts", "enabled": True, "order": 2, "title": "تنبيهات التذاكر والاشتراكات"},
    {"id": "kpis_primary", "enabled": True, "order": 3, "title": "مؤشرات الأداء الرئيسية (الأصول، البنية، التذاكر، المهام)"},
    {"id": "kpis_financial", "enabled": True, "order": 4, "title": "المؤشرات المالية والصيانة (الاشتراكات، الصيانة، الموظفون)"},
    {"id": "asset_distribution", "enabled": True, "order": 5, "title": "توزيع حالات الأصول التقنية"},
    {"id": "ticket_priorities", "enabled": True, "order": 6, "title": "أولويات تذاكر الدعم الفني"},
    {"id": "recent_activity", "enabled": True, "order": 7, "title": "سجل العمليات والرقابة الأخير"},
]


def get_or_create_user_preference(db: Session, user_id: uuid.UUID, company_id: Optional[uuid.UUID]) -> UserWorkspacePreference:
    pref = db.query(UserWorkspacePreference).filter(UserWorkspacePreference.user_id == user_id).first()
    if not pref:
        pref = UserWorkspacePreference(
            user_id=user_id,
            company_id=company_id,
            theme="system",
            primary_color="#123D32",
            secondary_color="#187A5A",
            background_color="#F5F7F8",
            surface_color="#FFFFFF",
            accent_color="#C5A46D",
            arabic_font="IBM Plex Sans Arabic",
            english_font="Inter",
            font_size="medium",
            font_weight="normal",
            density="comfortable",
            border_radius="rounded",
            sidebar_width=256,
            sidebar_collapsed=False,
            pinned_nav=[],
            hidden_nav=[],
            nav_order=[],
            dashboard_layout=DEFAULT_DASHBOARD_LAYOUT,
            table_preferences={},
        )
        db.add(pref)
        db.commit()
        db.refresh(pref)
    return pref


def get_or_create_company_branding(db: Session, company_id: uuid.UUID) -> CompanyBranding:
    branding = db.query(CompanyBranding).filter(CompanyBranding.company_id == company_id).first()
    if not branding:
        company = db.query(Company).filter(Company.id == company_id).first()
        branding = CompanyBranding(
            company_id=company_id,
            company_logo=company.company_logo if company else None,
            brand_name_ar=company.company_name_ar if company else None,
            brand_name_en=company.company_name_en if company else None,
            primary_color="#123D32",
            secondary_color="#187A5A",
            accent_color="#C5A46D",
            enforce_company_theme=False,
        )
        db.add(branding)
        db.commit()
        db.refresh(branding)
    return branding


@router.get("/preferences")
def get_user_preferences(
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Retrieve workspace and appearance preferences for current authenticated user."""
    pref = get_or_create_user_preference(db, current_user.id, active_cid)
    branding = get_or_create_company_branding(db, active_cid)

    # If company enforces branding colors, reflect them
    effective_primary = branding.primary_color if (branding.enforce_company_theme and branding.primary_color) else pref.primary_color
    effective_secondary = branding.secondary_color if (branding.enforce_company_theme and branding.secondary_color) else pref.secondary_color
    effective_accent = branding.accent_color if (branding.enforce_company_theme and branding.accent_color) else pref.accent_color

    data = {
        "id": str(pref.id),
        "user_id": str(pref.user_id),
        "theme": pref.theme,
        "primary_color": effective_primary,
        "secondary_color": effective_secondary,
        "background_color": pref.background_color,
        "surface_color": pref.surface_color,
        "accent_color": effective_accent,
        "arabic_font": pref.arabic_font,
        "english_font": pref.english_font,
        "font_size": pref.font_size,
        "font_weight": pref.font_weight,
        "density": pref.density,
        "border_radius": pref.border_radius,
        "sidebar_width": pref.sidebar_width,
        "sidebar_collapsed": pref.sidebar_collapsed,
        "pinned_nav": pref.pinned_nav or [],
        "hidden_nav": pref.hidden_nav or [],
        "nav_order": pref.nav_order or [],
        "dashboard_layout": pref.dashboard_layout or DEFAULT_DASHBOARD_LAYOUT,
        "table_preferences": pref.table_preferences or {},
        "company_branding": {
            "company_logo": branding.company_logo,
            "favicon_url": branding.favicon_url,
            "brand_name_ar": branding.brand_name_ar,
            "enforce_company_theme": branding.enforce_company_theme,
        },
    }
    return success_response(data=data)


@router.put("/preferences")
def update_user_preferences(
    payload: UserWorkspacePreferenceUpdate,
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Update current user's workspace preferences (theme, colors, layout, density, tables)."""
    pref = get_or_create_user_preference(db, current_user.id, active_cid)

    if payload.theme is not None:
        pref.theme = payload.theme
    if payload.primary_color is not None:
        pref.primary_color = payload.primary_color
    if payload.secondary_color is not None:
        pref.secondary_color = payload.secondary_color
    if payload.background_color is not None:
        pref.background_color = payload.background_color
    if payload.surface_color is not None:
        pref.surface_color = payload.surface_color
    if payload.accent_color is not None:
        pref.accent_color = payload.accent_color

    if payload.arabic_font is not None:
        pref.arabic_font = payload.arabic_font
    if payload.english_font is not None:
        pref.english_font = payload.english_font
    if payload.font_size is not None:
        pref.font_size = payload.font_size
    if payload.font_weight is not None:
        pref.font_weight = payload.font_weight

    if payload.density is not None:
        pref.density = payload.density
    if payload.border_radius is not None:
        pref.border_radius = payload.border_radius
    if payload.sidebar_width is not None:
        pref.sidebar_width = payload.sidebar_width
    if payload.sidebar_collapsed is not None:
        pref.sidebar_collapsed = payload.sidebar_collapsed

    if payload.pinned_nav is not None:
        pref.pinned_nav = payload.pinned_nav
    if payload.hidden_nav is not None:
        pref.hidden_nav = payload.hidden_nav
    if payload.nav_order is not None:
        pref.nav_order = payload.nav_order

    if payload.dashboard_layout is not None:
        pref.dashboard_layout = payload.dashboard_layout
    if payload.table_preferences is not None:
        existing = pref.table_preferences or {}
        existing.update(payload.table_preferences)
        pref.table_preferences = existing

    db.commit()
    return success_response(message="تم حفظ تخصيصات الواجهة بنجاح")


@router.post("/preferences/reset")
def reset_user_preferences(
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Restore all workspace settings to default Investor Gate design system."""
    pref = get_or_create_user_preference(db, current_user.id, active_cid)
    pref.theme = "system"
    pref.primary_color = "#123D32"
    pref.secondary_color = "#187A5A"
    pref.background_color = "#F5F7F8"
    pref.surface_color = "#FFFFFF"
    pref.accent_color = "#C5A46D"
    pref.arabic_font = "IBM Plex Sans Arabic"
    pref.english_font = "Inter"
    pref.font_size = "medium"
    pref.font_weight = "normal"
    pref.density = "comfortable"
    pref.border_radius = "rounded"
    pref.sidebar_width = 256
    pref.sidebar_collapsed = False
    pref.pinned_nav = []
    pref.hidden_nav = []
    pref.nav_order = []
    pref.dashboard_layout = DEFAULT_DASHBOARD_LAYOUT
    pref.table_preferences = {}

    db.commit()
    return success_response(message="تمت استعادة الإعدادات الافتراضية للواجهة بنجاح")


@router.get("/branding")
def get_company_branding(
    current_user: User = Depends(get_current_user),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Get active company's branding and logo."""
    branding = get_or_create_company_branding(db, active_cid)
    company = db.query(Company).filter(Company.id == active_cid).first()

    data = {
        "company_id": str(active_cid),
        "company_name_ar": company.company_name_ar if company else "",
        "company_name_en": company.company_name_en if company else "",
        "company_logo": branding.company_logo or (company.company_logo if company else None),
        "favicon_url": branding.favicon_url,
        "brand_name_ar": branding.brand_name_ar,
        "brand_name_en": branding.brand_name_en,
        "primary_color": branding.primary_color or "#123D32",
        "secondary_color": branding.secondary_color or "#187A5A",
        "accent_color": branding.accent_color or "#C5A46D",
        "enforce_company_theme": branding.enforce_company_theme,
    }
    return success_response(data=data)


@router.put("/branding")
def update_company_branding(
    payload: CompanyBrandingUpdate,
    current_user: User = Depends(require_role(["Super Admin", "Company Admin"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Update company branding, upload logos, or enforce company palette."""
    branding = get_or_create_company_branding(db, active_cid)
    company = db.query(Company).filter(Company.id == active_cid).first()

    if payload.company_logo is not None:
        branding.company_logo = payload.company_logo
        if company:
            company.company_logo = payload.company_logo
    if payload.favicon_url is not None:
        branding.favicon_url = payload.favicon_url
    if payload.brand_name_ar is not None:
        branding.brand_name_ar = payload.brand_name_ar
    if payload.brand_name_en is not None:
        branding.brand_name_en = payload.brand_name_en
    if payload.primary_color is not None:
        branding.primary_color = payload.primary_color
    if payload.secondary_color is not None:
        branding.secondary_color = payload.secondary_color
    if payload.accent_color is not None:
        branding.accent_color = payload.accent_color
    if payload.enforce_company_theme is not None:
        branding.enforce_company_theme = payload.enforce_company_theme

    db.commit()

    log_audit(
        db=db,
        action="UPDATE",
        resource_type="CompanyBranding",
        resource_id=str(active_cid),
        user_id=current_user.id,
        company_id=active_cid,
        new_values={"has_logo": bool(branding.company_logo), "enforce": branding.enforce_company_theme},
    )

    return success_response(message="تم تحديث الهوية البصرية وشعار الشركة بنجاح")


@router.delete("/branding/logo")
def delete_company_logo(
    current_user: User = Depends(require_role(["Super Admin", "Company Admin"])),
    active_cid: uuid.UUID = Depends(get_user_company_id),
    db: Session = Depends(get_db),
):
    """Remove company logo."""
    branding = get_or_create_company_branding(db, active_cid)
    company = db.query(Company).filter(Company.id == active_cid).first()

    branding.company_logo = None
    if company:
        company.company_logo = None
    db.commit()

    log_audit(
        db=db,
        action="DELETE",
        resource_type="CompanyLogo",
        resource_id=str(active_cid),
        user_id=current_user.id,
        company_id=active_cid,
    )

    return success_response(message="تم حذف شعار الشركة بنجاح")
