"""Phase 1J — Performance Management: Review cycles, OKRs/Goals, Reviews, 9-Box, PIPs."""
from __future__ import annotations

from typing import List, Literal, Optional
from pydantic import BaseModel, Field

from models import BaseDoc


# ---------------------------------------------------------------------------
# Review Cycles (annual / half-yearly / quarterly cadence)
# ---------------------------------------------------------------------------
CycleCadence = Literal["annual", "half_yearly", "quarterly", "monthly", "adhoc"]
CycleStatus = Literal["draft", "open", "in_review", "calibration", "closed"]


class ReviewCycle(BaseDoc):
    company_id: str
    name: str                             # e.g. "FY26 Annual Review"
    cadence: CycleCadence = "annual"
    period_start: str                     # ISO date
    period_end: str                       # ISO date
    self_review_due: Optional[str] = None
    manager_review_due: Optional[str] = None
    calibration_due: Optional[str] = None
    status: CycleStatus = "draft"
    include_self: bool = True
    include_manager: bool = True
    include_peer: bool = False
    include_skip_level: bool = False
    competencies: List[str] = Field(default_factory=lambda: [
        "Ownership", "Collaboration", "Impact", "Communication", "Craft",
    ])
    notes: Optional[str] = None


class ReviewCycleCreate(BaseModel):
    name: str
    cadence: CycleCadence = "annual"
    period_start: str
    period_end: str
    self_review_due: Optional[str] = None
    manager_review_due: Optional[str] = None
    calibration_due: Optional[str] = None
    include_self: bool = True
    include_manager: bool = True
    include_peer: bool = False
    include_skip_level: bool = False
    competencies: Optional[List[str]] = None
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Goals / OKRs  (Objective w/ weighted Key Results)
# ---------------------------------------------------------------------------
GoalStatus = Literal["draft", "active", "at_risk", "on_track", "completed", "missed", "archived"]
GoalKind = Literal["okr", "kpi", "individual", "team", "company"]


class KeyResult(BaseModel):
    id: str
    title: str
    metric_type: Literal["percent", "number", "currency", "boolean"] = "percent"
    target: float = 100.0
    current: float = 0.0
    unit: Optional[str] = None
    weight: float = 1.0                   # weighted contribution to overall objective progress
    notes: Optional[str] = None


class Goal(BaseDoc):
    company_id: str
    cycle_id: Optional[str] = None        # null for always-on goals
    owner_employee_id: str
    owner_name: str
    manager_id: Optional[str] = None      # cached for approval lookups
    kind: GoalKind = "okr"
    title: str                            # e.g., "Scale recurring revenue to ₹2 Cr ARR"
    description: Optional[str] = None
    category: Optional[str] = None        # Customer / Product / People / Platform...
    priority: Literal["low", "medium", "high", "critical"] = "medium"
    status: GoalStatus = "active"
    weight: float = 1.0                   # across all employee's goals for normalisation
    progress: float = 0.0                 # auto-computed from KRs (0-100)
    start_date: Optional[str] = None
    due_date: Optional[str] = None
    key_results: List[KeyResult] = Field(default_factory=list)
    aligned_to_goal_id: Optional[str] = None   # parent objective (cascade alignment)
    tags: List[str] = Field(default_factory=list)


class GoalCreate(BaseModel):
    cycle_id: Optional[str] = None
    owner_employee_id: str
    kind: GoalKind = "okr"
    title: str
    description: Optional[str] = None
    category: Optional[str] = None
    priority: Literal["low", "medium", "high", "critical"] = "medium"
    weight: float = 1.0
    start_date: Optional[str] = None
    due_date: Optional[str] = None
    key_results: List[KeyResult] = Field(default_factory=list)
    aligned_to_goal_id: Optional[str] = None
    tags: List[str] = Field(default_factory=list)


class KRProgressUpdate(BaseModel):
    kr_id: str
    current: float
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Reviews (self / manager / peer / skip-level)
# ---------------------------------------------------------------------------
ReviewType = Literal["self", "manager", "peer", "skip_level", "upward"]
ReviewStatus = Literal["pending", "in_progress", "submitted", "calibrated", "shared"]


class CompetencyRating(BaseModel):
    competency: str                       # label e.g. "Ownership"
    rating: int                           # 1–5
    comment: Optional[str] = None


class Review(BaseDoc):
    company_id: str
    cycle_id: str
    cycle_name: str
    subject_employee_id: str              # person being reviewed
    subject_name: str
    reviewer_employee_id: Optional[str] = None   # none for self-nominated peer invites later
    reviewer_name: Optional[str] = None
    reviewer_user_id: Optional[str] = None
    review_type: ReviewType
    status: ReviewStatus = "pending"
    overall_rating: Optional[int] = None  # 1–5
    competencies: List[CompetencyRating] = Field(default_factory=list)
    strengths: Optional[str] = None
    improvements: Optional[str] = None
    comments: Optional[str] = None
    goals_comment: Optional[str] = None
    submitted_at: Optional[str] = None
    shared_at: Optional[str] = None
    promotion_recommendation: Optional[Literal["strong_yes", "yes", "maybe", "no"]] = None


class ReviewCreate(BaseModel):
    cycle_id: str
    subject_employee_id: str
    reviewer_employee_id: Optional[str] = None
    review_type: ReviewType


class ReviewSubmit(BaseModel):
    overall_rating: int
    competencies: List[CompetencyRating] = Field(default_factory=list)
    strengths: Optional[str] = None
    improvements: Optional[str] = None
    comments: Optional[str] = None
    goals_comment: Optional[str] = None
    promotion_recommendation: Optional[Literal["strong_yes", "yes", "maybe", "no"]] = None


# ---------------------------------------------------------------------------
# 9-Box grid (performance × potential)
# ---------------------------------------------------------------------------
PerfPotBand = Literal["low", "medium", "high"]
_BAND_TO_I = {"low": 1, "medium": 2, "high": 3}
_BOX_LABELS = {
    # performance → potential (low, medium, high)
    (1, 1): {"box": 1, "label": "Underperformer"},
    (1, 2): {"box": 2, "label": "Inconsistent Contributor"},
    (1, 3): {"box": 3, "label": "Dilemma / Enigma"},
    (2, 1): {"box": 4, "label": "Solid Contributor"},
    (2, 2): {"box": 5, "label": "Core Player"},
    (2, 3): {"box": 6, "label": "High Potential"},
    (3, 1): {"box": 7, "label": "Trusted Professional"},
    (3, 2): {"box": 8, "label": "High Performer"},
    (3, 3): {"box": 9, "label": "Star — Future Leader"},
}


def nine_box_label(performance: PerfPotBand, potential: PerfPotBand) -> dict:
    p = _BAND_TO_I[performance]
    pt = _BAND_TO_I[potential]
    return _BOX_LABELS[(p, pt)]


class NineBoxPlacement(BaseDoc):
    company_id: str
    cycle_id: str
    employee_id: str
    employee_name: str
    performance: PerfPotBand              # low / medium / high
    potential: PerfPotBand
    box: int                              # 1-9
    box_label: str
    notes: Optional[str] = None
    placed_by: Optional[str] = None       # user_id of calibrator


class NineBoxUpsert(BaseModel):
    cycle_id: str
    employee_id: str
    performance: PerfPotBand
    potential: PerfPotBand
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# PIP — Performance Improvement Plan
# ---------------------------------------------------------------------------
PIPStatus = Literal["draft", "active", "on_track", "at_risk", "passed", "failed", "cancelled"]


class PIPMilestone(BaseModel):
    id: str
    title: str
    due_date: str
    status: Literal["pending", "met", "missed"] = "pending"
    evidence: Optional[str] = None
    completed_on: Optional[str] = None


class PIP(BaseDoc):
    company_id: str
    employee_id: str
    employee_name: str
    manager_id: Optional[str] = None
    start_date: str
    end_date: str
    concerns_markdown: str                # specific performance concerns
    expectations_markdown: Optional[str] = None
    milestones: List[PIPMilestone] = Field(default_factory=list)
    status: PIPStatus = "active"
    outcome: Optional[Literal["passed", "failed", "extended", "terminated"]] = None
    outcome_notes: Optional[str] = None
    hr_owner_user_id: Optional[str] = None


class PIPCreate(BaseModel):
    employee_id: str
    start_date: str
    end_date: str
    concerns_markdown: str
    expectations_markdown: Optional[str] = None
    milestones: List[PIPMilestone] = Field(default_factory=list)


class PIPOutcome(BaseModel):
    outcome: Literal["passed", "failed", "extended", "terminated"]
    outcome_notes: Optional[str] = None
