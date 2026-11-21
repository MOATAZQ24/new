# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

WIDGETS = ["kpis", "critical_tickets", "subscriptions", "maintenance", "recent_tasks", "asset_status", "ticket_priorities", "activity", "quick_actions"]
NAVIGATION = ["/", "/companies", "/employees", "/hrm", "/crm", "/projects", "/approvals", "/users", "/assets", "/digital-assets", "/custody", "/infrastructure", "/subscriptions", "/maintenance", "/tasks", "/tickets", "/notifications", "/reports", "/audit", "/settings"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Appearance(StrictModel):
    theme: Literal["light", "dark", "system"] = "system"
    primary: str = Field(default="#123D32", pattern=r"^#[0-9a-fA-F]{6}$")
    secondary: str = Field(default="#187A5A", pattern=r"^#[0-9a-fA-F]{6}$")
    background: str = Field(default="#F5F7F8", pattern=r"^#[0-9a-fA-F]{6}$")
    accent: str = Field(default="#C5A46D", pattern=r"^#[0-9a-fA-F]{6}$")
    surface: str = Field(default="#FFFFFF", pattern=r"^#[0-9a-fA-F]{6}$")
    arabic_font: Literal["IBM Plex Sans Arabic", "Tahoma", "Arial"] = "IBM Plex Sans Arabic"
    english_font: Literal["Inter", "Arial", "Segoe UI"] = "Inter"
    font_size: int = Field(default=16, ge=14, le=20)
    font_weight: Literal[400, 500, 600, 700] = 400
    density: Literal["compact", "comfortable", "spacious"] = "comfortable"
    radius: int = Field(default=12, ge=0, le=24)
    sidebar_width: int = Field(default=256, ge=200, le=340)


class Widget(StrictModel):
    id: str
    enabled: bool = True


class Navigation(StrictModel):
    href: str
    hidden: bool = False
    pinned: bool = False
    icon: Literal["default", "Dashboard", "Tasks", "HelpDesk", "Settings", "Assets", "Reports"] = "default"


class TablePreference(StrictModel):
    columns: list[str] = Field(default_factory=list, max_length=40)
    hidden: list[str] = Field(default_factory=list, max_length=40)
    per_page: Literal[10, 20, 50, 100] = 20
    density: Literal["compact", "comfortable", "spacious"] = "comfortable"
    filters: dict[str, str] = Field(default_factory=dict, max_length=20)
    sort: str = Field(default="", max_length=80)
    view: str = Field(default="", max_length=80)


class Workspace(StrictModel):
    appearance: Appearance = Field(default_factory=Appearance)
    widgets: list[Widget] = Field(default_factory=lambda: [Widget(id=x) for x in WIDGETS], max_length=len(WIDGETS))
    navigation: list[Navigation] = Field(default_factory=lambda: [Navigation(href=x) for x in NAVIGATION], max_length=len(NAVIGATION))
    collapsed: bool = False
    tables: dict[str, TablePreference] = Field(default_factory=dict, max_length=30)

    @model_validator(mode="after")
    def allowed_items(self):
        for values, allowed in [([w.id for w in self.widgets], WIDGETS), ([n.href for n in self.navigation], NAVIGATION)]:
            if len(values) != len(set(values)) or set(values) - set(allowed):
                raise ValueError("Unknown or duplicate workspace item")
        if any(n.hidden for n in self.navigation if n.href == "/settings"):
            raise ValueError("Settings must remain accessible")
        for table, pref in self.tables.items():
            if table not in NAVIGATION or any(len(c) > 80 for c in pref.columns + pref.hidden):
                raise ValueError("Invalid table preference")
        return self


class CompanyDefaults(StrictModel):
    appearance: Appearance = Field(default_factory=Appearance)
    enforced: list[str] = Field(default_factory=list, max_length=len(Appearance.model_fields))

    @model_validator(mode="after")
    def allowed_fields(self):
        if len(set(self.enforced)) != len(self.enforced) or set(self.enforced) - set(Appearance.model_fields):
            raise ValueError("Invalid enforced appearance fields")
        return self
