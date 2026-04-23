"""Phase 1C — Shifts, shift assignments, work sites, regularization, overtime, timesheet."""
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from auth import get_current_user, require_roles
from db import get_db
from models import now_iso, uid
from models_attendance import (
    OvertimeCreate, OvertimeRequest, Regularization, RegularizationCreate,
    Shift, ShiftAssignment, ShiftAssignmentCreate, ShiftCreate,
    Timesheet, TimesheetUpsert, WorkSite, WorkSiteCreate,
)
from routers.approvals_routes import create_approval_request

shifts_router = APIRouter(prefix="/api/shifts", tags=["shifts"])
assignments_router = APIRouter(prefix="/api/shift-assignments", tags=["shift-assignments"])
worksites_router = APIRouter(prefix="/api/work-sites", tags=["work-sites"])
reg_router = APIRouter(prefix="/api/regularization", tags=["regularization"])
ot_router = APIRouter(prefix="/api/overtime", tags=["overtime"])
ts_router = APIRouter(prefix="/api/timesheets", tags=["timesheets"])

ADMIN_ROLES = ("super_admin", "company_admin")
MGR_ROLES = ("super_admin", "company_admin", "branch_manager", "sub_manager", "assistant_manager", "country_head", "region_head")


# ---------- Shifts ----------
@shifts_router.get("")
async def list_shifts(user=Depends(get_current_user)):
    db = get_db()
    cid = user.get("company_id")
    if not cid and user["role"] != "super_admin":
        return []
    rows = await db.shifts.find(
        {"company_id": cid, "is_active": True}, {"_id": 0}
    ).sort("sort_order", 1).to_list(100)
    return rows


@shifts_router.post("")
async def create_shift(body: ShiftCreate, user=Depends(require_roles(*ADMIN_ROLES))):
    db = get_db()
    cid = user.get("company_id")
    if not cid:
        raise HTTPException(400, "Company scope required")
    if await db.shifts.find_one({"company_id": cid, "code": body.code.upper()}):
        raise HTTPException(400, "Shift with this code already exists")
    doc = Shift(company_id=cid, **{**body.model_dump(), "code": body.code.upper()}).model_dump()
    if doc.get("is_default"):
        await db.shifts.update_many({"company_id": cid}, {"$set": {"is_default": False}})
    await db.shifts.insert_one(doc)
    doc.pop("_id", None)
    return doc


@shifts_router.put("/{sid}")
async def update_shift(sid: str, body: ShiftCreate, user=Depends(require_roles(*ADMIN_ROLES))):
    db = get_db()
    cid = user.get("company_id")
    upd = {**body.model_dump(), "code": body.code.upper(), "updated_at": now_iso()}
    if upd.get("is_default"):
        await db.shifts.update_many({"company_id": cid, "id": {"$ne": sid}}, {"$set": {"is_default": False}})
    r = await db.shifts.update_one({"id": sid, "company_id": cid}, {"$set": upd})
    if r.matched_count == 0: raise HTTPException(404, "Not found")
    return await db.shifts.find_one({"id": sid}, {"_id": 0})


@shifts_router.delete("/{sid}")
async def delete_shift(sid: str, user=Depends(require_roles(*ADMIN_ROLES))):
    db = get_db()
    await db.shifts.update_one(
        {"id": sid, "company_id": user.get("company_id")}, {"$set": {"is_active": False}}
    )
    return {"ok": True}


# ---------- Shift Assignments ----------
@assignments_router.get("")
async def list_assignments(user=Depends(get_current_user), employee_id: Optional[str] = None):
    db = get_db()
    cid = user.get("company_id")
    flt = {"company_id": cid}
    if user["role"] == "employee" and user.get("employee_id"):
        flt["employee_id"] = user["employee_id"]
    elif employee_id:
        flt["employee_id"] = employee_id
    rows = await db.shift_assignments.find(flt, {"_id": 0}).sort("from_date", -1).to_list(500)
    return rows


@assignments_router.post("")
async def create_assignment(body: ShiftAssignmentCreate, user=Depends(require_roles(*MGR_ROLES))):
    db = get_db()
    cid = user.get("company_id")
    emp = await db.employees.find_one({"id": body.employee_id, "company_id": cid}, {"_id": 0})
    if not emp: raise HTTPException(404, "Employee not found")
    shift = await db.shifts.find_one({"id": body.shift_id, "company_id": cid}, {"_id": 0})
    if not shift: raise HTTPException(404, "Shift not found")
    doc = ShiftAssignment(
        company_id=cid, employee_id=emp["id"], employee_name=emp["name"],
        shift_id=shift["id"], shift_name=shift["name"], shift_code=shift["code"],
        from_date=body.from_date, to_date=body.to_date, notes=body.notes,
    ).model_dump()
    await db.shift_assignments.insert_one(doc)
    doc.pop("_id", None)
    return doc


@assignments_router.delete("/{aid}")
async def delete_assignment(aid: str, user=Depends(require_roles(*MGR_ROLES))):
    db = get_db()
    await db.shift_assignments.delete_one({"id": aid, "company_id": user.get("company_id")})
    return {"ok": True}


# ---------- Work Sites ----------
@worksites_router.get("")
async def list_sites(user=Depends(get_current_user)):
    db = get_db()
    cid = user.get("company_id")
    if not cid and user["role"] != "super_admin": return []
    rows = await db.work_sites.find({"company_id": cid, "is_active": True}, {"_id": 0}).to_list(100)
    return rows


@worksites_router.post("")
async def create_site(body: WorkSiteCreate, user=Depends(require_roles(*ADMIN_ROLES))):
    db = get_db()
    cid = user.get("company_id")
    if not cid: raise HTTPException(400, "Company scope required")
    doc = WorkSite(company_id=cid, **body.model_dump()).model_dump()
    await db.work_sites.insert_one(doc)
    doc.pop("_id", None)
    return doc


@worksites_router.put("/{sid}")
async def update_site(sid: str, body: WorkSiteCreate, user=Depends(require_roles(*ADMIN_ROLES))):
    db = get_db()
    upd = {**body.model_dump(), "updated_at": now_iso()}
    r = await db.work_sites.update_one({"id": sid, "company_id": user.get("company_id")}, {"$set": upd})
    if r.matched_count == 0: raise HTTPException(404, "Not found")
    return await db.work_sites.find_one({"id": sid}, {"_id": 0})


@worksites_router.delete("/{sid}")
async def delete_site(sid: str, user=Depends(require_roles(*ADMIN_ROLES))):
    db = get_db()
    await db.work_sites.update_one(
        {"id": sid, "company_id": user.get("company_id")}, {"$set": {"is_active": False}}
    )
    return {"ok": True}


# ---------- Regularization ----------
@reg_router.get("")
async def list_reg(user=Depends(get_current_user), status: Optional[str] = None):
    db = get_db()
    flt = {}
    if user["role"] == "employee" and user.get("employee_id"):
        flt["employee_id"] = user["employee_id"]
    elif user["role"] != "super_admin":
        flt["company_id"] = user.get("company_id")
    if status: flt["status"] = status
    rows = await db.regularizations.find(flt, {"_id": 0}).sort("created_at", -1).to_list(500)
    return rows


@reg_router.post("")
async def create_reg(body: RegularizationCreate, user=Depends(get_current_user)):
    db = get_db()
    if not user.get("employee_id"): raise HTTPException(400, "Not an employee")
    emp = await db.employees.find_one({"id": user["employee_id"]}, {"_id": 0})
    if not emp: raise HTTPException(404, "Employee not found")
    doc = Regularization(
        company_id=emp["company_id"], employee_id=emp["id"], employee_name=emp["name"],
        date=body.date, kind=body.kind, expected_check_in=body.expected_check_in,
        expected_check_out=body.expected_check_out, reason=body.reason,
    ).model_dump()
    await db.regularizations.insert_one(doc)
    ap = await create_approval_request(
        db, company_id=emp["company_id"], request_type="regularization",
        requester_user_id=user["id"], requester_name=emp["name"],
        title=f"Regularization: {body.kind} on {body.date}",
        details=body.model_dump(), linked_id=doc["id"], requester_employee_id=emp["id"],
        context={"kind": body.kind, "branch_id": emp.get("branch_id")},
    )
    await db.regularizations.update_one({"id": doc["id"]}, {"$set": {"approval_request_id": ap["id"]}})
    doc["approval_request_id"] = ap["id"]
    doc.pop("_id", None)
    return doc


# ---------- Overtime ----------
@ot_router.get("")
async def list_ot(user=Depends(get_current_user), status: Optional[str] = None):
    db = get_db()
    flt = {}
    if user["role"] == "employee" and user.get("employee_id"):
        flt["employee_id"] = user["employee_id"]
    elif user["role"] != "super_admin":
        flt["company_id"] = user.get("company_id")
    if status: flt["status"] = status
    rows = await db.overtime_requests.find(flt, {"_id": 0}).sort("created_at", -1).to_list(500)
    return rows


@ot_router.post("")
async def create_ot(body: OvertimeCreate, user=Depends(get_current_user)):
    db = get_db()
    if not user.get("employee_id"): raise HTTPException(400, "Not an employee")
    emp = await db.employees.find_one({"id": user["employee_id"]}, {"_id": 0})
    if not emp: raise HTTPException(404, "Employee not found")
    if body.hours <= 0 or body.hours > 12:
        raise HTTPException(400, "Overtime hours must be between 0 and 12")
    doc = OvertimeRequest(
        company_id=emp["company_id"], employee_id=emp["id"], employee_name=emp["name"],
        date=body.date, hours=body.hours, rate_multiplier=body.rate_multiplier, reason=body.reason,
    ).model_dump()
    await db.overtime_requests.insert_one(doc)
    ap = await create_approval_request(
        db, company_id=emp["company_id"], request_type="overtime",
        requester_user_id=user["id"], requester_name=emp["name"],
        title=f"Overtime: {body.hours}h @ {body.rate_multiplier}x on {body.date}",
        details=body.model_dump(), linked_id=doc["id"], requester_employee_id=emp["id"],
        context={"hours": body.hours, "branch_id": emp.get("branch_id")},
    )
    await db.overtime_requests.update_one({"id": doc["id"]}, {"$set": {"approval_request_id": ap["id"]}})
    doc["approval_request_id"] = ap["id"]
    doc.pop("_id", None)
    return doc


# ---------- Timesheets ----------
@ts_router.get("")
async def list_timesheets(user=Depends(get_current_user)):
    db = get_db()
    flt = {}
    if user["role"] == "employee" and user.get("employee_id"):
        flt["employee_id"] = user["employee_id"]
    elif user["role"] != "super_admin":
        flt["company_id"] = user.get("company_id")
    rows = await db.timesheets.find(flt, {"_id": 0}).sort("week_start", -1).to_list(200)
    return rows


@ts_router.post("")
async def upsert_timesheet(body: TimesheetUpsert, user=Depends(get_current_user)):
    """Save draft weekly timesheet (Mon-Sun). Submit uses POST /submit/{id}."""
    db = get_db()
    if not user.get("employee_id"): raise HTTPException(400, "Not an employee")
    emp = await db.employees.find_one({"id": user["employee_id"]}, {"_id": 0})
    if not emp: raise HTTPException(404, "Employee not found")
    total = 0.0
    for d in body.days:
        for e in d.entries: total += float(e.hours)
    existing = await db.timesheets.find_one(
        {"company_id": emp["company_id"], "employee_id": emp["id"], "week_start": body.week_start},
        {"_id": 0},
    )
    if existing and existing["status"] not in ("draft", "rejected"):
        raise HTTPException(400, "Cannot edit a submitted/approved timesheet")
    payload = {"days": [d.model_dump() for d in body.days], "total_hours": round(total, 2), "updated_at": now_iso()}
    if existing:
        await db.timesheets.update_one({"id": existing["id"]}, {"$set": {**payload, "status": "draft"}})
        return await db.timesheets.find_one({"id": existing["id"]}, {"_id": 0})
    doc = Timesheet(
        company_id=emp["company_id"], employee_id=emp["id"], employee_name=emp["name"],
        week_start=body.week_start, days=[d.model_dump() for d in body.days],
        total_hours=round(total, 2),
    ).model_dump()
    await db.timesheets.insert_one(doc)
    doc.pop("_id", None)
    return doc


@ts_router.post("/submit/{tid}")
async def submit_timesheet(tid: str, user=Depends(get_current_user)):
    db = get_db()
    ts = await db.timesheets.find_one(
        {"id": tid, "employee_id": user.get("employee_id")}, {"_id": 0}
    )
    if not ts: raise HTTPException(404, "Not found")
    if ts["status"] != "draft": raise HTTPException(400, "Only draft timesheets can be submitted")
    emp = await db.employees.find_one({"id": user["employee_id"]}, {"_id": 0})
    ap = await create_approval_request(
        db, company_id=ts["company_id"], request_type="timesheet",
        requester_user_id=user["id"], requester_name=emp["name"],
        title=f"Timesheet: week of {ts['week_start']} ({ts['total_hours']}h)",
        details={"week_start": ts["week_start"], "hours": ts["total_hours"]},
        linked_id=tid, requester_employee_id=emp["id"],
        context={"branch_id": emp.get("branch_id")},
    )
    await db.timesheets.update_one(
        {"id": tid}, {"$set": {"status": "submitted", "approval_request_id": ap["id"], "updated_at": now_iso()}}
    )
    return await db.timesheets.find_one({"id": tid}, {"_id": 0})
