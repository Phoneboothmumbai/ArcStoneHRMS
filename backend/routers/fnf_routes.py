"""Phase 2D — F&F settlement + loans + reimbursement pipeline."""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi import Depends as _Depends

from auth import get_current_user, require_roles
from db import get_db
from models import now_iso, uid
from models_fnf import (
    EmployeeLoan, EmployeeLoanCreate, LoanSchedule,
    FnFCompute, FnFSettlement, FnFComponent,
)
from tenant import requires_module

_gate = [_Depends(requires_module("payroll"))]

loans_router = APIRouter(prefix="/api/loans", tags=["loans"], dependencies=_gate)
fnf_router = APIRouter(prefix="/api/fnf", tags=["fnf"], dependencies=_gate)

ADMIN = ("super_admin", "company_admin")


# ---------------------------------------------------------------------------
# Loans (company-funded advances / personal loans)
# ---------------------------------------------------------------------------
def _build_schedule(principal: float, emi: float, tenure: int, start_month: str, interest_pct: float) -> list[dict]:
    total = principal * (1 + interest_pct / 100.0)
    emi_final = round(total / tenure, 2) if tenure else emi
    y, m = (int(x) for x in start_month.split("-"))
    lines = []
    for i in range(tenure):
        lines.append(LoanSchedule(
            installment_no=i + 1,
            due_month=f"{y:04d}-{m:02d}",
            amount=emi_final,
        ).model_dump())
        m += 1
        if m == 13:
            m = 1
            y += 1
    return lines


@loans_router.post("")
async def create_loan(body: EmployeeLoanCreate, user=Depends(require_roles(*ADMIN))):
    db = get_db()
    cid = user.get("company_id")
    emp = await db.employees.find_one({"id": body.employee_id, "company_id": cid}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employee not found")
    schedule = _build_schedule(body.principal, body.emi_monthly, body.tenure_months, body.start_month, body.interest_pct)
    outstanding = sum(s["amount"] for s in schedule)
    doc = EmployeeLoan(
        company_id=cid, employee_id=body.employee_id, employee_name=emp["name"],
        loan_type=body.loan_type, principal=body.principal, emi_monthly=body.emi_monthly,
        tenure_months=body.tenure_months, interest_pct=body.interest_pct,
        start_month=body.start_month, schedule=schedule, outstanding=outstanding,
        disbursed_on=date.today().isoformat(), notes=body.notes,
    ).model_dump()
    await db.employee_loans.insert_one(doc)
    doc.pop("_id", None)
    return doc


@loans_router.get("")
async def list_loans(
    employee_id: Optional[str] = None,
    status: Optional[str] = None,
    user=Depends(get_current_user),
):
    db = get_db()
    cid = user.get("company_id")
    flt: dict = {"company_id": cid}
    if status:
        flt["status"] = status
    if user["role"] not in ("super_admin", "company_admin", "country_head", "region_head"):
        # employees see own loans only
        if not user.get("employee_id"):
            raise HTTPException(403, "Forbidden")
        flt["employee_id"] = user["employee_id"]
    elif employee_id:
        flt["employee_id"] = employee_id
    rows = await db.employee_loans.find(flt, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return rows


@loans_router.post("/{lid}/close")
async def close_loan(lid: str, user=Depends(require_roles(*ADMIN))):
    db = get_db()
    await db.employee_loans.update_one(
        {"id": lid, "company_id": user.get("company_id")},
        {"$set": {"status": "closed", "outstanding": 0, "updated_at": now_iso()}},
    )
    return {"ok": True}


@loans_router.post("/{lid}/waive")
async def waive_loan(lid: str, user=Depends(require_roles("super_admin", "company_admin"))):
    db = get_db()
    await db.employee_loans.update_one(
        {"id": lid, "company_id": user.get("company_id")},
        {"$set": {"status": "waived", "outstanding": 0, "updated_at": now_iso()}},
    )
    return {"ok": True}


# ---------------------------------------------------------------------------
# F&F Settlement engine
# ---------------------------------------------------------------------------
async def _employee_salary(db, cid: str, emp_id: str) -> Optional[dict]:
    return await db.employee_salaries.find_one(
        {"company_id": cid, "employee_id": emp_id, "is_current": True}, {"_id": 0},
    )


async def _leave_balance_for_encashment(db, cid: str, emp_id: str) -> float:
    """Sum of encashable leaves available (typically EL / PL). Policies marked `encashable=true`."""
    balances = await db.leave_balances.find(
        {"company_id": cid, "employee_id": emp_id}, {"_id": 0},
    ).to_list(50)
    total = 0.0
    for b in balances:
        lt = await db.leave_types.find_one({"id": b.get("leave_type_id")}, {"_id": 0})
        if lt and lt.get("encashable"):
            avail = (b.get("allotted", 0) + b.get("carried_forward", 0) + b.get("adjustments", 0)
                     - b.get("used", 0) - b.get("pending", 0))
            total += max(avail, 0)
    return round(total, 2)


@fnf_router.post("/compute")
async def compute_fnf(body: FnFCompute, user=Depends(require_roles(*ADMIN))):
    db = get_db()
    cid = user.get("company_id")
    emp = await db.employees.find_one({"id": body.employee_id, "company_id": cid}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employee not found")
    prof = await db.employee_profiles.find_one({"employee_id": body.employee_id}, {"_id": 0}) or {}
    sal = await _employee_salary(db, cid, body.employee_id)
    if not sal:
        raise HTTPException(400, "Employee has no current salary — assign CTC first")

    lwd = date.fromisoformat(body.last_working_day)
    doj_str = (emp.get("date_of_joining")
               or (prof.get("employment_details") or {}).get("date_of_joining")
               or emp.get("created_at"))
    if not doj_str:
        raise HTTPException(400, "Employee date_of_joining missing")
    doj = date.fromisoformat(doj_str[:10])
    tenure_years = (lwd - doj).days / 365.25

    # 1. Pending salary days in the final month (unpaid portion)
    last_month = lwd.strftime("%Y-%m")
    run = await db.payroll_runs.find_one({"company_id": cid, "period_month": last_month}, {"_id": 0})
    paid_days_this_month = 0
    if run:
        prev = await db.payslips.find_one({"run_id": run["id"], "employee_id": body.employee_id}, {"_id": 0})
        if prev:
            paid_days_this_month = int(prev.get("paid_days", 0))
    # Working days in the final partial month (day 1 → LWD, Mon-Sat minus holidays)
    wd_final = 0
    holidays = set()
    async for h in db.holidays.find({"company_id": cid, "date": {"$gte": f"{last_month}-01", "$lte": body.last_working_day}}, {"_id": 0, "date": 1}):
        holidays.add(h["date"])
    for d in range(1, lwd.day + 1):
        dt = date(lwd.year, lwd.month, d)
        if dt.weekday() == 6:
            continue
        if dt.isoformat() in holidays:
            continue
        wd_final += 1
    pending_days = max(0, wd_final - paid_days_this_month)
    daily_rate = sal["gross_monthly"] / 30.0
    pending_salary = round(pending_days * daily_rate, 2)

    # 2. Leave encashment (basic × encashable days)
    enc_days = await _leave_balance_for_encashment(db, cid, body.employee_id)
    basic_line = next((l for l in sal.get("lines", []) if l["component_code"] == "BASIC"), None)
    basic_daily = ((basic_line or {}).get("monthly_amount", 0)) / 30.0
    leave_enc = round(enc_days * basic_daily, 2)

    # 3. Gratuity — Payment of Gratuity Act: (last_drawn_basic × 15/26) × years, payable if ≥ 5 years
    gratuity = 0.0
    if tenure_years >= 5:
        gratuity = round(((basic_line or {}).get("monthly_amount", 0) * 15 / 26) * round(tenure_years), 2)
        gratuity = min(gratuity, 2000000.0)   # statutory cap ₹20L

    # 4. Notice recovery
    ed = prof.get("employment_details") or {}
    required_notice = int(ed.get("notice_period_days") or 30)
    served = body.notice_served_days if body.notice_served_days is not None else required_notice
    shortfall = max(0, required_notice - served)
    notice_recovery = round(shortfall * daily_rate, 2)

    # 5. Loan recovery — outstanding across active loans
    loans = await db.employee_loans.find(
        {"company_id": cid, "employee_id": body.employee_id, "status": "active"}, {"_id": 0},
    ).to_list(50)
    loan_recovery = round(sum(l.get("outstanding", 0) for l in loans), 2)

    # Assemble components + totals
    comps = []
    if pending_salary:
        comps.append(FnFComponent(label=f"Pending salary ({pending_days} days)", kind="earning",
                                  amount=pending_salary, description=f"For {last_month}"))
    if leave_enc:
        comps.append(FnFComponent(label=f"Leave encashment ({enc_days} days)", kind="earning", amount=leave_enc))
    if gratuity:
        comps.append(FnFComponent(label=f"Gratuity ({round(tenure_years)} yr tenure)", kind="earning", amount=gratuity))
    if body.bonus_pending:
        comps.append(FnFComponent(label="Pending bonus / incentive", kind="earning", amount=body.bonus_pending))
    if notice_recovery:
        comps.append(FnFComponent(label=f"Notice recovery ({shortfall} days short)", kind="deduction",
                                  amount=notice_recovery))
    if loan_recovery:
        comps.append(FnFComponent(label=f"Loan recovery ({len(loans)} active)", kind="deduction", amount=loan_recovery))
    if body.other_deductions:
        comps.append(FnFComponent(label="Other deductions", kind="deduction", amount=body.other_deductions))

    earn = sum(c.amount for c in comps if c.kind == "earning")
    ded = sum(c.amount for c in comps if c.kind == "deduction")

    existing = await db.fnf_settlements.find_one(
        {"company_id": cid, "employee_id": body.employee_id, "status": {"$in": ["draft", "computed"]}}, {"_id": 0},
    )
    doc_data = dict(
        company_id=cid, employee_id=body.employee_id,
        employee_name=emp["name"], employee_code=emp.get("employee_code", ""),
        last_working_day=body.last_working_day,
        pending_salary_days=pending_days, pending_salary_amount=pending_salary,
        leave_encashment_days=enc_days, leave_encashment_amount=leave_enc,
        gratuity_amount=gratuity, notice_recovery_days=shortfall,
        notice_recovery_amount=notice_recovery, loan_recovery=loan_recovery,
        other_deductions=body.other_deductions, bonus_pending=body.bonus_pending,
        total_earnings=round(earn, 2), total_deductions=round(ded, 2),
        net_payable=round(earn - ded, 2),
        components=[c.model_dump() for c in comps],
        status="computed", notes=body.notes,
    )
    if existing:
        await db.fnf_settlements.update_one({"id": existing["id"]}, {"$set": {**doc_data, "updated_at": now_iso()}})
        return await db.fnf_settlements.find_one({"id": existing["id"]}, {"_id": 0})
    doc = FnFSettlement(**doc_data).model_dump()
    await db.fnf_settlements.insert_one(doc)
    doc.pop("_id", None)
    return doc


@fnf_router.get("")
async def list_fnf(
    status: Optional[str] = None,
    user=Depends(require_roles(*ADMIN)),
):
    db = get_db()
    flt = {"company_id": user.get("company_id")}
    if status:
        flt["status"] = status
    rows = await db.fnf_settlements.find(flt, {"_id": 0}).sort("updated_at", -1).to_list(1000)
    return rows


@fnf_router.get("/{fid}")
async def get_fnf(fid: str, user=Depends(get_current_user)):
    db = get_db()
    doc = await db.fnf_settlements.find_one({"id": fid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    if user["role"] == "super_admin":
        return doc
    if user.get("company_id") != doc["company_id"]:
        raise HTTPException(403, "Forbidden")
    if user["role"] not in ("company_admin", "country_head", "region_head") and user.get("employee_id") != doc["employee_id"]:
        raise HTTPException(403, "Forbidden")
    return doc


@fnf_router.post("/{fid}/approve")
async def approve_fnf(fid: str, user=Depends(require_roles(*ADMIN))):
    db = get_db()
    r = await db.fnf_settlements.update_one(
        {"id": fid, "company_id": user.get("company_id"), "status": "computed"},
        {"$set": {"status": "approved", "approved_by": user["id"], "approved_at": now_iso(), "updated_at": now_iso()}},
    )
    if r.matched_count == 0:
        raise HTTPException(400, "Only computed settlements can be approved")
    return await db.fnf_settlements.find_one({"id": fid}, {"_id": 0})


@fnf_router.post("/{fid}/mark-paid")
async def mark_fnf_paid(fid: str, body: dict, user=Depends(require_roles(*ADMIN))):
    """body: {payment_reference: 'NEFT-REF...'}"""
    db = get_db()
    ref = body.get("payment_reference") or ""
    r = await db.fnf_settlements.update_one(
        {"id": fid, "company_id": user.get("company_id"), "status": "approved"},
        {"$set": {"status": "paid", "paid_at": now_iso(), "payment_reference": ref, "updated_at": now_iso()}},
    )
    if r.matched_count == 0:
        raise HTTPException(400, "Only approved settlements can be marked paid")
    # Close any active loans of this employee
    doc = await db.fnf_settlements.find_one({"id": fid}, {"_id": 0})
    await db.employee_loans.update_many(
        {"company_id": doc["company_id"], "employee_id": doc["employee_id"], "status": "active"},
        {"$set": {"status": "closed", "outstanding": 0, "updated_at": now_iso()}},
    )
    return doc
