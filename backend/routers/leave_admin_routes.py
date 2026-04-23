"""Leave policy & holiday admin + balance operations."""
from datetime import date, datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from auth import get_current_user, require_roles
from db import get_db
from models import now_iso, uid
from models_leave import (
    Holiday, HolidayCreate, LeaveAdjustment,
    LeaveBalance, LeaveType, LeaveTypeCreate,
)

router = APIRouter(prefix="/api/leave-admin", tags=["leave-admin"])
public = APIRouter(prefix="/api/leave-types", tags=["leave-types"])
holidays_router = APIRouter(prefix="/api/holidays", tags=["holidays"])
balances_router = APIRouter(prefix="/api/leave-balances", tags=["leave-balances"])


# ---------- Leave Types ----------
@public.get("")
async def list_leave_types(user=Depends(get_current_user)):
    db = get_db()
    cid = user.get("company_id")
    if user["role"] == "super_admin" and not cid:
        return []
    rows = await db.leave_types.find(
        {"company_id": cid, "is_active": True}, {"_id": 0}
    ).sort("sort_order", 1).to_list(100)
    return rows


@router.post("/types")
async def create_leave_type(
    body: LeaveTypeCreate, user=Depends(require_roles("super_admin", "company_admin"))
):
    db = get_db()
    cid = user.get("company_id")
    if not cid:
        raise HTTPException(400, "Company scope required")
    code_up = body.code.upper()
    if await db.leave_types.find_one({"company_id": cid, "code": code_up, "is_active": True}):
        raise HTTPException(400, "Leave type with this code already exists")
    # Reactivate soft-deleted row if present (unique index is on (company_id, code), active flag not included).
    inactive = await db.leave_types.find_one({"company_id": cid, "code": code_up, "is_active": False})
    if inactive:
        upd = {**body.model_dump(), "code": code_up, "is_active": True, "updated_at": now_iso()}
        await db.leave_types.update_one({"id": inactive["id"]}, {"$set": upd})
        return await db.leave_types.find_one({"id": inactive["id"]}, {"_id": 0})
    doc = LeaveType(company_id=cid, **{**body.model_dump(), "code": code_up}).model_dump()
    await db.leave_types.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/types/{tid}")
async def update_leave_type(
    tid: str, body: LeaveTypeCreate,
    user=Depends(require_roles("super_admin", "company_admin")),
):
    db = get_db()
    cid = user.get("company_id")
    upd = body.model_dump()
    upd["code"] = body.code.upper()
    upd["updated_at"] = now_iso()
    r = await db.leave_types.update_one(
        {"id": tid, "company_id": cid}, {"$set": upd}
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Not found")
    return await db.leave_types.find_one({"id": tid}, {"_id": 0})


@router.delete("/types/{tid}")
async def delete_leave_type(tid: str, user=Depends(require_roles("super_admin", "company_admin"))):
    db = get_db()
    await db.leave_types.update_one(
        {"id": tid, "company_id": user.get("company_id")}, {"$set": {"is_active": False, "updated_at": now_iso()}}
    )
    return {"ok": True}


# ---------- Holidays ----------
@holidays_router.get("")
async def list_holidays(
    user=Depends(get_current_user),
    year: Optional[int] = Query(None),
    branch_id: Optional[str] = Query(None),
):
    db = get_db()
    cid = user.get("company_id")
    if not cid and user["role"] != "super_admin":
        return []
    flt = {"company_id": cid, "is_active": True}
    if year:
        flt["date"] = {"$gte": f"{year}-01-01", "$lte": f"{year}-12-31"}
    rows = await db.holidays.find(flt, {"_id": 0}).sort("date", 1).to_list(500)
    if branch_id:
        rows = [h for h in rows if not h.get("branch_ids") or branch_id in h["branch_ids"]]
    return rows


@holidays_router.post("")
async def create_holiday(
    body: HolidayCreate, user=Depends(require_roles("super_admin", "company_admin"))
):
    db = get_db()
    cid = user.get("company_id")
    if not cid:
        raise HTTPException(400, "Company scope required")
    doc = Holiday(company_id=cid, **body.model_dump()).model_dump()
    await db.holidays.insert_one(doc)
    doc.pop("_id", None)
    return doc


@holidays_router.put("/{hid}")
async def update_holiday(
    hid: str, body: HolidayCreate, user=Depends(require_roles("super_admin", "company_admin"))
):
    db = get_db()
    upd = body.model_dump()
    upd["updated_at"] = now_iso()
    r = await db.holidays.update_one(
        {"id": hid, "company_id": user.get("company_id")}, {"$set": upd}
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Not found")
    return await db.holidays.find_one({"id": hid}, {"_id": 0})


@holidays_router.delete("/{hid}")
async def delete_holiday(hid: str, user=Depends(require_roles("super_admin", "company_admin"))):
    db = get_db()
    await db.holidays.update_one(
        {"id": hid, "company_id": user.get("company_id")}, {"$set": {"is_active": False}}
    )
    return {"ok": True}


# ---------- Balances ----------
def _current_year() -> int:
    return datetime.now(timezone.utc).year


async def _ensure_balance(db, company_id: str, emp_id: str, lt: dict, year: int) -> dict:
    bal = await db.leave_balances.find_one(
        {"company_id": company_id, "employee_id": emp_id, "leave_type_id": lt["id"], "year": year},
        {"_id": 0},
    )
    if bal:
        return bal
    doc = LeaveBalance(
        company_id=company_id, employee_id=emp_id, leave_type_id=lt["id"],
        leave_type_code=lt["code"], year=year,
        allotted=float(lt.get("default_days_per_year", 0.0)),
        accrued=float(lt.get("default_days_per_year", 0.0)) if lt.get("accrual_cadence") == "yearly" else 0.0,
    ).model_dump()
    await db.leave_balances.insert_one(doc)
    doc.pop("_id", None)
    return doc


@balances_router.get("/employee/{emp_id}")
async def get_employee_balances(
    emp_id: str, year: Optional[int] = Query(None), user=Depends(get_current_user)
):
    db = get_db()
    emp = await db.employees.find_one({"id": emp_id}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employee not found")
    cid = emp["company_id"]
    # Access: self / manager / HR / super_admin
    if user["role"] != "super_admin" and user.get("company_id") != cid:
        raise HTTPException(403, "Forbidden")
    yr = year or _current_year()

    types = await db.leave_types.find(
        {"company_id": cid, "is_active": True}, {"_id": 0}
    ).sort("sort_order", 1).to_list(100)

    out = []
    for lt in types:
        # Gender / grade / employment_type / min_service eligibility
        if lt.get("applies_to_gender") and lt["applies_to_gender"] != "any":
            # requires personal profile; we do a best-effort skip if not matching
            profile = await db.employee_profiles.find_one(
                {"employee_id": emp_id}, {"_id": 0, "personal": 1}
            )
            pg = (profile or {}).get("personal", {}).get("gender")
            if pg and pg != lt["applies_to_gender"]:
                continue
        if lt.get("applies_to_employment_types"):
            profile = await db.employee_profiles.find_one(
                {"employee_id": emp_id}, {"_id": 0, "employment": 1}
            )
            et = (profile or {}).get("employment", {}).get("employment_type")
            if et and et not in lt["applies_to_employment_types"]:
                continue
        bal = await _ensure_balance(db, cid, emp_id, lt, yr)
        available = bal["allotted"] + bal.get("carried_forward", 0) + bal.get("adjustments", 0) - bal["used"] - bal.get("pending", 0)
        out.append({**bal, "type": lt, "available": available})
    return {"year": yr, "balances": out}


@balances_router.post("/employee/{emp_id}/adjust")
async def adjust_balance(
    emp_id: str, body: LeaveAdjustment, user=Depends(require_roles("super_admin", "company_admin"))
):
    db = get_db()
    emp = await db.employees.find_one({"id": emp_id}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employee not found")
    if user["role"] != "super_admin" and user.get("company_id") != emp["company_id"]:
        raise HTTPException(403, "Forbidden")
    lt = await db.leave_types.find_one(
        {"id": body.leave_type_id, "company_id": emp["company_id"]}, {"_id": 0}
    )
    if not lt:
        raise HTTPException(404, "Leave type not found")
    year = body.year or _current_year()
    bal = await _ensure_balance(db, emp["company_id"], emp_id, lt, year)
    newadj = float(bal.get("adjustments", 0)) + float(body.days)
    await db.leave_balances.update_one(
        {"id": bal["id"]}, {"$set": {"adjustments": newadj, "updated_at": now_iso()}}
    )
    # Audit trail
    await db.leave_adjustments_log.insert_one({
        "id": uid(), "company_id": emp["company_id"], "employee_id": emp_id,
        "leave_type_id": body.leave_type_id, "year": year, "days": body.days,
        "reason": body.reason, "by_user_id": user["id"],
        "by_user_name": user.get("name") or user.get("email"),
        "at": now_iso(),
    })
    return await db.leave_balances.find_one({"id": bal["id"]}, {"_id": 0})
