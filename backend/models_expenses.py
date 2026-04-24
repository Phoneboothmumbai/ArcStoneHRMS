"""Phase 1H — Expense claims + reimbursement + travel requests."""
from __future__ import annotations

from typing import List, Literal, Optional
from pydantic import BaseModel, Field

from models import BaseDoc

ExpenseCategory = Literal[
    "travel_flight", "travel_hotel", "travel_taxi", "travel_mileage", "travel_per_diem",
    "meals", "client_meeting", "office_supplies", "subscription", "training",
    "phone_internet", "fuel", "medical", "other",
]
ExpenseStatus = Literal["draft", "submitted", "approved", "rejected", "reimbursed"]
TravelStatus = Literal["draft", "submitted", "approved", "rejected", "booked", "completed", "cancelled"]


class ExpenseReceipt(BaseModel):
    file_name: str
    content_type: str
    base64_data: str                       # up to 2MB enforced at route
    uploaded_at: str


class ExpenseItem(BaseModel):
    category: ExpenseCategory
    expense_date: str
    amount: float
    currency: str = "INR"
    description: Optional[str] = None
    receipts: List[ExpenseReceipt] = Field(default_factory=list)


class ExpenseClaim(BaseDoc):
    company_id: str
    employee_id: str
    employee_name: str
    title: str                             # "March client visits"
    purpose: Optional[str] = None
    total_amount: float
    currency: str = "INR"
    project_code: Optional[str] = None
    travel_request_id: Optional[str] = None
    items: List[ExpenseItem] = Field(default_factory=list)
    status: ExpenseStatus = "draft"
    submitted_at: Optional[str] = None
    approval_request_id: Optional[str] = None
    reimbursed_in_run_id: Optional[str] = None
    reimbursed_at: Optional[str] = None
    rejection_reason: Optional[str] = None


class ExpenseClaimCreate(BaseModel):
    title: str
    purpose: Optional[str] = None
    project_code: Optional[str] = None
    travel_request_id: Optional[str] = None
    items: List[ExpenseItem] = Field(default_factory=list)
    currency: str = "INR"


class TravelRequest(BaseDoc):
    company_id: str
    employee_id: str
    employee_name: str
    purpose: str
    destinations: List[str] = Field(default_factory=list)  # ["Bengaluru","Chennai"]
    start_date: str
    end_date: str
    mode: Literal["flight", "train", "road", "mixed"] = "flight"
    accommodation: bool = True
    advance_required: float = 0.0
    estimated_cost: float = 0.0
    status: TravelStatus = "draft"
    approval_request_id: Optional[str] = None
    booking_reference: Optional[str] = None
    notes: Optional[str] = None


class TravelRequestCreate(BaseModel):
    purpose: str
    destinations: List[str]
    start_date: str
    end_date: str
    mode: Literal["flight", "train", "road", "mixed"] = "flight"
    accommodation: bool = True
    advance_required: float = 0.0
    estimated_cost: float = 0.0
    notes: Optional[str] = None
