"""Company, Branch, and Department models."""

import uuid
from datetime import datetime
from typing import Optional, List

from sqlalchemy import (
    String,
    Boolean,
    DateTime,
    Text,
    ForeignKey,
    Index,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class Company(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "companies"

    company_name_ar: Mapped[str] = mapped_column(String(255), nullable=False)
    company_name_en: Mapped[str] = mapped_column(String(255), nullable=False)
    company_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    company_logo: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    contact_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    contact_phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    company_type: Mapped[str] = mapped_column(String(50), default="Internal", nullable=False)  # Group, Internal, Subsidiary
    parent_company_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(String(50), default="Active", nullable=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    branches: Mapped[List["Branch"]] = relationship(
        "Branch", back_populates="company", cascade="all, delete-orphan"
    )
    departments: Mapped[List["Department"]] = relationship(
        "Department", back_populates="company", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_companies_status", "status"),
        Index("ix_companies_created_at", "created_at"),
    )


class Branch(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "branches"

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    branch_name: Mapped[str] = mapped_column(String(255), nullable=False)
    physical_branch_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("physical_branch_locations.id", ondelete="SET NULL"),
        nullable=True,
    )
    location: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    contact_details: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="Active", nullable=False)

    # Relationships
    company: Mapped["Company"] = relationship("Company", back_populates="branches")
    departments: Mapped[List["Department"]] = relationship(
        "Department", back_populates="branch"
    )

    __table_args__ = (
        Index("ix_branches_company_id", "company_id"),
        Index("ix_branches_physical_branch_id", "physical_branch_id"),
        Index("ix_branches_status", "status"),
    )


class Department(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "departments"

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
    department_name: Mapped[str] = mapped_column(String(255), nullable=False)
    manager_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(String(50), default="Active", nullable=False)

    # Relationships
    company: Mapped["Company"] = relationship("Company", back_populates="departments")
    branch: Mapped[Optional["Branch"]] = relationship("Branch", back_populates="departments")

    __table_args__ = (
        Index("ix_departments_company_id", "company_id"),
        Index("ix_departments_branch_id", "branch_id"),
    )
