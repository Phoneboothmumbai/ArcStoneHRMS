"""Phase 1A: Employee lifecycle — India-first rich profile, documents, onboarding, offboarding."""
from __future__ import annotations

from typing import List, Optional, Literal
from pydantic import BaseModel, Field, EmailStr

from models import BaseDoc, now_iso, uid


# ---------- Enumerations ----------
Gender = Literal["male", "female", "other", "prefer_not_to_say"]
MaritalStatus = Literal["single", "married", "divorced", "widowed", "separated"]
BloodGroup = Literal["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown"]
EmploymentTypeP = Literal["permanent", "contract", "intern", "consultant", "probation", "part_time"]


# ---------- Profile sub-models ----------
class EmergencyContact(BaseModel):
    name: str
    relation: str
    phone: str
    email: Optional[EmailStr] = None
    is_primary: bool = False


class FamilyMember(BaseModel):
    name: str
    relation: str
    dob: Optional[str] = None
    is_dependent: bool = False
    is_nominee: bool = False
    nominee_share_pct: Optional[float] = None


class EducationRecord(BaseModel):
    degree: str
    specialization: Optional[str] = None
    institution: str
    board_or_university: Optional[str] = None
    year_of_completion: Optional[int] = None
    grade_or_percentage: Optional[str] = None


class PriorEmployment(BaseModel):
    company: str
    designation: str
    from_date: str
    to_date: Optional[str] = None
    reason_for_leaving: Optional[str] = None
    last_drawn_ctc: Optional[float] = None
    currency: str = "INR"


class EmployeePersonal(BaseModel):
    dob: Optional[str] = None
    gender: Optional[Gender] = None
    blood_group: Optional[BloodGroup] = None
    marital_status: Optional[MaritalStatus] = None
    nationality: str = "Indian"
    languages: List[str] = Field(default_factory=list)
    religion: Optional[str] = None
    category: Optional[str] = None  # General, OBC, SC, ST (India)
    physically_challenged: bool = False
    disability_details: Optional[str] = None


class Address(BaseModel):
    line1: Optional[str] = None
    line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: str = "India"
    pincode: Optional[str] = None


class EmployeeContact(BaseModel):
    personal_email: Optional[EmailStr] = None
    alt_phone: Optional[str] = None
    current_address: Optional[Address] = None
    permanent_address: Optional[Address] = None
    same_as_current: bool = False


class EmployeeKYC(BaseModel):
    """KYC IDs. Aadhaar is stored only as last 4 digits for privacy."""
    pan: Optional[str] = None
    aadhaar_last4: Optional[str] = None
    passport_number: Optional[str] = None
    passport_expiry: Optional[str] = None
    driving_license: Optional[str] = None
    voter_id: Optional[str] = None


class EmployeeStatutoryIN(BaseModel):
    """India statutory IDs."""
    uan: Optional[str] = None
    pf_number: Optional[str] = None
    esic_number: Optional[str] = None
    pt_state: Optional[str] = None
    pf_opted_in: bool = True
    esic_opted_in: bool = False
    nps_opted_in: bool = False
    lwf_applicable: bool = False


class EmployeeBank(BaseModel):
    account_holder_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc: Optional[str] = None
    bank_name: Optional[str] = None
    branch: Optional[str] = None
    account_type: Literal["savings", "current", "salary"] = "salary"


class EmploymentDetails(BaseModel):
    designation: Optional[str] = None
    grade: Optional[str] = None
    band: Optional[str] = None
    employment_type: EmploymentTypeP = "permanent"
    date_of_joining: Optional[str] = None
    confirmation_date: Optional[str] = None
    probation_end: Optional[str] = None
    probation_months: int = 6
    work_location: Optional[str] = None
    dotted_line_manager_id: Optional[str] = None
    cost_center: Optional[str] = None
    business_unit: Optional[str] = None
    shift: Optional[str] = None
    notice_period_days: int = 60


class EmployeeProfile(BaseDoc):
    company_id: str
    employee_id: str
    personal: EmployeePersonal = Field(default_factory=EmployeePersonal)
    contact: EmployeeContact = Field(default_factory=EmployeeContact)
    kyc: EmployeeKYC = Field(default_factory=EmployeeKYC)
    statutory_in: EmployeeStatutoryIN = Field(default_factory=EmployeeStatutoryIN)
    bank: EmployeeBank = Field(default_factory=EmployeeBank)
    employment: EmploymentDetails = Field(default_factory=EmploymentDetails)
    emergency_contacts: List[EmergencyContact] = Field(default_factory=list)
    family: List[FamilyMember] = Field(default_factory=list)
    education: List[EducationRecord] = Field(default_factory=list)
    prior_employment: List[PriorEmployment] = Field(default_factory=list)
    profile_completeness: float = 0.0


class EmployeeProfilePatch(BaseModel):
    personal: Optional[EmployeePersonal] = None
    contact: Optional[EmployeeContact] = None
    kyc: Optional[EmployeeKYC] = None
    statutory_in: Optional[EmployeeStatutoryIN] = None
    bank: Optional[EmployeeBank] = None
    employment: Optional[EmploymentDetails] = None
    emergency_contacts: Optional[List[EmergencyContact]] = None
    family: Optional[List[FamilyMember]] = None
    education: Optional[List[EducationRecord]] = None
    prior_employment: Optional[List[PriorEmployment]] = None


# ---------- Documents ----------
DocCategory = Literal[
    "identity", "education", "prior_employment", "offer_letter", "appointment_letter",
    "experience_letter", "relieving_letter", "medical", "insurance", "pf", "tax", "other"
]


class EmployeeDocument(BaseDoc):
    company_id: str
    employee_id: str
    category: DocCategory
    filename: str
    content_type: str
    size_bytes: int
    data_base64: str
    notes: Optional[str] = None
    uploaded_by_user_id: str
    uploaded_by_name: str


class EmployeeDocumentUpload(BaseModel):
    category: DocCategory
    filename: str
    content_type: str
    data_base64: str
    notes: Optional[str] = None


# ---------- Onboarding ----------
OnboardingStage = Literal["pre_joining", "day_1", "week_1", "month_1", "probation", "custom"]
TaskAssignee = Literal["hr", "it", "admin", "manager", "employee", "finance"]


class OnboardingTaskTemplate(BaseModel):
    id: str = Field(default_factory=uid)
    stage: OnboardingStage = "day_1"
    title: str
    description: Optional[str] = None
    assignee: TaskAssignee = "hr"
    due_days_from_doj: int = 0
    required: bool = True


class OnboardingTemplate(BaseDoc):
    company_id: str
    name: str
    description: Optional[str] = None
    is_default: bool = False
    tasks: List[OnboardingTaskTemplate] = Field(default_factory=list)


class OnboardingTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    is_default: bool = False
    tasks: List[OnboardingTaskTemplate] = Field(default_factory=list)


class OnboardingTaskState(BaseModel):
    task_id: str
    stage: OnboardingStage
    title: str
    assignee: TaskAssignee
    status: Literal["pending", "in_progress", "done", "skipped"] = "pending"
    due_date: Optional[str] = None
    completed_by_user_id: Optional[str] = None
    completed_by_name: Optional[str] = None
    completed_at: Optional[str] = None
    notes: Optional[str] = None


class Onboarding(BaseDoc):
    company_id: str
    employee_id: str
    employee_name: str
    template_id: str
    template_name: str
    date_of_joining: str
    status: Literal["active", "completed", "cancelled"] = "active"
    tasks: List[OnboardingTaskState] = Field(default_factory=list)


class OnboardingStart(BaseModel):
    employee_id: str
    template_id: str
    date_of_joining: str


class OnboardingTaskUpdate(BaseModel):
    status: Optional[Literal["pending", "in_progress", "done", "skipped"]] = None
    notes: Optional[str] = None


# ---------- Offboarding ----------
class ExitClearanceItem(BaseModel):
    id: str = Field(default_factory=uid)
    department: Literal["it", "admin", "finance", "hr", "manager", "security"]
    title: str
    status: Literal["pending", "cleared", "pending_dues"] = "pending"
    remarks: Optional[str] = None
    cleared_by_user_id: Optional[str] = None
    cleared_by_name: Optional[str] = None
    cleared_at: Optional[str] = None


class ExitInterview(BaseModel):
    submitted_at: Optional[str] = None
    overall_rating: Optional[int] = None
    reason_for_leaving: Optional[str] = None
    what_worked_well: Optional[str] = None
    what_can_improve: Optional[str] = None
    would_recommend: Optional[bool] = None
    would_rejoin: Optional[bool] = None
    additional_comments: Optional[str] = None


class Offboarding(BaseDoc):
    company_id: str
    employee_id: str
    employee_name: str
    resignation_date: str
    last_working_day: str
    notice_period_days: int = 60
    reason: Literal["resignation", "termination", "retirement", "end_of_contract", "other"] = "resignation"
    reason_details: Optional[str] = None
    status: Literal["initiated", "in_progress", "relieved", "cancelled"] = "initiated"
    clearance: List[ExitClearanceItem] = Field(default_factory=list)
    exit_interview: ExitInterview = Field(default_factory=ExitInterview)
    relieving_letter_issued: bool = False
    experience_letter_issued: bool = False
    fnf_settled: bool = False


class OffboardingStart(BaseModel):
    employee_id: str
    resignation_date: str
    last_working_day: str
    reason: Literal["resignation", "termination", "retirement", "end_of_contract", "other"] = "resignation"
    reason_details: Optional[str] = None
    notice_period_days: int = 60


class ClearanceItemUpdate(BaseModel):
    status: Literal["pending", "cleared", "pending_dues"]
    remarks: Optional[str] = None
