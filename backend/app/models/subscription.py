"""Third-Party Subscriptions model."""

import uuid
from datetime import date
from typing import Optional

from sqlalchemy import (
    String,
    Boolean,
    Text,
    Date,
    Numeric,
    ForeignKey,
    Index,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class ThirdPartySubscription(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "third_party_subscriptions"

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    service_name: Mapped[str] = mapped_column(String(255), nullable=False)
    provider: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    subscription_type: Mapped[str] = mapped_column(String(100), default="SaaS", nullable=False)
    package_type: Mapped[str] = mapped_column(String(100), default="Standard", nullable=False)  # Basic, Standard, Professional, Business, Enterprise, Custom
    assigned_owner_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
    )
    account_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    renewal_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    billing_cycle: Mapped[str] = mapped_column(String(50), default="Annual", nullable=False)  # Monthly, Quarterly, Semi-Annual, Annual, Custom
    price: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0, nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="SAR", nullable=False)
    auto_renewal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    payment_responsible_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(String(50), default="Active", nullable=False)  # Active, Expiring Soon, Expired, Suspended, Cancelled
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    company: Mapped["Company"] = relationship("Company", foreign_keys=[company_id])
    assigned_owner: Mapped[Optional["Employee"]] = relationship("Employee", foreign_keys=[assigned_owner_id])
    payment_responsible: Mapped[Optional["Employee"]] = relationship("Employee", foreign_keys=[payment_responsible_id])

    __table_args__ = (
        Index("ix_subscriptions_company_id", "company_id"),
        Index("ix_subscriptions_status", "status"),
        Index("ix_subscriptions_renewal_date", "renewal_date"),
        Index("ix_subscriptions_expiry_date", "expiry_date"),
    )
