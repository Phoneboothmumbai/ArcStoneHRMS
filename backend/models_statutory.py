"""Phase 2C — Investment declarations (80C/80D/HRA/LTA…), statutory exports, bank files."""
from __future__ import annotations

from typing import List, Literal, Optional
from pydantic import BaseModel, Field

from models import BaseDoc


# Sections supported by the calculator; extend as needed.
DeclarationSection = Literal[
    "80C",          # EPF, PPF, ELSS, LIC, tuition…  cap ₹1.5L
    "80CCD_1B",     # NPS additional  cap ₹50k
    "80D",          # Health insurance premiums
    "80E",          # Education loan interest (no cap)
    "80G",          # Charitable donations (50/100%)
    "80TTA",        # Savings interest (₹10k)
    "HRA",          # Rent receipts
    "LTA",          # Leave travel
    "home_loan",    # Sec 24(b) home loan interest (₹2L)
    "other",
]

DeclarationStatus = Literal["draft", "submitted", "approved", "rejected"]


class DeclarationItem(BaseModel):
    section: DeclarationSection
    label: str                         # "LIC policy #A1234"
    declared_amount: float             # employee claim
    approved_amount: Optional[float] = None  # set by HR after proof review
    proof_attached: bool = False
    proof_document_id: Optional[str] = None
    rejection_reason: Optional[str] = None


class InvestmentDeclaration(BaseDoc):
    company_id: str
    employee_id: str
    employee_name: str
    financial_year: str                # "2025-2026"
    status: DeclarationStatus = "draft"
    tax_regime: Literal["old", "new"] = "new"
    items: List[DeclarationItem] = Field(default_factory=list)
    rent_monthly: float = 0.0
    metro_city: bool = False           # for HRA 50% vs 40%
    total_declared: float = 0.0
    total_approved: float = 0.0
    submitted_at: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    notes: Optional[str] = None


class InvestmentDeclarationCreate(BaseModel):
    financial_year: str
    tax_regime: Literal["old", "new"] = "new"
    items: List[DeclarationItem] = Field(default_factory=list)
    rent_monthly: float = 0.0
    metro_city: bool = False
    notes: Optional[str] = None
