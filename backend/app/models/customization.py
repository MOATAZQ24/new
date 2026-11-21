# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Customization models: UserWorkspacePreference and CompanyBranding."""

import uuid
from datetime import datetime
from typing import Optional, Dict, Any

from sqlalchemy import (
    String,
    Text,
    Boolean,
    Integer,
    DateTime,
    ForeignKey,
    JSON,
    Index,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class UserWorkspacePreference(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "user_workspace_preferences"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    company_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=True,
    )

    # Theme: "light" | "dark" | "system"
    theme: Mapped[str] = mapped_column(String(20), default="system", nullable=False)

    # Color Tokens (Hex)
    primary_color: Mapped[str] = mapped_column(String(20), default="#123D32", nullable=False)
    secondary_color: Mapped[str] = mapped_column(String(20), default="#187A5A", nullable=False)
    background_color: Mapped[str] = mapped_column(String(20), default="#F5F7F8", nullable=False)
    surface_color: Mapped[str] = mapped_column(String(20), default="#FFFFFF", nullable=False)
    accent_color: Mapped[str] = mapped_column(String(20), default="#C5A46D", nullable=False)

    # Typography
    arabic_font: Mapped[str] = mapped_column(String(50), default="IBM Plex Sans Arabic", nullable=False)
    english_font: Mapped[str] = mapped_column(String(50), default="Inter", nullable=False)
    font_size: Mapped[str] = mapped_column(String(20), default="medium", nullable=False)  # small, medium, large
    font_weight: Mapped[str] = mapped_column(String(20), default="normal", nullable=False)

    # Layout & Density
    density: Mapped[str] = mapped_column(String(20), default="comfortable", nullable=False)  # compact, comfortable, spacious
    border_radius: Mapped[str] = mapped_column(String(20), default="rounded", nullable=False)  # none, sm, rounded, lg
    sidebar_width: Mapped[int] = mapped_column(Integer, default=256, nullable=False)
    sidebar_collapsed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Navigation customization
    pinned_nav: Mapped[Optional[list]] = mapped_column(JSON, default=list, nullable=True)
    hidden_nav: Mapped[Optional[list]] = mapped_column(JSON, default=list, nullable=True)
    nav_order: Mapped[Optional[list]] = mapped_column(JSON, default=list, nullable=True)

    # Dashboard & Workspace Widgets
    dashboard_layout: Mapped[Optional[list]] = mapped_column(JSON, default=list, nullable=True)

    # Table preferences (table_id -> {visible_columns, rows_per_page, density, sort})
    table_preferences: Mapped[Optional[dict]] = mapped_column(JSON, default=dict, nullable=True)

    __table_args__ = (
        Index("idx_user_pref_user_id", "user_id"),
    )


class CompanyBranding(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "company_brandings"

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    company_logo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Base64 data URL or path
    favicon_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    brand_name_ar: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    brand_name_en: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Brand Colors
    primary_color: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    secondary_color: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    accent_color: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    enforce_company_theme: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    __table_args__ = (
        Index("idx_company_branding_cid", "company_id"),
    )
