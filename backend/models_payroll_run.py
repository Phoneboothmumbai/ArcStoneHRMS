"""Phase 2B — Monthly Payroll Run Engine.

Models for PayrollRun (month-level cycle) + Payslip (per-employee for that cycle).

Flow:
1. HR creates a PayrollRun for a given month (period_month = 'YYYY-MM').
2. HR triggers `/run/{id}/compute` — engine iterates all active employees with a current EmployeeSalary,
   fetches LOP days from Phase 1B leave ledger, computes per-employee payslip (gross prorata, PF/ESIC/PT, TDS placeholder),
   stores Payslip doc with full breakdown.
3. HR reviews individual payslips; can mark as finalised (locked).
4. On `/run/{id}/lock`, status → finalised and payslips become immutable.
5. On `/run/{id}/publish`, payslips are made visible to employees.
"""
from __future__ import annotations

from typing import List, Literal, Optional
from pydantic import BaseModel, Field

from models import BaseDoc


RunStatus = Literal["draft", "computing", "computed", "finalised", "published"]
PayslipStatus = Literal["pending", "computed", "finalised", "paid"]


class PayslipLine(BaseModel):
    component_code: str
    component_name: str
    kind: Literal["earning", "deduction", "employer_cost"]
    amount: float                      # actual amount for this month (after LOP prorata)


class Payslip(BaseDoc):
    company_id: str
    run_id: str
    period_month: str                  # 'YYYY-MM'
    employee_id: str
    employee_name: str
    employee_code: str
    branch_id: Optional[str] = None
    department_id: Optional[str] = None
    # Days
    working_days: int                  # calendar working days (Mon-Sat excl holidays)
    paid_days: float                   # working - LOP
    lop_days: float = 0.0
    leave_days: float = 0.0            # approved paid leaves (informational)
    # Money
    ctc_annual: float
    gross_monthly: float               # full monthly gross before LOP
    prorata_factor: float              # paid_days / working_days
    actual_gross: float                # gross × prorata
    actual_net: float                  # actual_gross − deductions
    total_earnings: float
    total_deductions: float
    employer_contribution: float
    tax_regime: Literal["old", "new"] = "new"
    # Breakdown
    lines: List[PayslipLine] = Field(default_factory=list)
    tds_monthly: float = 0.0           # placeholder, Phase 2C integrates investment declarations
    status: PayslipStatus = "computed"
    remarks: Optional[str] = None


class PayrollRun(BaseDoc):
    company_id: str
    period_month: str                  # 'YYYY-MM' — unique per company
    period_label: str                  # 'March 2026' for display
    period_start: str                  # 'YYYY-MM-01'
    period_end: str                    # 'YYYY-MM-28/29/30/31'
    working_days: int                  # Mon-Sat, excluding holidays in period
    status: RunStatus = "draft"
    total_employees: int = 0
    total_gross: float = 0.0
    total_net: float = 0.0
    total_deductions: float = 0.0
    total_employer_cost: float = 0.0
    finalised_at: Optional[str] = None
    finalised_by: Optional[str] = None
    published_at: Optional[str] = None
    published_by: Optional[str] = None
    notes: Optional[str] = None


class PayrollRunCreate(BaseModel):
    period_month: str                  # 'YYYY-MM'
    notes: Optional[str] = None
