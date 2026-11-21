# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class InfrastructureBase(BaseModel):
    device_name: str
    device_type: str  # Router, Switch, Firewall, Access Point, Server, NAS, Network Appliance, Other
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    hostname: Optional[str] = None
    management_ip: Optional[str] = None
    network_name: Optional[str] = None
    vlan: Optional[str] = None
    location: Optional[str] = None
    credential_reference: Optional[str] = None  # Reference to vault only! Never plaintext!
    firmware_version: Optional[str] = None
    status: str = "Active"  # Active, Offline, Maintenance, Decommissioned
    notes: Optional[str] = None


class InfrastructureCreate(InfrastructureBase):
    company_id: uuid.UUID
    branch_id: Optional[uuid.UUID] = None
    responsible_person_id: Optional[uuid.UUID] = None


class InfrastructureUpdate(BaseModel):
    device_name: Optional[str] = None
    device_type: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    branch_id: Optional[uuid.UUID] = None
    hostname: Optional[str] = None
    management_ip: Optional[str] = None
    network_name: Optional[str] = None
    vlan: Optional[str] = None
    location: Optional[str] = None
    responsible_person_id: Optional[uuid.UUID] = None
    credential_reference: Optional[str] = None
    firmware_version: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class InfrastructureResponse(InfrastructureBase):
    id: uuid.UUID
    company_id: uuid.UUID
    branch_id: Optional[uuid.UUID] = None
    responsible_person_id: Optional[uuid.UUID] = None
    responsible_person_name: Optional[str] = None
    branch_name: Optional[str] = None
    last_configuration_change: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
