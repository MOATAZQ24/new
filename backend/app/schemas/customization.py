import re
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, field_validator


HEX_COLOR_REGEX = r"^#(?:[0-9a-fA-F]{3}){1,2}$"


class UserWorkspacePreferenceUpdate(BaseModel):
    theme: Optional[str] = None  # light, dark, system
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    background_color: Optional[str] = None
    surface_color: Optional[str] = None
    accent_color: Optional[str] = None

    arabic_font: Optional[str] = None
    english_font: Optional[str] = None
    font_size: Optional[str] = None  # small, medium, large
    font_weight: Optional[str] = None  # normal, medium, bold

    density: Optional[str] = None  # compact, comfortable, spacious
    border_radius: Optional[str] = None  # none, sm, rounded, lg
    sidebar_width: Optional[int] = None
    sidebar_collapsed: Optional[bool] = None

    pinned_nav: Optional[List[str]] = None
    hidden_nav: Optional[List[str]] = None
    nav_order: Optional[List[str]] = None

    dashboard_layout: Optional[List[Dict[str, Any]]] = None
    table_preferences: Optional[Dict[str, Any]] = None

    @field_validator("primary_color", "secondary_color", "background_color", "surface_color", "accent_color")
    @classmethod
    def validate_hex_color(cls, v):
        if v is not None and not re.match(HEX_COLOR_REGEX, v):
            raise ValueError("يجب أن يكون اللون بتنسيق Hex صالح (مثال: #123D32)")
        return v

    @field_validator("theme")
    @classmethod
    def validate_theme(cls, v):
        if v is not None and v not in ["light", "dark", "system"]:
            raise ValueError("المظهر يجب أن يكون light أو dark أو system")
        return v

    @field_validator("density")
    @classmethod
    def validate_density(cls, v):
        if v is not None and v not in ["compact", "comfortable", "spacious"]:
            raise ValueError("الكثافة يجب أن تكون compact أو comfortable أو spacious")
        return v


class CompanyBrandingUpdate(BaseModel):
    company_logo: Optional[str] = None  # Data URI or image URL
    favicon_url: Optional[str] = None
    brand_name_ar: Optional[str] = None
    brand_name_en: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    accent_color: Optional[str] = None
    enforce_company_theme: Optional[bool] = None

    @field_validator("primary_color", "secondary_color", "accent_color")
    @classmethod
    def validate_hex_color(cls, v):
        if v is not None and not re.match(HEX_COLOR_REGEX, v):
            raise ValueError("يجب أن يكون اللون بتنسيق Hex صالح (مثال: #123D32)")
        return v

    @field_validator("company_logo", "favicon_url")
    @classmethod
    def validate_image_data(cls, v):
        if v is not None and v != "":
            # Validate max size: 2MB in base64 is ~2.8MB characters
            if len(v) > 3_000_000:
                raise ValueError("حجم صورة الشعار يجب ألا يتجاوز 2 ميجابايت")
            # If data URL, validate supported MIME types
            if v.startswith("data:"):
                valid_types = ("data:image/png", "data:image/jpeg", "data:image/jpg", "data:image/svg+xml", "data:image/webp")
                if not any(v.startswith(t) for t in valid_types):
                    raise ValueError("صيغة الصورة غير مدعومة. الصيغ المسموحة: PNG, JPG, JPEG, SVG, WebP")
        return v
