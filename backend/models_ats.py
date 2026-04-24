"""Phase 1K — Recruitment / ATS models: requisitions, candidates, interviews, offers."""
from __future__ import annotations

from typing import List, Literal, Optional
from pydantic import BaseModel, EmailStr, Field

from models import BaseDoc

# ---------------------------------------------------------------------------
# Job Requisitions (job postings)
# ---------------------------------------------------------------------------
ReqStatus = Literal["draft", "open", "on_hold", "closed", "cancelled"]
EmploymentType = Literal["full_time", "part_time", "contract", "intern", "consultant"]
WorkMode = Literal["wfo", "wfh", "hybrid", "field"]


class JobRequisition(BaseDoc):
    company_id: str
    title: str                                    # "Senior Backend Engineer"
    code: str                                     # auto like JR-2026-0001
    department: Optional[str] = None
    location: Optional[str] = None                # city / branch
    employment_type: EmploymentType = "full_time"
    work_mode: WorkMode = "wfo"
    openings: int = 1
    openings_filled: int = 0
    status: ReqStatus = "draft"
    priority: Literal["low", "medium", "high", "urgent"] = "medium"
    hiring_manager_id: Optional[str] = None       # employee_id of hiring manager
    hiring_manager_name: Optional[str] = None
    recruiter_id: Optional[str] = None            # employee_id of recruiter
    recruiter_name: Optional[str] = None
    experience_min: Optional[float] = None        # years
    experience_max: Optional[float] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    currency: str = "INR"
    description_markdown: str = ""
    responsibilities: List[str] = Field(default_factory=list)
    requirements: List[str] = Field(default_factory=list)
    skills: List[str] = Field(default_factory=list)
    benefits: List[str] = Field(default_factory=list)
    is_public: bool = True                        # show on public careers page
    target_close_date: Optional[str] = None
    opened_at: Optional[str] = None
    closed_at: Optional[str] = None
    source_channels: List[str] = Field(default_factory=list)


class JobRequisitionCreate(BaseModel):
    title: str
    department: Optional[str] = None
    location: Optional[str] = None
    employment_type: EmploymentType = "full_time"
    work_mode: WorkMode = "wfo"
    openings: int = 1
    priority: Literal["low", "medium", "high", "urgent"] = "medium"
    hiring_manager_id: Optional[str] = None
    recruiter_id: Optional[str] = None
    experience_min: Optional[float] = None
    experience_max: Optional[float] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    currency: str = "INR"
    description_markdown: str = ""
    responsibilities: List[str] = Field(default_factory=list)
    requirements: List[str] = Field(default_factory=list)
    skills: List[str] = Field(default_factory=list)
    benefits: List[str] = Field(default_factory=list)
    is_public: bool = True
    target_close_date: Optional[str] = None


# ---------------------------------------------------------------------------
# Candidates
# ---------------------------------------------------------------------------
CandidateStage = Literal[
    "applied", "screening", "shortlisted", "interview", "offer_pending",
    "offer_sent", "offer_accepted", "offer_declined", "hired", "rejected", "withdrawn",
]


class CandidateNote(BaseModel):
    id: str
    author_user_id: str
    author_name: str
    author_role: str
    created_at: str
    body: str


class Candidate(BaseDoc):
    company_id: str
    requisition_id: str
    requisition_title: str
    name: str
    email: EmailStr
    phone: Optional[str] = None
    location: Optional[str] = None
    current_company: Optional[str] = None
    current_title: Optional[str] = None
    current_ctc: Optional[float] = None
    expected_ctc: Optional[float] = None
    notice_period_days: Optional[int] = None
    experience_years: Optional[float] = None
    source: Literal["careers_page", "referral", "linkedin", "naukri", "indeed", "agency", "other"] = "careers_page"
    source_detail: Optional[str] = None           # referrer name or agency id
    referrer_employee_id: Optional[str] = None
    resume_base64: Optional[str] = None           # may be large, redacted in list views
    resume_filename: Optional[str] = None
    stage: CandidateStage = "applied"
    rating: Optional[int] = None                  # 1-5
    tags: List[str] = Field(default_factory=list)
    rejected_reason: Optional[str] = None
    withdrawn_reason: Optional[str] = None
    notes: List[CandidateNote] = Field(default_factory=list)


class CandidateCreate(BaseModel):
    requisition_id: str
    name: str
    email: EmailStr
    phone: Optional[str] = None
    location: Optional[str] = None
    current_company: Optional[str] = None
    current_title: Optional[str] = None
    current_ctc: Optional[float] = None
    expected_ctc: Optional[float] = None
    notice_period_days: Optional[int] = None
    experience_years: Optional[float] = None
    source: Literal["careers_page", "referral", "linkedin", "naukri", "indeed", "agency", "other"] = "careers_page"
    source_detail: Optional[str] = None
    referrer_employee_id: Optional[str] = None
    resume_base64: Optional[str] = None
    resume_filename: Optional[str] = None


class CandidateStageChange(BaseModel):
    stage: CandidateStage
    reason: Optional[str] = None


# ---------------------------------------------------------------------------
# Interviews
# ---------------------------------------------------------------------------
InterviewStage = Literal["phone_screen", "technical", "manager_round", "hr_round", "culture_fit", "panel", "final", "other"]
InterviewOutcome = Literal["strong_yes", "yes", "maybe", "no", "strong_no"]


class Interview(BaseDoc):
    company_id: str
    candidate_id: str
    candidate_name: str
    requisition_id: str
    requisition_title: str
    round: InterviewStage = "technical"
    scheduled_at: str                             # ISO datetime
    duration_mins: int = 45
    meeting_link: Optional[str] = None
    location: Optional[str] = None                # for onsite
    interviewer_ids: List[str] = Field(default_factory=list)   # employee ids
    interviewer_names: List[str] = Field(default_factory=list)
    status: Literal["scheduled", "completed", "cancelled", "no_show"] = "scheduled"
    overall_outcome: Optional[InterviewOutcome] = None
    scorecards: List[dict] = Field(default_factory=list)       # list of ScorecardEntry
    agenda: Optional[str] = None


class InterviewCreate(BaseModel):
    candidate_id: str
    round: InterviewStage = "technical"
    scheduled_at: str
    duration_mins: int = 45
    meeting_link: Optional[str] = None
    location: Optional[str] = None
    interviewer_ids: List[str] = Field(default_factory=list)
    agenda: Optional[str] = None


class InterviewScorecard(BaseModel):
    interviewer_id: str
    outcome: InterviewOutcome
    technical_rating: Optional[int] = None        # 1-5
    communication_rating: Optional[int] = None
    culture_rating: Optional[int] = None
    strengths: Optional[str] = None
    concerns: Optional[str] = None
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Offers
# ---------------------------------------------------------------------------
OfferStatus = Literal["draft", "sent", "accepted", "declined", "withdrawn", "expired"]


class Offer(BaseDoc):
    company_id: str
    candidate_id: str
    candidate_name: str
    requisition_id: str
    requisition_title: str
    job_title: str
    doj: str                                      # proposed date of joining
    annual_ctc: float
    currency: str = "INR"
    location: Optional[str] = None
    work_mode: WorkMode = "wfo"
    employment_type: EmploymentType = "full_time"
    valid_until: Optional[str] = None
    status: OfferStatus = "draft"
    terms_markdown: Optional[str] = None
    letter_id: Optional[str] = None               # link to generated_letter
    sent_at: Optional[str] = None
    decided_at: Optional[str] = None
    decline_reason: Optional[str] = None


class OfferCreate(BaseModel):
    candidate_id: str
    job_title: str
    doj: str
    annual_ctc: float
    currency: str = "INR"
    location: Optional[str] = None
    work_mode: WorkMode = "wfo"
    employment_type: EmploymentType = "full_time"
    valid_until: Optional[str] = None
    terms_markdown: Optional[str] = None
    letter_template_id: Optional[str] = None      # if present, auto-generate letter


class OfferDecision(BaseModel):
    decision: Literal["accept", "decline"]
    reason: Optional[str] = None
