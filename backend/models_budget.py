"""Phase 2 — Budget Module.

Budget envelopes are scoped along (Branch, Department, Cost-Center, Category).
Branch is required; the rest are optional dimensions — leaving them null means
"all" for that dimension (a wildcard). The most-specific matching envelope is
used during a budget check.

Periods: monthly | quarterly | yearly. Fiscal-year aware (Apr–Mar in India by
default; configurable per company in `company_settings.fiscal_year_start_month`).

Utilization = sum of approved expense_claims + open POs (committed) + draft
RFQs (estimated) attributable to the envelope's scope.

Soft-warn threshold (default 80%) and hard-block threshold (default 100%) are
admin-configurable per envelope.
"""
from __future__ import annotations
from typing import List, Literal, Optional
from pydantic import BaseModel, Field

from models import BaseDoc


BudgetPeriod = Literal["monthly", "quarterly", "yearly"]
BudgetStatus = Literal["active", "frozen", "archived"]


class BudgetEnvelope(BaseDoc):
    company_id: str
    name: str                                       # "Bengaluru HQ — IT Travel — FY26"
    description: Optional[str] = None
    branch_id: str                                  # required
    department_id: Optional[str] = None
    cost_center: Optional[str] = None
    category: Optional[str] = None                  # e.g. "travel", "office_supplies", or a procurement category key
    fiscal_year: str                                # "FY2026" (April-2026 → March-2027)
    period: BudgetPeriod = "yearly"
    period_label: Optional[str] = None              # "FY2026", "Q1 FY2026", "Apr 2026"
    amount: float                                   # envelope size
    currency: str = "INR"
    soft_warn_pct: float = 80.0
    hard_block_pct: float = 100.0
    allow_override: bool = True                     # admin can force-pass even at 100%
    status: BudgetStatus = "active"
    created_by: str
    created_by_name: str


class BudgetEnvelopeCreate(BaseModel):
    name: str
    description: Optional[str] = None
    branch_id: str
    department_id: Optional[str] = None
    cost_center: Optional[str] = None
    category: Optional[str] = None
    fiscal_year: str
    period: BudgetPeriod = "yearly"
    period_label: Optional[str] = None
    amount: float
    currency: str = "INR"
    soft_warn_pct: float = 80.0
    hard_block_pct: float = 100.0
    allow_override: bool = True


class BudgetCheckRequest(BaseModel):
    branch_id: str
    department_id: Optional[str] = None
    cost_center: Optional[str] = None
    category: Optional[str] = None
    amount: float
    currency: str = "INR"


class BudgetCheckResult(BaseModel):
    envelope_id: Optional[str] = None
    envelope_name: Optional[str] = None
    matched: bool                                   # True if an envelope was found
    amount: float                                   # the requested amount
    envelope_total: Optional[float] = None
    utilized_before: Optional[float] = None
    utilized_after: Optional[float] = None
    remaining_before: Optional[float] = None
    remaining_after: Optional[float] = None
    pct_after: Optional[float] = None
    block: bool                                     # True if envelope is exhausted
    warn: bool                                      # True if soft-warn threshold tripped
    overridable: bool                               # True if admin can override
    message: str
