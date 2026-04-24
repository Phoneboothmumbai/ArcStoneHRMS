"""Phase 1I — Helpdesk + POSH complaint flow models."""
from __future__ import annotations

from typing import List, Literal, Optional
from pydantic import BaseModel, Field

from models import BaseDoc


# ---------------------------------------------------------------------------
# Helpdesk — employee tickets with categories, SLA, assignment
# ---------------------------------------------------------------------------
TicketStatus = Literal["open", "in_progress", "on_hold", "resolved", "closed", "reopened"]
TicketPriority = Literal["low", "medium", "high", "urgent"]


class TicketCategory(BaseDoc):
    company_id: str
    name: str                              # "IT — Laptop", "HR — Payroll Query"
    slug: str
    icon: Optional[str] = None
    sla_hours_first_response: int = 8
    sla_hours_resolve: int = 48
    default_assignee_user_id: Optional[str] = None
    default_assignee_role: Optional[str] = None
    is_active: bool = True


class TicketCategoryCreate(BaseModel):
    name: str
    slug: str
    icon: Optional[str] = None
    sla_hours_first_response: int = 8
    sla_hours_resolve: int = 48
    default_assignee_user_id: Optional[str] = None
    default_assignee_role: Optional[str] = None


class TicketComment(BaseModel):
    id: str
    author_user_id: str
    author_name: str
    author_role: str
    created_at: str
    body: str
    is_internal: bool = False              # HR/assignee-only note


class Ticket(BaseDoc):
    company_id: str
    code: str                              # HELP-0001
    category_id: str
    category_name: str
    subject: str
    description: str
    status: TicketStatus = "open"
    priority: TicketPriority = "medium"
    raised_by_user_id: str
    raised_by_name: str
    raised_by_employee_id: Optional[str] = None
    assignee_user_id: Optional[str] = None
    assignee_name: Optional[str] = None
    first_response_at: Optional[str] = None
    first_response_due: Optional[str] = None
    resolve_due: Optional[str] = None
    resolved_at: Optional[str] = None
    closed_at: Optional[str] = None
    escalated: bool = False
    escalated_at: Optional[str] = None
    comments: List[TicketComment] = Field(default_factory=list)
    attachments: List[dict] = Field(default_factory=list)       # {filename, base64, content_type}
    tags: List[str] = Field(default_factory=list)
    satisfaction_rating: Optional[int] = None                   # 1-5 post resolution


class TicketCreate(BaseModel):
    category_id: str
    subject: str
    description: str
    priority: TicketPriority = "medium"
    tags: List[str] = Field(default_factory=list)
    attachments: List[dict] = Field(default_factory=list)


class TicketCommentCreate(BaseModel):
    body: str
    is_internal: bool = False


class TicketAssign(BaseModel):
    assignee_user_id: str


class TicketStatusChange(BaseModel):
    status: TicketStatus
    reason: Optional[str] = None


# ---------------------------------------------------------------------------
# POSH — Prevention of Sexual Harassment (India regulatory requirement)
# Strictly confidential. Only the PoSH Committee members can read.
# ---------------------------------------------------------------------------
POSHStatus = Literal[
    "filed", "under_review", "investigating", "hearing", "decision_pending",
    "resolved_upheld", "resolved_dismissed", "withdrawn",
]


class POSHCommitteeMember(BaseDoc):
    company_id: str
    user_id: str
    name: str
    role_in_committee: Literal["presiding_officer", "internal_member", "external_member", "observer"] = "internal_member"
    is_active: bool = True


class POSHEvent(BaseModel):
    id: str
    at: str
    by_user_id: Optional[str] = None
    by_name: Optional[str] = None
    kind: Literal["note", "status_change", "hearing_scheduled", "document_added", "witness_added"] = "note"
    body: str


class POSHComplaint(BaseDoc):
    company_id: str
    code: str                                     # POSH-0001 (sequential)
    # Complainant — can be anonymous; stored hashed when anon.
    is_anonymous: bool = False
    complainant_user_id: Optional[str] = None
    complainant_name: Optional[str] = None        # may be "Anonymous"
    complainant_contact: Optional[str] = None
    respondent_user_id: Optional[str] = None
    respondent_name: Optional[str] = None
    respondent_designation: Optional[str] = None
    incident_date: Optional[str] = None
    incident_location: Optional[str] = None
    incident_description: str
    witnesses: List[str] = Field(default_factory=list)
    status: POSHStatus = "filed"
    severity: Literal["low", "medium", "high", "critical"] = "medium"
    assigned_committee_ids: List[str] = Field(default_factory=list)
    investigation_log: List[POSHEvent] = Field(default_factory=list)
    attachments: List[dict] = Field(default_factory=list)
    outcome: Optional[Literal["upheld", "partial_upheld", "dismissed", "withdrawn"]] = None
    outcome_notes: Optional[str] = None
    filed_at: Optional[str] = None
    decided_at: Optional[str] = None


class POSHComplaintCreate(BaseModel):
    is_anonymous: bool = False
    complainant_name: Optional[str] = None        # optional if anonymous
    complainant_contact: Optional[str] = None
    respondent_user_id: Optional[str] = None
    respondent_name: Optional[str] = None
    respondent_designation: Optional[str] = None
    incident_date: Optional[str] = None
    incident_location: Optional[str] = None
    incident_description: str
    witnesses: List[str] = Field(default_factory=list)
    severity: Literal["low", "medium", "high", "critical"] = "medium"
    attachments: List[dict] = Field(default_factory=list)


class POSHEventCreate(BaseModel):
    kind: Literal["note", "status_change", "hearing_scheduled", "document_added", "witness_added"] = "note"
    body: str


class POSHOutcome(BaseModel):
    outcome: Literal["upheld", "partial_upheld", "dismissed", "withdrawn"]
    outcome_notes: Optional[str] = None
