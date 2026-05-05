"""Compensatory-off (comp-off) routes.

Workflow:
  1. Employee works on a weekly-off / holiday (approved by manager or auto-detected
     from attendance row having `on_date` ∈ holidays/weekly_offs AND a check-in).
  2. Employee or manager raises a comp-off request citing the work date.
  3. Manager approves (or auto-approves per workflow).
  4. +1 day (or 0.5) is credited to the employee's leave-balance row for the
     `COMPOFF` leave type, with `expires_on` = work_date + 90 days (configurable).
  5. Expiry sweep nulls any unused balance past expires_on.

  DB collections:
  - comp_off_credits: {id, company_id, employee_id, work_date, days, status,
                       reason, expires_on, approved_by, created_at}

API:
  POST   /api/comp-off/credits                  — employee requests a credit
  GET    /api/comp-off/credits                  — list (self or admin)
  POST   /api/comp-off/credits/{id}/approve     — manager/admin approve
  POST   /api/comp-off/credits/{id}/reject      — manager/admin reject
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Optional
from pydantic import BaseModel, Field

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user, require_roles
from db import get_db
from models import now_iso, uid
from audit import log_event
from routers.leave_admin_routes import _ensure_balance, _current_year

router = APIRouter(prefix="/api/comp-off", tags=["comp-off"])


class CompOffRequest(BaseModel):
    work_date: str = Field(..., description="ISO date the employee worked on weekly-off / holiday")
    days: float = Field(1.0, ge=0.5, le=1.0, description="0.5 or 1.0")
    reason: str = Field(..., min_length=3, max_length=500)
    employee_id: Optional[str] = None   # admin can file on behalf


# --- Credit workflow -----------------------------------------------------
@router.post("/credits")
async def request_credit(body: CompOffRequest, user=Depends(get_current_user)):
    db = get_db()
    cid = user.get("company_id")
    emp_id = body.employee_id or user.get("employee_id")
    if not emp_id:
        raise HTTPException(400, "employee_id required for this role")

    # Validate the work_date is a valid ISO date
    try:
        d = date.fromisoformat(body.work_date)
    except ValueError:
        raise HTTPException(422, "work_date must be ISO YYYY-MM-DD")
    if d > date.today():
        raise HTTPException(422, "Cannot claim comp-off for a future date")

    # Dedupe: one credit per (employee, work_date)
    exists = await db.comp_off_credits.find_one({
        "company_id": cid, "employee_id": emp_id, "work_date": body.work_date,
        "status": {"$in": ["pending", "approved"]},
    })
    if exists:
        raise HTTPException(409, "Comp-off for this date already exists")

    # Default expiry = 90 days from work_date
    expires_on = (d + timedelta(days=90)).isoformat()

    doc = {
        "id": uid(),
        "company_id": cid,
        "employee_id": emp_id,
        "work_date": body.work_date,
        "days": body.days,
        "reason": body.reason,
        "status": "pending",
        "expires_on": expires_on,
        "created_by": user["id"],
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.comp_off_credits.insert_one(doc)
    doc.pop("_id", None)
    await log_event(db, actor=user, event="comp_off.requested",
                    resource_type="comp_off_credit", resource_id=doc["id"],
                    detail={"work_date": body.work_date, "days": body.days})
    return doc


@router.get("/credits")
async def list_credits(status: Optional[str] = None, user=Depends(get_current_user)):
    db = get_db()
    cid = user.get("company_id")
    q: dict = {"company_id": cid}
    # Non-admin employees see only their own rows
    if user["role"] not in ("super_admin", "company_admin", "branch_manager",
                             "sub_manager", "assistant_manager"):
        q["employee_id"] = user.get("employee_id")
    if status:
        q["status"] = status
    rows = await db.comp_off_credits.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return rows


@router.post("/credits/{cid_id}/approve")
async def approve_credit(cid_id: str, user=Depends(require_roles(
        "super_admin", "company_admin", "branch_manager", "sub_manager", "assistant_manager"))):
    db = get_db()
    cid = user.get("company_id")
    row = await db.comp_off_credits.find_one({"id": cid_id, "company_id": cid}, {"_id": 0})
    if not row:
        raise HTTPException(404, "Credit not found")
    if row["status"] != "pending":
        raise HTTPException(400, f"Already {row['status']}")

    # Credit the leave balance under the COMPOFF leave type.
    # Balance row uses opening_balance + carried_forward + credits_ytd so we
    # just bump credits_ytd — that's what `_ensure_balance` expects.
    year = _current_year()
    lt = await db.leave_types.find_one(
        {"company_id": cid, "code": {"$regex": "^COMPOFF$", "$options": "i"}}, {"_id": 0})
    if not lt:
        # Auto-create the COMPOFF leave type on first use
        from models_leave import LeaveType
        lt = LeaveType(company_id=cid, code="COMPOFF", name="Compensatory Off",
                       is_paid=True, requires_approval=True, color="#22c55e",
                       annual_entitlement=0, carry_forward_max=0,
                       can_encash=False, max_continuous_days=5).model_dump()
        await db.leave_types.insert_one(lt)

    bal = await _ensure_balance(db, cid, row["employee_id"], lt, year)
    bal_id = bal["id"]
    await db.leave_balances.update_one(
        {"id": bal_id},
        {"$inc": {"credits_ytd": row["days"]}, "$set": {"updated_at": now_iso()}},
    )
    await db.comp_off_credits.update_one(
        {"id": cid_id},
        {"$set": {"status": "approved", "approved_by": user["id"],
                  "approved_at": now_iso(), "updated_at": now_iso()}},
    )
    await log_event(db, actor=user, event="comp_off.approved",
                    resource_type="comp_off_credit", resource_id=cid_id,
                    detail={"employee_id": row["employee_id"], "days": row["days"]})
    return {"ok": True, "balance_id": bal_id, "days_credited": row["days"]}


@router.post("/credits/{cid_id}/reject")
async def reject_credit(cid_id: str, user=Depends(require_roles(
        "super_admin", "company_admin", "branch_manager", "sub_manager", "assistant_manager"))):
    db = get_db()
    cid = user.get("company_id")
    await db.comp_off_credits.update_one(
        {"id": cid_id, "company_id": cid, "status": "pending"},
        {"$set": {"status": "rejected", "rejected_by": user["id"],
                  "rejected_at": now_iso(), "updated_at": now_iso()}},
    )
    await log_event(db, actor=user, event="comp_off.rejected",
                    resource_type="comp_off_credit", resource_id=cid_id)
    return {"ok": True}
