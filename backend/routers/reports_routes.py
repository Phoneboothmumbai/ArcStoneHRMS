"""Phase 1L — Reports & MIS: headcount, attrition, tenure, custom builder, CSV export."""
from __future__ import annotations

import csv
import io
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi import Depends as _Depends
from fastapi.responses import Response

from auth import get_current_user, require_roles
from db import get_db
from tenant import requires_module

_gate = [_Depends(requires_module("analytics"))]

router = APIRouter(prefix="/api/reports", tags=["reports"], dependencies=_gate)

HR = ("super_admin", "company_admin", "country_head", "region_head")


def _cid(user):
    cid = user.get("company_id")
    if not cid:
        raise HTTPException(403, "No tenant scope")
    return cid


def _csv_response(header: list[str], rows: list[list], filename: str) -> Response:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(header)
    for r in rows:
        w.writerow(r)
    return Response(
        content=buf.getvalue(), media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# Headcount
# ---------------------------------------------------------------------------
@router.get("/headcount")
async def headcount(user=Depends(require_roles(*HR))):
    db = get_db()
    cid = _cid(user)
    total = await db.employees.count_documents({"company_id": cid, "status": {"$ne": "terminated"}})
    by_status: dict = {}
    by_department: dict = {}
    by_employee_type: dict = {}
    by_branch: dict = {}
    by_gender: dict = {}
    by_role: dict = {}

    async for e in db.employees.find({"company_id": cid}, {"_id": 0}):
        st = e.get("status", "active")
        by_status[st] = by_status.get(st, 0) + 1
        if st == "terminated":
            continue
        dept = e.get("department_name") or e.get("department_id") or "—"
        by_department[dept] = by_department.get(dept, 0) + 1
        et = e.get("employee_type", "wfo")
        by_employee_type[et] = by_employee_type.get(et, 0) + 1
        br = e.get("branch_name") or e.get("branch_id") or "—"
        by_branch[br] = by_branch.get(br, 0) + 1
        role = e.get("role_in_company", "employee")
        by_role[role] = by_role.get(role, 0) + 1
    async for p in db.employee_profiles.find({}, {"_id": 0, "personal": 1}):
        g = ((p.get("personal") or {}).get("gender") or "not_specified").lower()
        by_gender[g] = by_gender.get(g, 0) + 1

    return {
        "total_active": total,
        "by_status": by_status,
        "by_department": by_department,
        "by_employee_type": by_employee_type,
        "by_branch": by_branch,
        "by_gender": by_gender,
        "by_role": by_role,
    }


@router.get("/headcount.csv")
async def headcount_csv(user=Depends(require_roles(*HR))):
    db = get_db()
    cid = _cid(user)
    header = ["Employee Code", "Name", "Email", "Department", "Branch", "Job Title",
              "Employee Type", "Role", "Status", "Joined On"]
    rows = []
    async for e in db.employees.find({"company_id": cid}, {"_id": 0}):
        rows.append([
            e.get("employee_code", ""), e.get("name", ""), e.get("email", ""),
            e.get("department_name") or e.get("department_id") or "",
            e.get("branch_name") or e.get("branch_id") or "",
            e.get("job_title", ""), e.get("employee_type", ""),
            e.get("role_in_company", ""), e.get("status", ""),
            (e.get("joined_on") or "")[:10],
        ])
    return _csv_response(header, rows, "headcount.csv")


# ---------------------------------------------------------------------------
# Attrition (rolling 12 months)
# ---------------------------------------------------------------------------
@router.get("/attrition")
async def attrition(months: int = Query(12, ge=1, le=60), user=Depends(require_roles(*HR))):
    db = get_db()
    cid = _cid(user)
    now = datetime.now(timezone.utc)
    # Find offboardings grouped by month
    by_month: dict = {}
    reasons: dict = {}
    cursor = db.offboarding_instances.find(
        {"company_id": cid, "status": "completed"}, {"_id": 0},
    )
    since_cutoff = (now - timedelta(days=months * 31)).isoformat()
    async for ob in cursor:
        dt_str = ob.get("last_working_day") or ob.get("completed_at") or ob.get("created_at")
        if not dt_str or dt_str < since_cutoff:
            continue
        ym = dt_str[:7]
        by_month[ym] = by_month.get(ym, 0) + 1
        reason = ob.get("reason", "unspecified")
        reasons[reason] = reasons.get(reason, 0) + 1

    total_exits = sum(by_month.values())
    active = await db.employees.count_documents({"company_id": cid, "status": {"$ne": "terminated"}})
    # Simple rate: exits / avg headcount over window × (12 / months)
    avg_headcount = max(active, 1)
    annualised_rate = round((total_exits / avg_headcount) * (12 / months) * 100.0, 2)

    return {
        "window_months": months,
        "total_exits": total_exits,
        "active_headcount": active,
        "annualised_rate_pct": annualised_rate,
        "by_month": dict(sorted(by_month.items())),
        "by_reason": reasons,
    }


# ---------------------------------------------------------------------------
# Tenure distribution + diversity
# ---------------------------------------------------------------------------
@router.get("/tenure")
async def tenure(user=Depends(require_roles(*HR))):
    db = get_db()
    cid = _cid(user)
    now = datetime.now(timezone.utc)
    buckets = {"<1 yr": 0, "1-2 yr": 0, "2-5 yr": 0, "5-10 yr": 0, "10+ yr": 0}
    total = 0
    sum_yrs = 0.0
    async for e in db.employees.find(
        {"company_id": cid, "status": {"$ne": "terminated"}}, {"_id": 0, "joined_on": 1},
    ):
        try:
            joined = datetime.fromisoformat((e.get("joined_on") or "")[:19])
            if joined.tzinfo is None:
                joined = joined.replace(tzinfo=timezone.utc)
            yrs = (now - joined).days / 365.25
        except Exception:
            continue
        total += 1
        sum_yrs += yrs
        if yrs < 1:
            buckets["<1 yr"] += 1
        elif yrs < 2:
            buckets["1-2 yr"] += 1
        elif yrs < 5:
            buckets["2-5 yr"] += 1
        elif yrs < 10:
            buckets["5-10 yr"] += 1
        else:
            buckets["10+ yr"] += 1
    return {
        "total_employees": total,
        "avg_tenure_years": round(sum_yrs / total, 2) if total else 0.0,
        "buckets": buckets,
    }


# ---------------------------------------------------------------------------
# Compensation bands (if payroll data available)
# ---------------------------------------------------------------------------
@router.get("/compensation-bands")
async def comp_bands(user=Depends(require_roles(*HR))):
    db = get_db()
    cid = _cid(user)
    bands = [
        ("< 3L", 0, 300000), ("3-6L", 300000, 600000), ("6-12L", 600000, 1200000),
        ("12-24L", 1200000, 2400000), ("24-50L", 2400000, 5000000), ("50L+", 5000000, float("inf")),
    ]
    counts = {b[0]: 0 for b in bands}
    total_cost = 0.0
    total_emp = 0
    by_dept: dict = {}
    async for s in db.employee_salaries.find(
        {"company_id": cid, "is_current": True}, {"_id": 0, "ctc_annual": 1, "employee_id": 1},
    ):
        ctc = s.get("ctc_annual") or 0
        total_cost += ctc
        total_emp += 1
        for label, lo, hi in bands:
            if lo <= ctc < hi:
                counts[label] += 1
                break
        emp = await db.employees.find_one({"id": s.get("employee_id")}, {"_id": 0, "department_name": 1, "department_id": 1})
        if emp:
            d = emp.get("department_name") or emp.get("department_id") or "—"
            by_dept.setdefault(d, {"count": 0, "total_ctc": 0.0})
            by_dept[d]["count"] += 1
            by_dept[d]["total_ctc"] += ctc
    for d in by_dept:
        c = by_dept[d]
        c["avg_ctc"] = round(c["total_ctc"] / c["count"], 2) if c["count"] else 0
    return {
        "total_employees_with_ctc": total_emp,
        "total_annual_cost": round(total_cost, 2),
        "avg_annual_ctc": round(total_cost / total_emp, 2) if total_emp else 0,
        "bands": counts,
        "by_department": by_dept,
    }


# ---------------------------------------------------------------------------
# Leave & attendance report
# ---------------------------------------------------------------------------
@router.get("/leave-summary")
async def leave_summary(year: Optional[int] = None, user=Depends(require_roles(*HR))):
    db = get_db()
    cid = _cid(user)
    year = year or datetime.now(timezone.utc).year
    start = f"{year}-01-01"
    end = f"{year}-12-31"
    by_type: dict = {}
    by_status: dict = {}
    total_days = 0.0
    async for lr in db.leave_requests.find(
        {"company_id": cid, "start_date": {"$gte": start, "$lte": end}}, {"_id": 0},
    ):
        lt = lr.get("leave_type") or lr.get("leave_type_id") or "other"
        by_type[lt] = by_type.get(lt, 0) + 1
        by_status[lr.get("status", "pending")] = by_status.get(lr.get("status", "pending"), 0) + 1
        try:
            s = datetime.fromisoformat(lr["start_date"][:10])
            e = datetime.fromisoformat(lr["end_date"][:10])
            total_days += max(1, (e - s).days + 1)
        except Exception:
            pass
    return {
        "year": year,
        "total_requests": sum(by_status.values()),
        "total_approved_days": round(total_days, 1),
        "by_type": by_type,
        "by_status": by_status,
    }


# ---------------------------------------------------------------------------
# Custom report builder — pick entity + dimensions + optional filters
# ---------------------------------------------------------------------------
_ENTITIES = {
    "employees": ["name", "email", "employee_code", "job_title", "department_name",
                  "branch_name", "employee_type", "role_in_company", "status", "joined_on"],
    "candidates": ["name", "email", "stage", "source", "requisition_title",
                   "current_company", "expected_ctc", "notice_period_days", "created_at"],
    "leave_requests": ["employee_name", "leave_type", "start_date", "end_date",
                       "reason", "status", "created_at"],
    "payslips": ["employee_name", "period_month", "actual_gross", "actual_net",
                 "total_deductions", "paid_days", "lop_days"],
    "tickets": ["code", "category_name", "subject", "status", "priority",
                "raised_by_name", "assignee_name", "created_at", "resolved_at"],
    "offers": ["candidate_name", "job_title", "annual_ctc", "doj", "status", "sent_at"],
}


@router.get("/builder/entities")
async def list_entities(user=Depends(require_roles(*HR))):
    return [{"entity": k, "dimensions": v} for k, v in _ENTITIES.items()]


@router.post("/builder/run")
async def run_builder(body: dict, user=Depends(require_roles(*HR))):
    """body: {entity, dimensions: [], filters: {k: v}, limit?: int, format: 'json'|'csv'}"""
    entity = body.get("entity")
    if entity not in _ENTITIES:
        raise HTTPException(400, "Unknown entity")
    dims = body.get("dimensions") or _ENTITIES[entity]
    invalid = [d for d in dims if d not in _ENTITIES[entity]]
    if invalid:
        raise HTTPException(400, f"Invalid dimensions: {invalid}")
    filters = body.get("filters") or {}
    limit = min(int(body.get("limit") or 1000), 10000)
    fmt = body.get("format") or "json"

    db = get_db()
    cid = _cid(user)
    coll = db[entity]
    flt = {"company_id": cid, **{k: v for k, v in filters.items() if v is not None and v != ""}}
    projection = {"_id": 0}
    for d in dims:
        projection[d] = 1
    rows = await coll.find(flt, projection).limit(limit).to_list(limit)

    if fmt == "csv":
        values = [[r.get(d, "") for d in dims] for r in rows]
        return _csv_response(dims, values, f"{entity}.csv")
    return {"entity": entity, "dimensions": dims, "rows": rows, "count": len(rows)}


# ---------------------------------------------------------------------------
# Dashboard — high-level KPI bundle for HR home
# ---------------------------------------------------------------------------
@router.get("/dashboard-kpis")
async def dashboard_kpis(user=Depends(require_roles(*HR))):
    db = get_db()
    cid = _cid(user)
    total_emp = await db.employees.count_documents({"company_id": cid, "status": {"$ne": "terminated"}})
    active_reqs = await db.job_requisitions.count_documents({"company_id": cid, "status": "open"})
    pending_offers = await db.offers.count_documents({"company_id": cid, "status": "sent"})
    pending_leaves = await db.leave_requests.count_documents({"company_id": cid, "status": "pending"})
    open_tickets = await db.tickets.count_documents({"company_id": cid, "status": {"$in": ["open", "in_progress"]}})
    now = datetime.now(timezone.utc)
    this_month = now.strftime("%Y-%m")
    this_month_slips = await db.payslips.count_documents({"company_id": cid, "period_month": this_month})
    return {
        "total_employees": total_emp,
        "active_requisitions": active_reqs,
        "offers_awaiting_decision": pending_offers,
        "pending_leave_approvals": pending_leaves,
        "open_helpdesk_tickets": open_tickets,
        "payslips_generated_this_month": this_month_slips,
    }
