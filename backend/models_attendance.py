"""Phase 1C — Attendance deepening: shifts, rosters, regularization, overtime, geo-fencing, timesheet."""
from __future__ import annotations

from typing import List, Literal, Optional
from pydantic import BaseModel, Field

from models import BaseDoc


ShiftCategory = Literal["general", "morning", "afternoon", "night", "split", "flexible"]


class Shift(BaseDoc):
    """Named shift pattern. Times are HH:MM (local, naive)."""
    company_id: str
    name: str                          # e.g. "General 9–6"
    code: str                          # "GEN"
    category: ShiftCategory = "general"
    start_time: str                    # "09:00"
    end_time: str                      # "18:00"
    break_minutes: int = 60
    is_overnight: bool = False
    grace_minutes: int = 15            # late beyond grace = late mark
    half_day_threshold_hours: float = 4.5
    min_hours_for_full_day: float = 8.0
    weekly_offs: List[int] = Field(default_factory=lambda: [6])    # 0=Mon, 6=Sun
    color: str = "#0ea5e9"
    is_default: bool = False
    is_active: bool = True
    sort_order: int = 10


class ShiftCreate(BaseModel):
    name: str
    code: str
    category: ShiftCategory = "general"
    start_time: str
    end_time: str
    break_minutes: int = 60
    is_overnight: bool = False
    grace_minutes: int = 15
    half_day_threshold_hours: float = 4.5
    min_hours_for_full_day: float = 8.0
    weekly_offs: List[int] = Field(default_factory=lambda: [6])
    color: str = "#0ea5e9"
    is_default: bool = False
    sort_order: int = 10


class ShiftAssignment(BaseDoc):
    """Assign a shift to an employee for a date range."""
    company_id: str
    employee_id: str
    employee_name: str
    shift_id: str
    shift_name: str
    shift_code: str
    from_date: str                      # YYYY-MM-DD
    to_date: Optional[str] = None       # open-ended if None
    notes: Optional[str] = None


class ShiftAssignmentCreate(BaseModel):
    employee_id: str
    shift_id: str
    from_date: str
    to_date: Optional[str] = None
    notes: Optional[str] = None


# ----- Geo-fence site definitions -----
class WorkSite(BaseDoc):
    company_id: str
    name: str
    branch_id: Optional[str] = None
    latitude: float
    longitude: float
    radius_meters: int = 100
    ip_whitelist: List[str] = Field(default_factory=list)
    is_active: bool = True


class WorkSiteCreate(BaseModel):
    name: str
    branch_id: Optional[str] = None
    latitude: float
    longitude: float
    radius_meters: int = 100
    ip_whitelist: List[str] = Field(default_factory=list)


# ----- Attendance v2 (extending the existing 'attendance' collection) -----
class CheckInBodyV2(BaseModel):
    location: Optional[str] = None
    type: Literal["wfo", "wfh", "field"] = "wfo"
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    site_id: Optional[str] = None
    device_info: Optional[str] = None
    note: Optional[str] = None


# ----- Regularization -----
RegularizationType = Literal["missed_punch", "wrong_location", "wrong_shift", "forgot_checkout", "other"]


class Regularization(BaseDoc):
    company_id: str
    employee_id: str
    employee_name: str
    date: str
    kind: RegularizationType
    expected_check_in: Optional[str] = None   # HH:MM
    expected_check_out: Optional[str] = None
    reason: str
    status: Literal["pending", "approved", "rejected"] = "pending"
    approval_request_id: Optional[str] = None
    reviewed_by_user_id: Optional[str] = None
    reviewed_by_name: Optional[str] = None
    reviewed_at: Optional[str] = None
    attendance_id: Optional[str] = None       # resolved attendance row


class RegularizationCreate(BaseModel):
    date: str
    kind: RegularizationType
    expected_check_in: Optional[str] = None
    expected_check_out: Optional[str] = None
    reason: str


# ----- Overtime -----
class OvertimeRequest(BaseDoc):
    company_id: str
    employee_id: str
    employee_name: str
    date: str
    hours: float
    rate_multiplier: float = 1.5             # 1.5x / 2x
    reason: str
    status: Literal["pending", "approved", "rejected"] = "pending"
    approval_request_id: Optional[str] = None


class OvertimeCreate(BaseModel):
    date: str
    hours: float
    rate_multiplier: float = 1.5
    reason: str


# ----- Timesheet -----
class TimesheetEntry(BaseModel):
    project: str
    task: Optional[str] = None
    hours: float                               # per day


class TimesheetDay(BaseModel):
    date: str                                  # YYYY-MM-DD
    entries: List[TimesheetEntry] = Field(default_factory=list)


class Timesheet(BaseDoc):
    company_id: str
    employee_id: str
    employee_name: str
    week_start: str                            # Monday ISO
    days: List[TimesheetDay] = Field(default_factory=list)
    total_hours: float = 0.0
    status: Literal["draft", "submitted", "approved", "rejected"] = "draft"
    approval_request_id: Optional[str] = None


class TimesheetUpsert(BaseModel):
    week_start: str
    days: List[TimesheetDay]
