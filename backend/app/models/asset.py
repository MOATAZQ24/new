# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Technical Asset and Asset Custody models."""

import uuid
from datetime import datetime, date
from typing import Optional, List

from sqlalchemy import (
    String,
    Boolean,
    Text,
    Date,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    Index,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class TechnicalAsset(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "technical_assets"

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
    department_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("departments.id", ondelete="SET NULL"),
        nullable=True,
    )
    assigned_employee_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
    )

    asset_code: Mapped[str] = mapped_column(String(100), nullable=False)
    asset_name: Mapped[str] = mapped_column(String(255), nullable=False)
    asset_category: Mapped[str] = mapped_column(String(50), default="IT", nullable=False)  # IT (أصل تقني), General (أصل عام)
    asset_type: Mapped[str] = mapped_column(String(100), nullable=False)  # Laptop, Desktop, Mobile, Tablet, Monitor, Printer, Furniture, Vehicle, Equipment, Other
    brand: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    serial_number: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    purchase_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    warranty_expiry: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    condition: Mapped[str] = mapped_column(String(50), default="Good", nullable=False)  # New, Excellent, Good, Fair, Poor
    status: Mapped[str] = mapped_column(String(50), default="Available", nullable=False)  # Available, Assigned, Under Maintenance, Damaged, Retired, Lost
    qr_code_data: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    company: Mapped["Company"] = relationship("Company", foreign_keys=[company_id])
    branch: Mapped[Optional["Branch"]] = relationship("Branch", foreign_keys=[branch_id])
    department: Mapped[Optional["Department"]] = relationship("Department", foreign_keys=[department_id])
    assigned_employee: Mapped[Optional["Employee"]] = relationship("Employee", foreign_keys=[assigned_employee_id])
    custody_records: Mapped[List["AssetCustody"]] = relationship(
        "AssetCustody", back_populates="asset", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("company_id", "asset_code", name="uq_company_asset_code"),
        Index("ix_technical_assets_company_id", "company_id"),
        Index("ix_technical_assets_status", "status"),
        Index("ix_technical_assets_asset_type", "asset_type"),
        Index("ix_technical_assets_assigned_employee", "assigned_employee_id"),
    )


class AssetCustody(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "asset_custody"

    asset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("technical_assets.id", ondelete="CASCADE"),
        nullable=False,
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
    )
    assigned_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    assignment_date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    expected_return_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    actual_return_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    condition_on_assignment: Mapped[str] = mapped_column(String(100), default="Good", nullable=False)
    condition_on_return: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    acknowledgment: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    attachment: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="Active", nullable=False)  # Active, Returned, Transferred
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    asset: Mapped["TechnicalAsset"] = relationship("TechnicalAsset", back_populates="custody_records")
    company: Mapped["Company"] = relationship("Company", foreign_keys=[company_id])
    employee: Mapped["Employee"] = relationship("Employee", foreign_keys=[employee_id])
    assigner: Mapped[Optional["User"]] = relationship("User", foreign_keys=[assigned_by])

    __table_args__ = (
        Index("ix_asset_custody_company_id", "company_id"),
        Index("ix_asset_custody_asset_id", "asset_id"),
        Index("ix_asset_custody_employee_id", "employee_id"),
        Index("ix_asset_custody_status", "status"),
    )
