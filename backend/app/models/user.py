"""Employee, User, Role, UserRole, CompanyMembership, and UserSession models."""

import uuid
from datetime import datetime, date
from typing import Optional, List

from sqlalchemy import (
    String,
    Boolean,
    Text,
    Date,
    DateTime,
    Integer,
    ForeignKey,
    UniqueConstraint,
    Index,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class Employee(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "employees"

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
    employee_number: Mapped[str] = mapped_column(String(50), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    job_title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    employment_status: Mapped[str] = mapped_column(String(50), default="Active", nullable=False)

    # Relationships
    company: Mapped["Company"] = relationship("Company", foreign_keys=[company_id])
    branch: Mapped[Optional["Branch"]] = relationship("Branch", foreign_keys=[branch_id])
    department: Mapped[Optional["Department"]] = relationship("Department", foreign_keys=[department_id])
    user: Mapped[Optional["User"]] = relationship("User", back_populates="employee", uselist=False)

    __table_args__ = (
        Index("ix_employees_company_id", "company_id"),
        Index("ix_employees_branch_id", "branch_id"),
        Index("ix_employees_department_id", "department_id"),
        Index("ix_employees_employment_status", "employment_status"),
        UniqueConstraint("company_id", "employee_number", name="uq_company_employee_number"),
    )


class User(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "users"

    employee_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
        unique=True,
    )
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    account_status: Mapped[str] = mapped_column(String(50), default="Active", nullable=False)
    is_superadmin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    locked_until: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Relationships
    employee: Mapped[Optional["Employee"]] = relationship("Employee", back_populates="user")
    user_roles: Mapped[List["UserRole"]] = relationship(
        "UserRole", back_populates="user", cascade="all, delete-orphan"
    )
    company_memberships: Mapped[List["CompanyMembership"]] = relationship(
        "CompanyMembership",
        foreign_keys="[CompanyMembership.user_id]",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    sessions: Mapped[List["UserSession"]] = relationship(
        "UserSession", back_populates="user", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_users_account_status", "account_status"),
    )


class Role(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "roles"

    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    name_ar: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_system_role: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    user_roles: Mapped[List["UserRole"]] = relationship("UserRole", back_populates="role")


class UserRole(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "user_roles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("roles.id", ondelete="CASCADE"),
        nullable=False,
    )

    user: Mapped["User"] = relationship("User", back_populates="user_roles")
    role: Mapped["Role"] = relationship("Role", back_populates="user_roles")

    __table_args__ = (
        UniqueConstraint("user_id", "role_id", name="uq_user_role"),
    )


class CompanyMembership(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "company_memberships"

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
    branch_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("branches.id", ondelete="SET NULL"),
        nullable=True,
    )
    role_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("roles.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(String(50), default="Active", nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    assigned_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    assigned_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id], back_populates="company_memberships")
    company: Mapped["Company"] = relationship("Company", foreign_keys=[company_id])
    branch: Mapped[Optional["Branch"]] = relationship("Branch", foreign_keys=[branch_id])
    role: Mapped[Optional["Role"]] = relationship("Role", foreign_keys=[role_id])
    assigner: Mapped[Optional["User"]] = relationship("User", foreign_keys=[assigned_by])

    __table_args__ = (
        UniqueConstraint("user_id", "company_id", name="uq_user_company"),
        Index("ix_company_memberships_user_id", "user_id"),
        Index("ix_company_memberships_company_id", "company_id"),
    )


class UserSession(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "user_sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    session_token: Mapped[str] = mapped_column(
        String(512), unique=True, nullable=False, index=True
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    user: Mapped["User"] = relationship("User", back_populates="sessions")

    __table_args__ = (
        Index("ix_user_sessions_user_id", "user_id"),
        Index("ix_user_sessions_is_active", "is_active"),
        Index("ix_user_sessions_expires_at", "expires_at"),
    )
