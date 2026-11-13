"""Preferences are independent of operational business records."""
import uuid
from sqlalchemy import ForeignKey, JSON, LargeBinary, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base, UUIDMixin, TimestampMixin


class WorkspacePreference(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "workspace_preferences"
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"))
    configuration: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    __table_args__ = (UniqueConstraint("user_id", "company_id", name="uq_workspace_user_company"),)


class CompanyWorkspace(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "company_workspaces"
    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), unique=True)
    defaults: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    enforced: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    logo: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    favicon: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
