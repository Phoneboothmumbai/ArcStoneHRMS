"""Phase 2B — Monthly payroll run engine.

Key endpoints (all gated behind the `payroll` module + admin role):
- POST /api/payroll-runs            create draft run for a given month
- GET  /api/payroll-runs            list runs
- GET  /api/payroll-runs/{id}       detail incl payslip count
- POST /api/payroll-runs/{id}/compute      iterate employees, compute payslips
- POST /api/payroll-runs/{id}/finalise     lock run (immutable)
- POST /api/payroll-runs/{id}/publish      make payslips visible to employees
- POST /api/payroll-runs/{id}/reopen       super_admin-only: unlock
- GET  /api/payslips                list (hr: all of a run; employee: own published)
- GET  /api/payslips/{id}           one payslip with full breakdown
"""
from __future__ import annotations

import calendar
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi import Depends as _Depends

from auth import get_current_user, require_roles
from db import get_db
from models import now_iso, uid
from models_payroll_run import (
    Payslip, PayslipLine, PayrollRun, PayrollRunCreate,
)
from tenant import requires_module

_gate = [_Depends(requires_module("payroll"))]

runs_router = APIRouter(prefix="/api/payroll-runs", tags=["payroll-runs"], dependencies=_gate)
payslips_router = APIRouter(prefix="/api/payslips", tags=["payslips"], dependencies=_gate)

ADMIN = ("super_admin", "company_admin")


# ---------------------------------------------------------------------------
# Helpers — working-day calc + LOP fetch
# ---------------------------------------------------------------------------
async def _working_days(db, company_id: str, ym: str) -> tuple[int, str, str]:
    """Return (working_days, period_start, period_end) for a YYYY-MM.
    Working = Mon-Sat minus declared company holidays in that range."""
    year, month = (int(x) for x in ym.split("-"))
    last = calendar.monthrange(year, month)[1]
    start, end = f"{ym}-01", f"{ym}-{last:02d}"
    holidays = set()
    async for h in db.holidays.find(
        {"company_id": company_id, "date": {"$gte": start, "$lte": end}}, {"_id": 0, "date": 1}
    ):
        holidays.add(h["date"])
    wd = 0
    for d in range(1, last + 1):
        dt = date(year, month, d)
        if dt.weekday() == 6:  # Sunday off
            continue
        if dt.isoformat() in holidays:
            continue
        wd += 1
    return wd, start, end


async def _lop_days_for(db, company_id: str, employee_id: str, start: str, end: str) -> tuple[float, float]:
    """Fetch (LOP_days, paid_leave_days) for the employee from approved leaves overlapping the month."""
    lop = 0.0
    paid = 0.0
    cursor = db.leaves.find({
        "company_id": company_id, "employee_id": employee_id, "status": "approved",
        "start_date": {"$lte": end}, "end_date": {"$gte": start},
    }, {"_id": 0})
    async for lv in cursor:
        # Count overlap days (simple approximation: days × overlap_fraction using lv["days"])
        # For correctness, derive overlap fraction vs full leave length:
        try:
            lvs = max(lv["start_date"], start)
            lve = min(lv["end_date"], end)
            s = date.fromisoformat(lvs); e = date.fromisoformat(lve)
            total_in_range = (e - s).days + 1
            s_full = date.fromisoformat(lv["start_date"]); e_full = date.fromisoformat(lv["end_date"])
            full = max((e_full - s_full).days + 1, 1)
            frac = total_in_range / full
            applicable = round(lv.get("days", 0) * frac, 2)
        except Exception:
            applicable = lv.get("days", 0)
        if (lv.get("leave_type_code") or "").upper() == "LOP" or lv.get("leave_type") == "unpaid":
            lop += applicable
        else:
            paid += applicable
    return lop, paid


# ---------------------------------------------------------------------------
# PayrollRun CRUD
# ---------------------------------------------------------------------------
@runs_router.post("")
async def create_run(body: PayrollRunCreate, user=Depends(require_roles(*ADMIN))):
    db = get_db()
    cid = user.get("company_id")
    if not cid:
        raise HTTPException(400, "Company scope required")
    # Parse period
    try:
        dt = datetime.strptime(body.period_month, "%Y-%m")
    except ValueError:
        raise HTTPException(400, "period_month must be YYYY-MM")
    # Dedup per-company per-month
    existing = await db.payroll_runs.find_one({"company_id": cid, "period_month": body.period_month})
    if existing:
        raise HTTPException(400, f"A payroll run for {body.period_month} already exists")
    wd, pstart, pend = await _working_days(db, cid, body.period_month)
    run = PayrollRun(
        company_id=cid, period_month=body.period_month,
        period_label=dt.strftime("%B %Y"),
        period_start=pstart, period_end=pend,
        working_days=wd, notes=body.notes,
    ).model_dump()
    await db.payroll_runs.insert_one(run)
    run.pop("_id", None)
    return run


@runs_router.get("")
async def list_runs(user=Depends(require_roles(*ADMIN))):
    db = get_db()
    rows = await db.payroll_runs.find(
        {"company_id": user.get("company_id")}, {"_id": 0}
    ).sort("period_month", -1).to_list(200)
    return rows


@runs_router.get("/{rid}")
async def get_run(rid: str, user=Depends(require_roles(*ADMIN))):
    db = get_db()
    run = await db.payroll_runs.find_one(
        {"id": rid, "company_id": user.get("company_id")}, {"_id": 0}
    )
    if not run:
        raise HTTPException(404, "Not found")
    run["payslip_count"] = await db.payslips.count_documents({"run_id": rid})
    return run


@runs_router.post("/{rid}/compute")
async def compute_run(rid: str, user=Depends(require_roles(*ADMIN))):
    """Iterate employees with current CTC, compute payslip per employee (pro-rata by LOP)."""
    db = get_db()
    cid = user.get("company_id")
    run = await db.payroll_runs.find_one({"id": rid, "company_id": cid}, {"_id": 0})
    if not run:
        raise HTTPException(404, "Run not found")
    if run["status"] in ("finalised", "published"):
        raise HTTPException(400, "Run is locked; reopen first")

    await db.payroll_runs.update_one({"id": rid}, {"$set": {"status": "computing", "updated_at": now_iso()}})
    # Wipe prior payslips for this run (idempotent recompute)
    await db.payslips.delete_many({"company_id": cid, "run_id": rid})

    wd = run["working_days"]
    salaries = await db.employee_salaries.find(
        {"company_id": cid, "is_current": True}, {"_id": 0}
    ).to_list(5000)

    totals = {"gross": 0.0, "net": 0.0, "deductions": 0.0, "employer": 0.0}
    count = 0
    for s in salaries:
        emp = await db.employees.find_one({"id": s["employee_id"], "company_id": cid}, {"_id": 0})
        if not emp or emp.get("status") == "terminated":
            continue
        lop, paid_leave = await _lop_days_for(db, cid, s["employee_id"], run["period_start"], run["period_end"])
        paid_days = max(0.0, wd - lop)
        factor = (paid_days / wd) if wd else 1.0

        lines: list[PayslipLine] = []
        total_earn = 0.0
        total_ded = 0.0
        employer = 0.0
        for ln in s.get("lines", []):
            amt = round(ln["monthly_amount"] * factor, 2)
            lines.append(PayslipLine(
                component_code=ln["component_code"], component_name=ln["component_name"],
                kind=ln["kind"], amount=amt,
            ))
            if ln["kind"] == "earning":
                total_earn += amt
            elif ln["kind"] == "deduction":
                total_ded += amt
            else:
                employer += amt

        # TDS placeholder — Phase 2C wires investment declarations & tax engine
        tds = 0.0

        payslip = Payslip(
            company_id=cid, run_id=rid, period_month=run["period_month"],
            employee_id=s["employee_id"], employee_name=s["employee_name"], employee_code=s["employee_code"],
            branch_id=emp.get("branch_id"), department_id=emp.get("department_id"),
            working_days=wd, paid_days=paid_days, lop_days=lop, leave_days=paid_leave,
            ctc_annual=s["ctc_annual"], gross_monthly=s["gross_monthly"],
            prorata_factor=round(factor, 4), actual_gross=round(total_earn, 2),
            actual_net=round(total_earn - total_ded, 2),
            total_earnings=round(total_earn, 2), total_deductions=round(total_ded, 2),
            employer_contribution=round(employer, 2),
            tax_regime=s.get("tax_regime", "new"), lines=lines, tds_monthly=tds,
        ).model_dump()
        await db.payslips.insert_one(payslip)
        totals["gross"] += total_earn
        totals["net"] += total_earn - total_ded
        totals["deductions"] += total_ded
        totals["employer"] += employer
        count += 1

    await db.payroll_runs.update_one(
        {"id": rid},
        {"$set": {
            "status": "computed", "total_employees": count,
            "total_gross": round(totals["gross"], 2),
            "total_net": round(totals["net"], 2),
            "total_deductions": round(totals["deductions"], 2),
            "total_employer_cost": round(totals["employer"], 2),
            "updated_at": now_iso(),
        }}
    )
    return await db.payroll_runs.find_one({"id": rid}, {"_id": 0})


@runs_router.post("/{rid}/finalise")
async def finalise_run(rid: str, user=Depends(require_roles(*ADMIN))):
    db = get_db()
    run = await db.payroll_runs.find_one({"id": rid, "company_id": user.get("company_id")}, {"_id": 0})
    if not run:
        raise HTTPException(404, "Not found")
    if run["status"] not in ("computed", "draft"):
        raise HTTPException(400, "Only computed runs can be finalised")
    if run["status"] == "draft":
        raise HTTPException(400, "Run has no payslips; compute first")
    await db.payroll_runs.update_one(
        {"id": rid},
        {"$set": {"status": "finalised", "finalised_at": now_iso(),
                  "finalised_by": user["id"], "updated_at": now_iso()}},
    )
    await db.payslips.update_many({"run_id": rid}, {"$set": {"status": "finalised"}})
    return await db.payroll_runs.find_one({"id": rid}, {"_id": 0})


@runs_router.post("/{rid}/publish")
async def publish_run(rid: str, user=Depends(require_roles(*ADMIN))):
    """Make payslips visible to employees (and notify)."""
    db = get_db()
    run = await db.payroll_runs.find_one({"id": rid, "company_id": user.get("company_id")}, {"_id": 0})
    if not run:
        raise HTTPException(404, "Not found")
    if run["status"] != "finalised":
        raise HTTPException(400, "Run must be finalised before publishing")
    await db.payroll_runs.update_one(
        {"id": rid},
        {"$set": {"status": "published", "published_at": now_iso(),
                  "published_by": user["id"], "updated_at": now_iso()}},
    )
    # Fire notifications (best-effort, non-fatal)
    try:
        from notify import notify as notify_user
        slips = await db.payslips.find(
            {"run_id": rid}, {"_id": 0, "employee_id": 1, "id": 1, "period_month": 1}
        ).to_list(5000)
        for sl in slips:
            emp = await db.employees.find_one(
                {"id": sl["employee_id"]}, {"_id": 0, "user_id": 1}
            )
            uid_ = emp.get("user_id") if emp else None
            if not uid_:
                continue
            await notify_user(
                company_id=user.get("company_id"), recipient_user_id=uid_,
                event="payslip.published", link=f"/app/payslips/{sl['id']}",
                custom_title=f"Payslip ready — {run['period_label']}",
                custom_body=f"Your payslip for {run['period_label']} is available.",
            )
    except Exception:
        pass
    return await db.payroll_runs.find_one({"id": rid}, {"_id": 0})


@runs_router.post("/{rid}/reopen")
async def reopen_run(rid: str, user=Depends(require_roles("super_admin"))):
    """Super-admin rescue: unlock a finalised/published run back to computed."""
    db = get_db()
    await db.payroll_runs.update_one(
        {"id": rid}, {"$set": {"status": "computed", "updated_at": now_iso()}}
    )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Payslips
# ---------------------------------------------------------------------------
@payslips_router.get("")
async def list_payslips(
    run_id: Optional[str] = Query(None),
    period_month: Optional[str] = Query(None),
    user=Depends(get_current_user),
):
    db = get_db()
    cid = user.get("company_id")
    flt: dict = {"company_id": cid}
    if run_id:
        flt["run_id"] = run_id
    if period_month:
        flt["period_month"] = period_month

    if user["role"] in ("super_admin", "company_admin"):
        pass                           # HR sees all
    elif user.get("employee_id"):
        # Employees see only their OWN published payslips
        flt["employee_id"] = user["employee_id"]
        flt["status"] = {"$in": ["finalised", "paid"]}
        # Additionally restrict to runs that are published
        published = await db.payroll_runs.find(
            {"company_id": cid, "status": "published"}, {"_id": 0, "id": 1}
        ).to_list(200)
        flt["run_id"] = {"$in": [r["id"] for r in published]}
    else:
        raise HTTPException(403, "Forbidden")

    rows = await db.payslips.find(flt, {"_id": 0, "lines": 0}).sort("employee_name", 1).to_list(5000)
    return rows


@payslips_router.get("/{pid}")
async def get_payslip(pid: str, user=Depends(get_current_user)):
    db = get_db()
    slip = await db.payslips.find_one({"id": pid}, {"_id": 0})
    if not slip:
        raise HTTPException(404, "Not found")
    if user["role"] == "super_admin":
        return slip
    if user.get("company_id") != slip["company_id"]:
        raise HTTPException(403, "Forbidden")
    # Employee can only read their own AND only when run is published
    if user["role"] not in ("company_admin", "country_head", "region_head"):
        if user.get("employee_id") != slip["employee_id"]:
            raise HTTPException(403, "Forbidden")
        run = await db.payroll_runs.find_one({"id": slip["run_id"]}, {"_id": 0})
        if not run or run["status"] != "published":
            raise HTTPException(403, "Payslip not yet released")
    return slip
