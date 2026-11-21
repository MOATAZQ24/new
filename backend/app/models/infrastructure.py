# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""IT Infrastructure model."""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    String,
    Text,
    DateTime,
    ForeignKey,
    Index,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class ITInfrastructure(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "it_infrastructure"

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
    device_name: Mapped[str] = mapped_column(String(255), nullable=False)
    device_type: Mapped[str] = mapped_column(String(100), nullable=False)  # Router, Switch, Firewall, Access Point, Server, NAS, Network Appliance, Other
    manufacturer: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    serial_number: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    hostname: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    management_ip: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    network_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    vlan: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    responsible_person_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Important: Reference to secrets vault ONLY. Never store plaintext credentials!
    credential_reference: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    firmware_version: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    last_configuration_change: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="Active", nullable=False)  # Active, Offline, Maintenance, Decommissioned
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    company: Mapped["Company"] = relationship("Company", foreign_keys=[company_id])
    branch: Mapped[Optional["Branch"]] = relationship("Branch", foreign_keys=[branch_id])
    responsible_person: Mapped[Optional["Employee"]] = relationship("Employee", foreign_keys=[responsible_person_id])

    __table_args__ = (
        Index("ix_it_infrastructure_company_id", "company_id"),
        Index("ix_it_infrastructure_status", "status"),
        Index("ix_it_infrastructure_device_type", "device_type"),
    )
