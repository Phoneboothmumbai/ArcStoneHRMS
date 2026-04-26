"""Employee-initiated loan requests and Insurance policies module.

Two distinct workflows in one file because both are employee self-service
flows that originate from the employee dashboard:

1. **Loan request**  → employee submits → HR approves/rejects → on approve, an
   `employee_loans` record is created via the existing fnf_routes scheduler.
2. **Insurance**     → HR maintains policy docs (mediclaim, term life, GPA);
   employee browses policies and raises an "Insurance claim" which becomes
   a helpdesk ticket pre-tagged with the policy.
"""
from __future__ import annotations

from datetime import date
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from auth import get_current_user, require_roles
from db import get_db
from models import BaseDoc, now_iso, uid

HR = ("super_admin", "company_admin", "country_head", "region_head")


# =============================================================
# LOAN REQUESTS (employee → HR)
# =============================================================
LoanReqStatus = Literal["pending", "approved", "rejected", "withdrawn"]
LoanType = Literal["personal", "salary_advance", "medical", "housing", "other"]


class LoanRequest(BaseDoc):
    company_id: str
    employee_id: str
    employee_name: str
    employee_code: Optional[str] = None
    loan_type: LoanType = "salary_advance"
    amount: float
    tenure_months: int
    purpose: str
    status: LoanReqStatus = "pending"
    decided_by: Optional[str] = None
    decided_at: Optional[str] = None
    decision_note: Optional[str] = None
    loan_id: Optional[str] = None     # set when approved → links to employee_loans


class LoanRequestCreate(BaseModel):
    loan_type: LoanType = "salary_advance"
    amount: float = Field(gt=0)
    tenure_months: int = Field(ge=1, le=120)
    purpose: str


class LoanRequestDecide(BaseModel):
    decision: Literal["approve", "reject"]
    note: Optional[str] = None
    interest_pct: float = 0.0
    start_month: Optional[str] = None  # YYYY-MM, defaults to next month on approve


loan_req_router = APIRouter(prefix="/api/loan-requests", tags=["loan-requests"])


@loan_req_router.post("")
async def create_loan_request(body: LoanRequestCreate, user=Depends(get_current_user)):
    db = get_db()
    if not user.get("employee_id"):
        raise HTTPException(400, "Only employees can request loans")
    emp = await db.employees.find_one({"id": user["employee_id"]}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employee not found")
    doc = LoanRequest(
        company_id=emp["company_id"], employee_id=emp["id"],
        employee_name=emp["name"], employee_code=emp.get("employee_code"),
        loan_type=body.loan_type, amount=body.amount,
        tenure_months=body.tenure_months, purpose=body.purpose,
    ).model_dump()
    await db.loan_requests.insert_one(doc)
    doc.pop("_id", None)
    # Notify HR
    hr_users = await db.users.find(
        {"company_id": emp["company_id"], "role": {"$in": list(HR)}, "is_active": True},
        {"_id": 0, "id": 1},
    ).to_list(50)
    for u in hr_users:
        await db.notifications.insert_one({
            "id": uid(), "company_id": emp["company_id"],
            "recipient_user_id": u["id"], "title": "New loan request",
            "body": f"{emp['name']} requested ₹{body.amount:,.0f} ({body.loan_type}, {body.tenure_months}mo).",
            "event": "loan.request.created", "link": "/app/loan-requests",
            "read": False, "read_at": None,
            "created_at": now_iso(), "updated_at": now_iso(),
        })
    return doc


@loan_req_router.get("")
async def list_loan_requests(
    user=Depends(get_current_user),
    status: Optional[str] = Query(None),
    employee_id: Optional[str] = Query(None),
):
    db = get_db()
    cid = user.get("company_id")
    flt: dict = {"company_id": cid}
    if status:
        flt["status"] = status
    if user["role"] == "employee" and user.get("employee_id"):
        flt["employee_id"] = user["employee_id"]
    elif employee_id:
        flt["employee_id"] = employee_id
    rows = await db.loan_requests.find(flt, {"_id": 0}).sort("created_at", -1).to_list(500)
    return rows


@loan_req_router.post("/{rid}/decide")
async def decide_loan_request(rid: str, body: LoanRequestDecide, user=Depends(require_roles(*HR))):
    db = get_db()
    cid = user.get("company_id")
    req = await db.loan_requests.find_one({"id": rid, "company_id": cid}, {"_id": 0})
    if not req:
        raise HTTPException(404, "Request not found")
    if req["status"] != "pending":
        raise HTTPException(400, f"Request already {req['status']}")
    patch = {"updated_at": now_iso(), "decided_by": user["id"], "decided_at": now_iso(),
             "decision_note": body.note}
    if body.decision == "reject":
        patch["status"] = "rejected"
    else:
        # Create a real loan via the existing scheduler
        from routers.fnf_routes import _build_schedule
        from models_fnf import EmployeeLoan
        start_month = body.start_month or _next_month()
        emi = round(req["amount"] * (1 + body.interest_pct / 100.0) / req["tenure_months"], 2)
        schedule = _build_schedule(req["amount"], emi, req["tenure_months"], start_month, body.interest_pct)
        loan = EmployeeLoan(
            company_id=cid, employee_id=req["employee_id"], employee_name=req["employee_name"],
            loan_type=req["loan_type"], principal=req["amount"], emi_monthly=emi,
            tenure_months=req["tenure_months"], interest_pct=body.interest_pct,
            start_month=start_month, schedule=schedule,
            outstanding=sum(s["amount"] for s in schedule),
            disbursed_on=date.today().isoformat(),
            notes=req["purpose"],
        ).model_dump()
        await db.employee_loans.insert_one(loan)
        patch["status"] = "approved"
        patch["loan_id"] = loan["id"]
    await db.loan_requests.update_one({"id": rid}, {"$set": patch})
    # Notify employee
    emp = await db.employees.find_one({"id": req["employee_id"]}, {"_id": 0}) or {}
    if emp.get("user_id"):
        msg = (f"Your loan request of ₹{req['amount']:,.0f} has been "
               f"{patch['status']}.{(' EMIs start ' + (body.start_month or _next_month())) if patch['status']=='approved' else ''}")
        await db.notifications.insert_one({
            "id": uid(), "company_id": cid,
            "recipient_user_id": emp["user_id"], "title": "Loan request " + patch["status"],
            "body": msg, "event": "loan.request.decided", "link": "/app/my-loans",
            "read": False, "read_at": None,
            "created_at": now_iso(), "updated_at": now_iso(),
        })
    return await db.loan_requests.find_one({"id": rid}, {"_id": 0})


def _next_month() -> str:
    today = date.today()
    y = today.year + (1 if today.month == 12 else 0)
    m = 1 if today.month == 12 else today.month + 1
    return f"{y:04d}-{m:02d}"


# =============================================================
# INSURANCE POLICIES
# =============================================================
PolicyKind = Literal["mediclaim", "term_life", "personal_accident", "covid", "vision_dental", "other"]


class InsurancePolicy(BaseDoc):
    company_id: str
    name: str                          # e.g. "Group Mediclaim 2026 — ICICI Lombard"
    kind: PolicyKind = "mediclaim"
    insurer_name: str
    tpa_name: Optional[str] = None
    policy_number: Optional[str] = None
    policy_year_start: str             # YYYY-MM-DD
    policy_year_end: str
    coverage_summary: str = ""         # markdown
    sum_insured_per_employee: float = 0.0
    family_floater: bool = True
    covers_spouse: bool = True
    covers_kids: bool = True
    covers_parents: bool = False
    helpdesk_email: Optional[str] = None
    helpdesk_phone: Optional[str] = None
    claim_steps_markdown: str = ""     # markdown
    documents: List[dict] = Field(default_factory=list)  # [{name, url_or_b64}]
    is_active: bool = True


class InsurancePolicyCreate(BaseModel):
    name: str
    kind: PolicyKind = "mediclaim"
    insurer_name: str
    tpa_name: Optional[str] = None
    policy_number: Optional[str] = None
    policy_year_start: str
    policy_year_end: str
    coverage_summary: str = ""
    sum_insured_per_employee: float = 0.0
    family_floater: bool = True
    covers_spouse: bool = True
    covers_kids: bool = True
    covers_parents: bool = False
    helpdesk_email: Optional[str] = None
    helpdesk_phone: Optional[str] = None
    claim_steps_markdown: str = ""
    documents: List[dict] = Field(default_factory=list)


class InsuranceClaimRequest(BaseModel):
    policy_id: str
    claim_type: Literal["cashless", "reimbursement", "pre_authorisation", "query"] = "reimbursement"
    incident_date: Optional[str] = None
    estimated_amount: Optional[float] = None
    description: str
    documents: List[dict] = Field(default_factory=list)


insurance_router = APIRouter(prefix="/api/insurance", tags=["insurance"])


@insurance_router.post("/policies")
async def create_policy(body: InsurancePolicyCreate, user=Depends(require_roles(*HR))):
    db = get_db()
    cid = user.get("company_id")
    doc = InsurancePolicy(company_id=cid, **body.model_dump()).model_dump()
    await db.insurance_policies.insert_one(doc)
    doc.pop("_id", None)
    return doc


@insurance_router.get("/policies")
async def list_policies(user=Depends(get_current_user), kind: Optional[str] = Query(None)):
    db = get_db()
    cid = user.get("company_id")
    flt: dict = {"company_id": cid, "is_active": True}
    if kind:
        flt["kind"] = kind
    rows = await db.insurance_policies.find(flt, {"_id": 0}).sort("policy_year_end", -1).to_list(200)
    return rows


@insurance_router.get("/policies/{pid}")
async def get_policy(pid: str, user=Depends(get_current_user)):
    db = get_db()
    cid = user.get("company_id")
    p = await db.insurance_policies.find_one({"id": pid, "company_id": cid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Policy not found")
    return p


@insurance_router.put("/policies/{pid}")
async def update_policy(pid: str, body: dict, user=Depends(require_roles(*HR))):
    db = get_db()
    cid = user.get("company_id")
    body["updated_at"] = now_iso()
    body.pop("_id", None)
    body.pop("id", None)
    body.pop("company_id", None)
    r = await db.insurance_policies.update_one({"id": pid, "company_id": cid}, {"$set": body})
    if r.matched_count == 0:
        raise HTTPException(404, "Policy not found")
    return await db.insurance_policies.find_one({"id": pid}, {"_id": 0})


@insurance_router.delete("/policies/{pid}")
async def deactivate_policy(pid: str, user=Depends(require_roles(*HR))):
    db = get_db()
    await db.insurance_policies.update_one(
        {"id": pid, "company_id": user.get("company_id")},
        {"$set": {"is_active": False, "updated_at": now_iso()}},
    )
    return {"ok": True}


@insurance_router.post("/claim")
async def raise_claim(body: InsuranceClaimRequest, user=Depends(get_current_user)):
    """Create an insurance claim — reuses helpdesk tickets so HR can track via the same SLA pipeline."""
    db = get_db()
    if not user.get("employee_id"):
        raise HTTPException(400, "Only employees can raise insurance claims")
    cid = user.get("company_id")
    policy = await db.insurance_policies.find_one(
        {"id": body.policy_id, "company_id": cid, "is_active": True}, {"_id": 0},
    )
    if not policy:
        raise HTTPException(404, "Policy not found or inactive")
    emp = await db.employees.find_one({"id": user["employee_id"]}, {"_id": 0}) or {}

    # Find or create the "Insurance Claims" helpdesk category
    cat = await db.ticket_categories.find_one(
        {"company_id": cid, "slug": "insurance-claims"}, {"_id": 0},
    )
    if not cat:
        cat = {
            "id": uid(), "company_id": cid, "name": "Insurance Claims", "slug": "insurance-claims",
            "description": "Auto-created queue for employee insurance claims.",
            "first_response_sla_hours": 24, "resolve_sla_hours": 120,
            "default_assignee_user_id": None, "is_active": True,
            "created_at": now_iso(), "updated_at": now_iso(),
        }
        await db.ticket_categories.insert_one(cat)

    seq = await db.tickets.count_documents({"company_id": cid}) + 1
    ticket = {
        "id": uid(), "company_id": cid, "code": f"HELP-{seq:04d}",
        "category_id": cat["id"], "category_name": cat["name"],
        "subject": f"Insurance claim — {policy['name']}",
        "description": (f"**Type:** {body.claim_type}\n\n"
                        f"**Incident:** {body.incident_date or 'N/A'}\n\n"
                        f"**Estimated:** ₹{body.estimated_amount or 0:,.0f}\n\n"
                        f"{body.description}"),
        "status": "open", "priority": "medium",
        "raised_by_user_id": user["id"], "raised_by_name": user.get("name") or emp.get("name"),
        "raised_by_employee_id": emp.get("id"),
        "assignee_user_id": None, "assignee_name": None,
        "first_response_at": None, "first_response_due": None,
        "resolve_due": None, "resolved_at": None, "closed_at": None,
        "escalated": False, "escalated_at": None,
        "comments": [], "attachments": body.documents,
        "tags": ["insurance", policy["kind"]],
        "satisfaction_rating": None,
        "metadata": {"policy_id": policy["id"], "policy_name": policy["name"],
                     "insurer": policy.get("insurer_name"),
                     "claim_type": body.claim_type,
                     "incident_date": body.incident_date,
                     "estimated_amount": body.estimated_amount},
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.tickets.insert_one(ticket)
    ticket.pop("_id", None)
    return {"ok": True, "ticket_id": ticket["id"], "ticket_code": ticket["code"], "ticket": ticket}
