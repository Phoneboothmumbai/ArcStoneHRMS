"""Phase 1E — Company policies + settings library."""
from __future__ import annotations

from typing import List, Literal, Optional
from pydantic import BaseModel, Field

from models import BaseDoc

PolicyStatus = Literal["draft", "published", "archived"]


class PolicyAcknowledgement(BaseModel):
    employee_id: str
    employee_name: str
    acknowledged_at: str
    ip_address: Optional[str] = None


class CompanyPolicy(BaseDoc):
    company_id: str
    title: str
    slug: str                             # url-safe id
    category: Literal[
        "code_of_conduct", "pii_privacy", "it_security", "travel", "leave",
        "attendance", "expense", "posh", "benefits", "other",
    ] = "other"
    version: str = "1.0"
    body_markdown: str                    # renders in-app
    effective_from: str                   # ISO date
    requires_acknowledgement: bool = False
    acknowledgement_grace_days: int = 14
    status: PolicyStatus = "draft"
    acknowledgements: List[PolicyAcknowledgement] = Field(default_factory=list)
    published_at: Optional[str] = None
    archived_at: Optional[str] = None


class CompanyPolicyCreate(BaseModel):
    title: str
    slug: str
    category: str = "other"
    version: str = "1.0"
    body_markdown: str
    effective_from: str
    requires_acknowledgement: bool = False
    acknowledgement_grace_days: int = 14


class CompanySettings(BaseDoc):
    company_id: str
    # Fiscal year
    fiscal_year_start_month: int = 4       # April default (India)
    # Payroll cycle
    payroll_cutoff_day: int = 25           # attendance cutoff
    pay_day: int = 1                       # salary credit day next month
    # Attendance/Work
    default_working_days_per_week: int = 6
    default_week_off: Literal["sunday", "saturday_sunday", "sunday_alternate_saturday"] = "sunday"
    # Statutory identifiers
    pf_establishment_code: Optional[str] = None
    esic_establishment_code: Optional[str] = None
    pan: Optional[str] = None
    tan: Optional[str] = None
    gstin: Optional[str] = None
    cin: Optional[str] = None
    # Branding
    legal_entity_name: Optional[str] = None
    registered_address: Optional[str] = None
    logo_base64: Optional[str] = None
    # Misc
    currency: str = "INR"
    timezone: str = "Asia/Kolkata"
    notes: Optional[str] = None


class CompanySettingsUpdate(BaseModel):
    fiscal_year_start_month: Optional[int] = None
    payroll_cutoff_day: Optional[int] = None
    pay_day: Optional[int] = None
    default_working_days_per_week: Optional[int] = None
    default_week_off: Optional[str] = None
    pf_establishment_code: Optional[str] = None
    esic_establishment_code: Optional[str] = None
    pan: Optional[str] = None
    tan: Optional[str] = None
    gstin: Optional[str] = None
    cin: Optional[str] = None
    legal_entity_name: Optional[str] = None
    registered_address: Optional[str] = None
    logo_base64: Optional[str] = None
    currency: Optional[str] = None
    timezone: Optional[str] = None
    notes: Optional[str] = None
