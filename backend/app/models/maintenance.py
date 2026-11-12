"""Maintenance, Replacement, and Configuration Change models."""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    String,
    Text,
    DateTime,
    Numeric,
    ForeignKey,
    Index,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class MaintenanceRecord(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "maintenance_records"

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    target_type: Mapped[str] = mapped_column(String(50), nullable=False)  # asset, infrastructure
    target_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    action_type: Mapped[str] = mapped_column(String(50), nullable=False)  # Maintenance, Replacement, Configuration Change
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    reported_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
    )
    assigned_technician_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    start_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    completion_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Configuration Change fields
    old_configuration_reference: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    new_configuration_reference: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    change_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    risk_assessment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    approval_status: Mapped[str] = mapped_column(String(50), default="Pending", nullable=False)  # Pending, Approved, Rejected, Not Required
    planned_execution_window: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    rollback_plan: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    verification_result: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Replacement fields
    replacement_asset_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("technical_assets.id", ondelete="SET NULL"),
        nullable=True,
    )

    cost: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="Open", nullable=False)  # Open, In Progress, Pending Approval, Completed, Cancelled
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    company: Mapped["Company"] = relationship("Company", foreign_keys=[company_id])
    reported_by: Mapped[Optional["Employee"]] = relationship("Employee", foreign_keys=[reported_by_id])
    assigned_technician: Mapped[Optional["User"]] = relationship("User", foreign_keys=[assigned_technician_id])
    replacement_asset: Mapped[Optional["TechnicalAsset"]] = relationship("TechnicalAsset", foreign_keys=[replacement_asset_id])

    __table_args__ = (
        Index("ix_maintenance_records_company_id", "company_id"),
        Index("ix_maintenance_records_action_type", "action_type"),
        Index("ix_maintenance_records_status", "status"),
        Index("ix_maintenance_records_target_id", "target_id"),
    )
