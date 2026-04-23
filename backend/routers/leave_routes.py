"""Leave management. Phase 1B: uses LeaveType + LeaveBalance; half-day + holiday-aware day count."""
from datetime import date, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user
from db import get_db
from models import now_iso, uid
from models_leave import LeaveCreateV2
from routers.approvals_routes import create_approval_request
from routers.leave_admin_routes import _ensure_balance, _current_year

router = APIRouter(prefix="/api/leave", tags=["leave"])


async def _branch_holidays(db, company_id: str, branch_id: Optional[str]) -> set:
    flt = {"company_id": company_id, "is_active": True, "kind": "mandatory"}
    rows = await db.holidays.find(flt, {"_id": 0, "date": 1, "branch_ids": 1}).to_list(500)
    result = set()
    for h in rows:
        if not h.get("branch_ids") or (branch_id and branch_id in h["branch_ids"]):
            result.add(h["date"])
    return result


def _working_days(start: str, end: str, weekly_offs: list, holidays: set,
                   half_day_start: bool, half_day_end: bool) -> float:
    """Count working days between start and end, excluding weekly offs and holidays.
    Half-days count as 0.5."""
    try:
        s = date.fromisoformat(start[:10])
        e = date.fromisoformat(end[:10])
    except ValueError:
        return 0.0
    if e < s:
        return 0.0
    total = 0.0
    cur = s
    while cur <= e:
        iso = cur.isoformat()
        weekday = cur.weekday()  # 0 = Mon
        is_off = weekday in weekly_offs or iso in holidays
        if not is_off:
            inc = 1.0
            if cur == s and half_day_start:
                inc = 0.5
            if cur == e and half_day_end:
                inc = 0.5 if inc == 1.0 else inc
            total += inc
        cur += timedelta(days=1)
    return total


@router.post("")
async def create_leave(body: LeaveCreateV2, user=Depends(get_current_user)):
    db = get_db()
    if not user.get("employee_id"):
        raise HTTPException(400, "No employee profile on user")
    emp = await db.employees.find_one({"id": user["employee_id"]}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employee record missing")

    lt = await db.leave_types.find_one(
        {"id": body.leave_type_id, "company_id": emp["company_id"], "is_active": True},
        {"_id": 0},
    )
    if not lt:
        raise HTTPException(404, "Leave type not found")

    # Half-day only if type allows
    half_start = body.half_day_start and lt.get("allow_half_day", True)
    half_end = body.half_day_end and lt.get("allow_half_day", True)

    # Day count, respecting weekly offs (Sun=6 by default) + company holidays
    weekly_offs = [6]  # Sunday. Config per-company in Phase 1E
    holidays = await _branch_holidays(db, emp["company_id"], emp.get("branch_id"))
    days = _working_days(body.start_date, body.end_date, weekly_offs, holidays, half_start, half_end)
    if days <= 0:
        raise HTTPException(400, "Selected range has no working days")

    # Min notice
    if lt.get("notice_days", 0) > 0:
        req_start = date.fromisoformat(body.start_date[:10])
        lead = (req_start - date.today()).days
        if lead < lt["notice_days"]:
            raise HTTPException(400, f"This leave type requires {lt['notice_days']} days advance notice")

    # Max consecutive
    mcd = lt.get("max_consecutive_days")
    if mcd and days > mcd:
        raise HTTPException(400, f"Max {mcd} consecutive days allowed for {lt['name']}")

    # Balance check (unless negative allowed)
    year = _current_year()
    bal = await _ensure_balance(db, emp["company_id"], emp["id"], lt, year)
    available = bal["allotted"] + bal.get("carried_forward", 0) + bal.get("adjustments", 0) - bal["used"] - bal.get("pending", 0)
    if not lt.get("allow_negative_balance", False) and available < days:
        raise HTTPException(400, f"Insufficient {lt['code']} balance. Available: {available:.1f}, Requested: {days:.1f}")

    # Reserve balance as pending
    await db.leave_balances.update_one(
        {"id": bal["id"]},
        {"$set": {"pending": bal.get("pending", 0) + days, "updated_at": now_iso()}},
    )

    leave_id = uid()
    leave_doc = {
        "id": leave_id, "company_id": emp["company_id"], "employee_id": emp["id"],
        "employee_name": emp["name"],
        "leave_type": lt["code"].lower(),  # kept for backward compat with old UI
        "leave_type_id": lt["id"], "leave_type_name": lt["name"], "leave_type_color": lt.get("color"),
        "start_date": body.start_date, "end_date": body.end_date,
        "half_day_start": half_start, "half_day_end": half_end,
        "days": days,
        "reason": body.reason,
        "status": "pending", "approval_request_id": None,
        "balance_id": bal["id"],
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.leave_requests.insert_one(leave_doc)
    leave_doc.pop("_id", None)

    ap = await create_approval_request(
        db, company_id=emp["company_id"], request_type="leave",
        requester_user_id=user["id"], requester_name=emp["name"],
        title=f"Leave: {lt['name']} ({body.start_date} → {body.end_date}, {days} day{'s' if days != 1 else ''})",
        details={"leave_type_id": lt["id"], "leave_type": lt["code"], "start": body.start_date,
                 "end": body.end_date, "days": days, "reason": body.reason},
        linked_id=leave_id, requester_employee_id=emp["id"],
        context={"leave_type": lt["code"].lower(), "days": days, "branch_id": emp.get("branch_id")},
    )
    await db.leave_requests.update_one({"id": leave_id}, {"$set": {"approval_request_id": ap["id"]}})
    leave_doc["approval_request_id"] = ap["id"]
    return leave_doc


@router.get("")
async def list_leave(user=Depends(get_current_user)):
    db = get_db()
    if user["role"] == "super_admin":
        rows = await db.leave_requests.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    elif user["role"] == "employee" and user.get("employee_id"):
        rows = await db.leave_requests.find({"employee_id": user["employee_id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    else:
        rows = await db.leave_requests.find({"company_id": user.get("company_id")}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return rows


@router.get("/team-calendar")
async def team_leave_calendar(user=Depends(get_current_user)):
    """Return approved+pending leaves in next 60 days for team calendar view."""
    db = get_db()
    cid = user.get("company_id")
    if not cid and user["role"] != "super_admin":
        return []
    today = date.today().isoformat()
    flt = {
        "company_id": cid,
        "status": {"$in": ["pending", "approved"]},
        "end_date": {"$gte": today},
    }
    rows = await db.leave_requests.find(
        flt, {"_id": 0, "employee_id": 1, "employee_name": 1, "start_date": 1,
              "end_date": 1, "status": 1, "leave_type_name": 1, "leave_type_color": 1, "days": 1}
    ).sort("start_date", 1).to_list(500)
    return rows


@router.post("/cancel/{leave_id}")
async def cancel_leave(leave_id: str, user=Depends(get_current_user)):
    db = get_db()
    lr = await db.leave_requests.find_one({"id": leave_id}, {"_id": 0})
    if not lr:
        raise HTTPException(404, "Not found")
    if lr["employee_id"] != user.get("employee_id") and user["role"] not in ("super_admin", "company_admin"):
        raise HTTPException(403, "Forbidden")
    if lr["status"] not in ("pending", "approved"):
        raise HTTPException(400, "Only pending or approved leaves can be cancelled")

    # Release balance
    if lr.get("balance_id"):
        bal = await db.leave_balances.find_one({"id": lr["balance_id"]}, {"_id": 0})
        if bal:
            patch = {}
            if lr["status"] == "pending":
                patch["pending"] = max(0, bal.get("pending", 0) - lr.get("days", 0))
            elif lr["status"] == "approved":
                patch["used"] = max(0, bal.get("used", 0) - lr.get("days", 0))
            if patch:
                patch["updated_at"] = now_iso()
                await db.leave_balances.update_one({"id": bal["id"]}, {"$set": patch})
    await db.leave_requests.update_one(
        {"id": leave_id}, {"$set": {"status": "cancelled", "updated_at": now_iso()}}
    )
    return {"ok": True}
