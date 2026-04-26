"""Lifecycle alerts engine — probation completion, salary review anniversary,
birthday wishes, festival greetings, and new-joiner announcements.

Drives the HR-facing 'Alerts' inbox where each card has Yes/No/Later actions.
"""
from __future__ import annotations

from typing import Dict, List, Literal, Optional
from pydantic import BaseModel, Field

from models import BaseDoc, now_iso, uid


LifecycleAlertKind = Literal[
    "probation_completion",
    "salary_review_due",
    "employee_birthday",
    "festival_greeting",
    "new_joiner_announcement",
    "compliance_bulletin",
]
LifecycleAlertStatus = Literal["open", "snoozed", "done", "dismissed"]


class LifecycleAlert(BaseDoc):
    company_id: str
    kind: LifecycleAlertKind
    title: str
    body: Optional[str] = None
    employee_id: Optional[str] = None
    employee_name: Optional[str] = None
    status: LifecycleAlertStatus = "open"
    options: List[str] = Field(default_factory=lambda: ["yes", "no", "later"])
    result: Optional[str] = None              # which option was picked
    snoozed_until: Optional[str] = None       # YYYY-MM-DD
    due_date: Optional[str] = None            # the date the alert references (e.g. probation end)
    payload: Dict = Field(default_factory=dict)  # per-kind extra context
    decided_by: Optional[str] = None
    decided_at: Optional[str] = None


class AlertDecision(BaseModel):
    decision: Literal["yes", "no", "later", "dismiss"]
    remind_on: Optional[str] = None            # required if decision==later (YYYY-MM-DD)
    new_ctc_annual: Optional[float] = None     # required for salary_review yes
    revised_reason: Optional[str] = None       # optional note for compensation history
    note: Optional[str] = None


class LifecycleSettings(BaseDoc):
    """Per-company configuration for what auto-triggers and when."""
    company_id: str
    probation_months: int = 6
    salary_review_months: int = 12
    send_birthday_wishes: bool = True
    birthday_message_template: str = "🎂 Happy birthday {{name}}! The whole team wishes you a wonderful year ahead."
    festivals: List[Dict] = Field(default_factory=list)
    # festival schema: {name, date (YYYY-MM-DD), message, regions: ["IN-MH","ALL"]}
    new_joiner_default_scope: Literal["company", "department", "branch", "team"] = "department"
    last_scan_at: Optional[str] = None


DEFAULT_FESTIVALS_IN = [
    {"name": "Republic Day",      "date_pattern": "01-26", "message": "Happy Republic Day! 🇮🇳"},
    {"name": "Holi",              "date_pattern": "03-14", "message": "Wishing you a colourful Holi! 🎨"},
    {"name": "Independence Day",  "date_pattern": "08-15", "message": "Happy Independence Day! 🇮🇳"},
    {"name": "Gandhi Jayanti",    "date_pattern": "10-02", "message": "Remembering the Mahatma. Happy Gandhi Jayanti."},
    {"name": "Diwali",            "date_pattern": "11-01", "message": "Wishing you a sparkling Diwali! 🪔"},
    {"name": "Christmas",         "date_pattern": "12-25", "message": "Merry Christmas! 🎄"},
    {"name": "New Year",          "date_pattern": "01-01", "message": "Happy New Year! Wishing you a brilliant year ahead. ✨"},
]


class NewJoinerAnnounceBody(BaseModel):
    employee_id: str
    scope: Literal["company", "department", "branch", "team"]
    custom_message: Optional[str] = None
