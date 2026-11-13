"""Digital Assets, Asset Secrets, and Asset Access Permissions models."""

import uuid
from datetime import datetime
from typing import Optional, List

from sqlalchemy import (
    String,
    Text,
    Boolean,
    Float,
    DateTime,
    ForeignKey,
    Index,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class DigitalAsset(Base):
    __tablename__ = "digital_assets"

    asset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)  # Domain, Hosting, SaaS, Cloud Service, Social Media, Email, API Service, Database, Other
    platform: Mapped[str] = mapped_column(String(100), nullable=False)  # AWS, Cloudflare, Google Cloud, Microsoft 365, GitHub, OpenAI, etc.

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    branch_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("branches.id", ondelete="SET NULL"),
        nullable=True,
    )
    url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    username: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    account_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    recovery_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    recovery_phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    two_factor_method: Mapped[Optional[str]] = mapped_column(String(100), default="Authenticator App (TOTP)", nullable=True)
    two_factor_phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    domain_registrar: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    nameservers: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    subscription_tier: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    payment_method: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    assigned_employee_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
    )
    owner_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    status: Mapped[str] = mapped_column(String(50), default="Active", nullable=False)  # Active, Suspended, Expired, Archived
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    subscription_cost: Mapped[Optional[float]] = mapped_column(Float, default=0.0, nullable=True)
    two_factor_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    vault_reference: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    company = relationship("Company", foreign_keys=[company_id])
    branch = relationship("Branch", foreign_keys=[branch_id])
    assigned_employee = relationship("Employee", foreign_keys=[assigned_employee_id])
    owner = relationship("User", foreign_keys=[owner_id])
    secrets: Mapped[List["AssetSecret"]] = relationship(
        "AssetSecret", back_populates="digital_asset", cascade="all, delete-orphan"
    )
    permissions: Mapped[List["AssetAccessPermission"]] = relationship(
        "AssetAccessPermission", back_populates="digital_asset", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("idx_digital_assets_company", "company_id"),
        Index("idx_digital_assets_status", "status"),
        Index("idx_digital_assets_category", "category"),
    )


class AssetSecret(Base):
    __tablename__ = "asset_secrets"

    secret_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        nullable=False,
    )
    asset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("digital_assets.asset_id", ondelete="CASCADE"),
        nullable=False,
    )
    secret_type: Mapped[str] = mapped_column(String(50), nullable=False)  # Password, API Key, Token, Recovery Code
    vault_reference: Mapped[str] = mapped_column(String(255), nullable=False)
    access_policy: Mapped[str] = mapped_column(String(100), default="Reauth Required", nullable=False)
    last_rotated: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    rotation_due: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_accessed: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="Active", nullable=False)  # Active, Rotated, Revoked, Expired
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=True)

    # Relationships
    digital_asset = relationship("DigitalAsset", back_populates="secrets")

    __table_args__ = (
        Index("idx_asset_secrets_asset", "asset_id"),
        Index("idx_asset_secrets_status", "status"),
    )


class AssetAccessPermission(Base):
    __tablename__ = "asset_access_permissions"

    permission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        nullable=False,
    )
    asset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("digital_assets.asset_id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    access_level: Mapped[str] = mapped_column(String(50), default="Viewer", nullable=False)  # Owner, Admin, Editor, Viewer
    can_reveal_secrets: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    granted_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    granted_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="Active", nullable=False)  # Active, Revoked, Expired

    # Relationships
    digital_asset = relationship("DigitalAsset", back_populates="permissions")
    user = relationship("User", foreign_keys=[user_id])
    grantor = relationship("User", foreign_keys=[granted_by])

    __table_args__ = (
        Index("idx_asset_perm_asset_user", "asset_id", "user_id"),
        Index("idx_asset_perm_company", "company_id"),
    )
