"""Phase 3 — Branch operations: Document Vault + Recurring Expense Scheduler.

A "Branch document" is any compliance/contract artefact that the branch manager
is responsible for keeping current — utility bills, rent agreements, property
tax challans, fire-safety certificates, AMC contracts, business licenses.

Recurring expenses are templates that auto-create monthly Expense claims:
  • AUTO_SUBMIT  → fired straight into the approval workflow on the 1st (electricity, internet)
  • AUTO_DRAFT   → drafted; branch manager reviews + submits manually (tea/coffee/housekeeping)
  • MANUAL_ONE_CLICK → no schedule; manager clicks "Create this month" when needed
"""
from __future__ import annotations
from typing import List, Literal, Optional
from pydantic import BaseModel, Field

from models import BaseDoc, now_iso


BranchDocType = Literal[
    "utility_bill",       # Electricity, Water, Gas
    "rent_agreement",
    "property_tax",
    "maintenance_contract",
    "fire_safety",
    "business_license",
    "shop_establishment",
    "insurance",
    "amc_contract",
    "other",
]

BranchDocStatus = Literal["active", "archived", "expired"]


class BranchDocument(BaseDoc):
    company_id: str
    branch_id: str
    doc_type: BranchDocType
    title: str                                # e.g. "BESCOM Bill — Mar 2026"
    description: Optional[str] = None
    vendor_name: Optional[str] = None         # supplier/landlord/contractor
    amount: Optional[float] = None
    currency: str = "INR"
    period_start: Optional[str] = None        # for utility bills (YYYY-MM-DD)
    period_end: Optional[str] = None
    expiry_date: Optional[str] = None         # for renewable docs (rent agreement, license)
    file_name: Optional[str] = None
    content_type: Optional[str] = None
    base64_data: Optional[str] = None         # capped at 5MB at the route level
    status: BranchDocStatus = "active"
    uploaded_by: str
    uploaded_by_name: str


class BranchDocumentCreate(BaseModel):
    doc_type: BranchDocType
    title: str
    description: Optional[str] = None
    vendor_name: Optional[str] = None
    amount: Optional[float] = None
    currency: str = "INR"
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    expiry_date: Optional[str] = None
    file_name: Optional[str] = None
    content_type: Optional[str] = None
    base64_data: Optional[str] = None


# ---------- Recurring Expense Scheduler ----------
RecurringMode = Literal["AUTO_SUBMIT", "AUTO_DRAFT", "MANUAL_ONE_CLICK"]

# Categories aligned with `models_expenses.ExpenseCategory` plus branch-specific buckets
RecurringCategory = Literal[
    "electricity", "internet", "water", "gas", "phone_internet", "sim_cards",
    "tea_coffee", "housekeeping", "pantry_supplies", "drinking_water",
    "office_supplies", "subscription", "rent", "maintenance",
    "security", "courier", "other",
]


class RecurringExpenseTemplate(BaseDoc):
    company_id: str
    branch_id: str
    name: str                                       # "BESCOM Electricity — Indiranagar"
    category: RecurringCategory
    description: Optional[str] = None
    amount: float                                   # default monthly amount
    currency: str = "INR"
    mode: RecurringMode = "AUTO_DRAFT"
    day_of_month: int = 1                           # 1..28
    vendor_name: Optional[str] = None
    active: bool = True
    last_run_at: Optional[str] = None
    last_run_period: Optional[str] = None           # YYYY-MM the last run was for
    next_run_at: Optional[str] = None
    created_by: str
    created_by_name: str


class RecurringExpenseCreate(BaseModel):
    branch_id: str
    name: str
    category: RecurringCategory
    description: Optional[str] = None
    amount: float
    currency: str = "INR"
    mode: RecurringMode = "AUTO_DRAFT"
    day_of_month: int = Field(default=1, ge=1, le=28)
    vendor_name: Optional[str] = None
    active: bool = True


class RecurringExpenseRun(BaseDoc):
    company_id: str
    branch_id: str
    template_id: str
    template_name: str
    period_month: str                               # "2026-04"
    expense_id: Optional[str] = None
    expense_status: Optional[str] = None            # mirrored from the created expense claim
    mode: RecurringMode
    amount: float
    currency: str = "INR"
    triggered_by: str                               # "cron" | user id (manual)
    note: Optional[str] = None
