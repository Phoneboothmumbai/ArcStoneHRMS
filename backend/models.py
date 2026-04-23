"""Pydantic models for HRMS SaaS platform."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional, Literal
from pydantic import BaseModel, Field, EmailStr, ConfigDict
import uuid


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def uid() -> str:
    return str(uuid.uuid4())


Role = Literal[
    "super_admin", "reseller", "company_admin", "country_head",
    "region_head", "branch_manager", "sub_manager", "assistant_manager", "employee",
]

EmployeeType = Literal["wfo", "wfh", "field", "hybrid"]
ApprovalStatus = Literal["pending", "approved", "rejected", "cancelled"]
RequestType = Literal["leave", "product_service", "expense"]


class BaseDoc(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=uid)
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


# ---------- Users / Auth ----------
class User(BaseDoc):
    email: EmailStr
    name: str
    role: Role
    company_id: Optional[str] = None
    reseller_id: Optional[str] = None
    employee_id: Optional[str] = None  # link to employees collection for employee-role users
    is_active: bool = True


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class RegisterBody(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Role = "employee"
    company_id: Optional[str] = None
    reseller_id: Optional[str] = None


# ---------- Resellers ----------
class Reseller(BaseDoc):
    name: str
    company_name: str
    contact_email: EmailStr
    phone: Optional[str] = None
    commission_rate: float = 0.15  # 15% default
    status: Literal["active", "suspended"] = "active"
    white_label: dict = Field(default_factory=dict)  # logo_url, brand_color, domain


class ResellerCreate(BaseModel):
    name: str
    company_name: str
    contact_email: EmailStr
    phone: Optional[str] = None
    commission_rate: float = 0.15
    admin_password: str  # password for initial reseller admin login


# ---------- Companies (Tenants) ----------
class Company(BaseDoc):
    name: str
    reseller_id: Optional[str] = None
    plan: Literal["starter", "growth", "enterprise"] = "growth"
    status: Literal["active", "trial", "suspended"] = "trial"
    industry: Optional[str] = None
    logo_url: Optional[str] = None
    employee_count: int = 0


class CompanyCreate(BaseModel):
    name: str
    reseller_id: Optional[str] = None
    plan: Literal["starter", "growth", "enterprise"] = "growth"
    industry: Optional[str] = None
    admin_email: EmailStr
    admin_name: str
    admin_password: str


# ---------- Organization hierarchy ----------
class Region(BaseDoc):
    company_id: str
    name: str  # e.g., APAC, EMEA
    head_user_id: Optional[str] = None


class Country(BaseDoc):
    company_id: str
    region_id: str
    name: str
    iso_code: str
    head_user_id: Optional[str] = None


class Branch(BaseDoc):
    company_id: str
    country_id: str
    name: str
    city: str
    address: Optional[str] = None
    manager_user_id: Optional[str] = None


class Department(BaseDoc):
    company_id: str
    branch_id: Optional[str] = None  # nullable if global dept
    name: str
    head_user_id: Optional[str] = None


class OrgNodeCreate(BaseModel):
    name: str
    parent_id: Optional[str] = None
    iso_code: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None


# ---------- Employees ----------
class Employee(BaseDoc):
    company_id: str
    user_id: Optional[str] = None  # linked user account (if they can log in)
    employee_code: str
    name: str
    email: EmailStr
    phone: Optional[str] = None
    employee_type: EmployeeType = "wfo"
    region_id: Optional[str] = None
    country_id: Optional[str] = None
    branch_id: Optional[str] = None
    department_id: Optional[str] = None
    job_title: str
    manager_id: Optional[str] = None  # employee id of manager
    role_in_company: Role = "employee"
    joined_on: str = Field(default_factory=now_iso)
    status: Literal["active", "onboarding", "terminated"] = "active"


class EmployeeCreate(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    employee_type: EmployeeType = "wfo"
    region_id: Optional[str] = None
    country_id: Optional[str] = None
    branch_id: Optional[str] = None
    department_id: Optional[str] = None
    job_title: str
    manager_id: Optional[str] = None
    role_in_company: Role = "employee"
    create_login: bool = True
    password: Optional[str] = None


# ---------- Approval Engine (generic) ----------
class ApprovalStep(BaseModel):
    step: int
    approver_user_id: str
    approver_name: str
    approver_role: str
    status: ApprovalStatus = "pending"
    decided_at: Optional[str] = None
    comment: Optional[str] = None


class ApprovalRequest(BaseDoc):
    company_id: str
    request_type: RequestType
    requester_user_id: str
    requester_name: str
    title: str
    details: dict = Field(default_factory=dict)
    status: ApprovalStatus = "pending"
    current_step: int = 1
    steps: List[ApprovalStep] = Field(default_factory=list)
    linked_id: Optional[str] = None  # points to leave_request/product_service_request id


class ApprovalDecision(BaseModel):
    decision: Literal["approve", "reject"]
    comment: Optional[str] = None


# ---------- Leave ----------
class LeaveRequest(BaseDoc):
    company_id: str
    employee_id: str
    employee_name: str
    leave_type: Literal["casual", "sick", "earned", "unpaid", "other"]
    start_date: str
    end_date: str
    reason: str
    status: ApprovalStatus = "pending"
    approval_request_id: Optional[str] = None


class LeaveCreate(BaseModel):
    leave_type: Literal["casual", "sick", "earned", "unpaid", "other"]
    start_date: str
    end_date: str
    reason: str


# ---------- Attendance ----------
class AttendanceRecord(BaseDoc):
    company_id: str
    employee_id: str
    date: str  # YYYY-MM-DD
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    hours: float = 0.0
    location: Optional[str] = None  # GPS or branch name
    type: Literal["wfo", "wfh", "field"] = "wfo"
    note: Optional[str] = None


class CheckInBody(BaseModel):
    location: Optional[str] = None
    type: Literal["wfo", "wfh", "field"] = "wfo"
    note: Optional[str] = None


# ---------- Product/Service Requests ----------
class ProductServiceRequest(BaseDoc):
    company_id: str
    employee_id: str
    employee_name: str
    category: Literal["product", "service"]
    title: str
    description: str
    quantity: int = 1
    estimated_cost: float = 0.0
    route_to: Literal["main_branch", "vendor"] = "main_branch"
    vendor_id: Optional[str] = None
    urgency: Literal["low", "medium", "high"] = "medium"
    status: ApprovalStatus = "pending"
    approval_request_id: Optional[str] = None


class PSRCreate(BaseModel):
    category: Literal["product", "service"]
    title: str
    description: str
    quantity: int = 1
    estimated_cost: float = 0.0
    route_to: Literal["main_branch", "vendor"] = "main_branch"
    vendor_id: Optional[str] = None
    urgency: Literal["low", "medium", "high"] = "medium"


# ---------- Vendors ----------
class Vendor(BaseDoc):
    company_id: str
    name: str
    category: str
    contact_email: Optional[EmailStr] = None
    phone: Optional[str] = None
    country_id: Optional[str] = None
    status: Literal["active", "inactive"] = "active"


class VendorCreate(BaseModel):
    name: str
    category: str
    contact_email: Optional[EmailStr] = None
    phone: Optional[str] = None
    country_id: Optional[str] = None
