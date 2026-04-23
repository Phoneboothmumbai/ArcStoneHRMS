"""Phase 1B — Leave deepening.
Models for: LeaveType (company-configurable), LeaveBalance, Holiday."""
from __future__ import annotations

from typing import List, Literal, Optional
from pydantic import BaseModel, Field

from models import BaseDoc


AccrualCadence = Literal["monthly", "quarterly", "yearly", "on_joining", "none"]
HolidayKind = Literal["mandatory", "optional", "restricted"]


class LeaveType(BaseDoc):
    """A company-configured leave category. Each company seeds a default set."""
    company_id: str
    name: str                                    # e.g. "Casual Leave"
    code: str                                    # short code e.g. "CL"
    color: str = "#64748b"                       # for UI (tailwind slate-500)
    default_days_per_year: float = 0.0           # allotment (float for half-day)
    accrual_cadence: AccrualCadence = "yearly"
    carry_forward: bool = False
    carry_forward_cap: Optional[float] = None    # max days that can be carried to next year
    encashable: bool = False                     # paid out on F&F
    encashment_cap: Optional[float] = None
    is_paid: bool = True                         # paid vs LOP
    requires_document: bool = False              # sick leave > 3 days needs medical cert
    document_after_days: float = 3.0
    applies_to_grades: List[str] = Field(default_factory=list)         # empty = all grades
    applies_to_employment_types: List[str] = Field(default_factory=list)  # empty = all types
    applies_to_gender: Optional[Literal["male", "female", "any"]] = "any"
    min_service_months: int = 0                  # probation employees often can't take EL
    allow_half_day: bool = True
    allow_negative_balance: bool = False
    max_consecutive_days: Optional[int] = None
    notice_days: int = 0                         # minimum advance notice
    is_active: bool = True
    sort_order: int = 10


class LeaveTypeCreate(BaseModel):
    name: str
    code: str
    color: str = "#64748b"
    default_days_per_year: float = 0.0
    accrual_cadence: AccrualCadence = "yearly"
    carry_forward: bool = False
    carry_forward_cap: Optional[float] = None
    encashable: bool = False
    encashment_cap: Optional[float] = None
    is_paid: bool = True
    requires_document: bool = False
    document_after_days: float = 3.0
    applies_to_grades: List[str] = Field(default_factory=list)
    applies_to_employment_types: List[str] = Field(default_factory=list)
    applies_to_gender: Optional[Literal["male", "female", "any"]] = "any"
    min_service_months: int = 0
    allow_half_day: bool = True
    allow_negative_balance: bool = False
    max_consecutive_days: Optional[int] = None
    notice_days: int = 0
    is_active: bool = True
    sort_order: int = 10


class LeaveBalance(BaseDoc):
    """Per-employee, per-type, per-year ledger snapshot."""
    company_id: str
    employee_id: str
    leave_type_id: str
    leave_type_code: str
    year: int
    allotted: float = 0.0
    accrued: float = 0.0       # accrued-to-date for monthly/quarterly types
    used: float = 0.0
    pending: float = 0.0        # days currently in pending approval
    carried_forward: float = 0.0
    encashed: float = 0.0
    adjustments: float = 0.0   # HR manual +/-


class LeaveAdjustment(BaseModel):
    leave_type_id: str
    days: float            # positive = credit, negative = debit
    reason: str
    year: Optional[int] = None


class Holiday(BaseDoc):
    """Company holiday calendar. country/state/branch filter."""
    company_id: str
    date: str              # YYYY-MM-DD
    name: str
    kind: HolidayKind = "mandatory"
    country_id: Optional[str] = None
    state: Optional[str] = None
    branch_ids: List[str] = Field(default_factory=list)   # empty = all branches
    is_active: bool = True
    notes: Optional[str] = None


class HolidayCreate(BaseModel):
    date: str
    name: str
    kind: HolidayKind = "mandatory"
    country_id: Optional[str] = None
    state: Optional[str] = None
    branch_ids: List[str] = Field(default_factory=list)
    notes: Optional[str] = None


class LeaveCreateV2(BaseModel):
    """New leave-apply payload that uses leave_type_id + half-day support."""
    leave_type_id: str
    start_date: str
    end_date: str
    half_day_start: bool = False
    half_day_end: bool = False
    reason: str
