"""Phase 2A — Payroll foundation. Salary components, structures, employee CTC, tax regime."""
from __future__ import annotations

from typing import List, Literal, Optional
from pydantic import BaseModel, Field

from models import BaseDoc


ComponentKind = Literal["earning", "deduction", "employer_cost"]
ComponentCategory = Literal[
    "basic", "hra", "special", "conveyance", "medical", "lta", "bonus",
    "reimbursement", "employer_pf", "employer_esic", "gratuity", "other_earning",
    "pf", "esic", "pt", "tds", "lwf", "nps", "loan_emi", "advance", "other_deduction",
]
CalculationType = Literal["fixed", "pct_of_basic", "pct_of_ctc", "formula", "statutory"]
TaxRegime = Literal["old", "new"]


# ---------- Catalog ----------
class SalaryComponent(BaseDoc):
    """Named earning/deduction/cost. Company-configured."""
    company_id: str
    name: str                        # "Basic Salary", "HRA", "Provident Fund"
    code: str                        # "BASIC", "HRA", "PF"
    kind: ComponentKind = "earning"
    category: ComponentCategory = "basic"
    calculation_type: CalculationType = "fixed"
    default_value: float = 0.0       # flat amount or percentage
    is_taxable: bool = True
    is_in_ctc: bool = True
    is_pf_applicable: bool = True    # counts toward PF wages
    is_esic_applicable: bool = True
    is_pt_applicable: bool = True
    display_on_payslip: bool = True
    hra_exempt_sec10: bool = False   # for HRA exemption 10(13A)
    lta_exempt: bool = False
    is_locked: bool = False          # statutory components can't be deleted
    sort_order: int = 10
    is_active: bool = True


class SalaryComponentCreate(BaseModel):
    name: str
    code: str
    kind: ComponentKind = "earning"
    category: ComponentCategory = "basic"
    calculation_type: CalculationType = "fixed"
    default_value: float = 0.0
    is_taxable: bool = True
    is_in_ctc: bool = True
    is_pf_applicable: bool = True
    is_esic_applicable: bool = True
    is_pt_applicable: bool = True
    display_on_payslip: bool = True
    hra_exempt_sec10: bool = False
    lta_exempt: bool = False
    sort_order: int = 10


# ---------- Structure template ----------
class StructureLine(BaseModel):
    component_id: str
    component_code: str
    component_name: str
    calculation_type: CalculationType
    value: float                      # flat amount OR percentage


class SalaryStructure(BaseDoc):
    """A reusable CTC template for a grade or band."""
    company_id: str
    name: str                         # "M1 Standard"
    description: Optional[str] = None
    applies_to_grades: List[str] = Field(default_factory=list)  # empty = any
    target_ctc_annual: float = 0.0
    lines: List[StructureLine] = Field(default_factory=list)
    is_active: bool = True


class SalaryStructureCreate(BaseModel):
    name: str
    description: Optional[str] = None
    applies_to_grades: List[str] = Field(default_factory=list)
    target_ctc_annual: float = 0.0
    lines: List[StructureLine] = Field(default_factory=list)


# ---------- Per-employee CTC assignment ----------
class EmployeeSalaryLine(BaseModel):
    component_id: str
    component_code: str
    component_name: str
    kind: ComponentKind
    category: ComponentCategory
    monthly_amount: float
    annual_amount: float
    is_taxable: bool
    is_pf_applicable: bool
    is_esic_applicable: bool


class EmployeeSalary(BaseDoc):
    """Current compensation. One active record per employee (versioned history)."""
    company_id: str
    employee_id: str
    employee_name: str
    employee_code: str
    structure_id: Optional[str] = None
    structure_name: Optional[str] = None
    effective_from: str               # YYYY-MM-DD
    effective_to: Optional[str] = None
    ctc_annual: float
    gross_monthly: float
    net_monthly_estimate: float
    lines: List[EmployeeSalaryLine] = Field(default_factory=list)
    tax_regime: TaxRegime = "new"
    revised_reason: Optional[str] = None
    is_current: bool = True


class EmployeeSalaryAssign(BaseModel):
    employee_id: str
    structure_id: Optional[str] = None
    ctc_annual: float                 # driver — we compute lines from this
    effective_from: str
    tax_regime: TaxRegime = "new"
    revised_reason: Optional[str] = None
    # Custom overrides for specific lines (optional)
    line_overrides: dict = Field(default_factory=dict)  # {component_code: monthly_amount}
