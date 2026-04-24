"""Phase 2D — F&F settlement, loans, reimbursements-to-payroll pipeline."""
from __future__ import annotations

from typing import List, Literal, Optional
from pydantic import BaseModel, Field

from models import BaseDoc


LoanStatus = Literal["active", "closed", "waived", "on_hold"]


class LoanSchedule(BaseModel):
    installment_no: int
    due_month: str                      # 'YYYY-MM'
    amount: float
    paid: bool = False
    paid_in_run_id: Optional[str] = None


class EmployeeLoan(BaseDoc):
    company_id: str
    employee_id: str
    employee_name: str
    loan_type: Literal["personal", "salary_advance", "medical", "housing", "other"] = "salary_advance"
    principal: float
    emi_monthly: float
    tenure_months: int
    interest_pct: float = 0.0           # flat; 0 for interest-free advances
    start_month: str                    # 'YYYY-MM' — first EMI month
    status: LoanStatus = "active"
    schedule: List[LoanSchedule] = Field(default_factory=list)
    outstanding: float = 0.0
    disbursed_on: Optional[str] = None
    notes: Optional[str] = None


class EmployeeLoanCreate(BaseModel):
    employee_id: str
    loan_type: Literal["personal", "salary_advance", "medical", "housing", "other"] = "salary_advance"
    principal: float
    emi_monthly: float
    tenure_months: int
    interest_pct: float = 0.0
    start_month: str
    notes: Optional[str] = None


FnFStatus = Literal["draft", "computed", "approved", "paid"]


class FnFComponent(BaseModel):
    label: str
    kind: Literal["earning", "deduction"]
    amount: float
    description: Optional[str] = None


class FnFSettlement(BaseDoc):
    company_id: str
    employee_id: str
    employee_name: str
    employee_code: str
    offboarding_id: Optional[str] = None
    last_working_day: str               # ISO date
    status: FnFStatus = "draft"
    # Computed figures
    pending_salary_days: int = 0        # unpaid working days in final month
    pending_salary_amount: float = 0.0
    leave_encashment_days: float = 0.0
    leave_encashment_amount: float = 0.0
    gratuity_amount: float = 0.0
    notice_recovery_days: int = 0       # shortfall in notice period
    notice_recovery_amount: float = 0.0
    loan_recovery: float = 0.0
    other_deductions: float = 0.0
    bonus_pending: float = 0.0
    total_earnings: float = 0.0
    total_deductions: float = 0.0
    net_payable: float = 0.0            # final cheque amount (can be negative → recover)
    components: List[FnFComponent] = Field(default_factory=list)
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    paid_at: Optional[str] = None
    payment_reference: Optional[str] = None
    notes: Optional[str] = None


class FnFCompute(BaseModel):
    employee_id: str
    last_working_day: str
    notice_served_days: Optional[int] = None     # if None, auto from DOJ+notice_period
    bonus_pending: float = 0.0
    other_deductions: float = 0.0
    notes: Optional[str] = None
