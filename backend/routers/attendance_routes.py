"""Attendance check-in/out."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from auth import get_current_user
from db import get_db
from models import CheckInBody, now_iso, uid

router = APIRouter(prefix="/api/attendance", tags=["attendance"])


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


@router.post("/checkin")
async def checkin(body: CheckInBody, user=Depends(get_current_user)):
    db = get_db()
    if not user.get("employee_id"):
        raise HTTPException(400, "Not an employee")
    emp = await db.employees.find_one({"id": user["employee_id"]}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employee missing")
    today = _today()
    existing = await db.attendance.find_one({"company_id": emp["company_id"], "employee_id": emp["id"], "date": today})
    if existing and existing.get("check_in"):
        raise HTTPException(400, "Already checked in")
    doc = {
        "id": uid(), "company_id": emp["company_id"], "employee_id": emp["id"],
        "date": today, "check_in": now_iso(), "check_out": None, "hours": 0.0,
        "location": body.location, "type": body.type, "note": body.note,
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    if existing:
        await db.attendance.update_one({"id": existing["id"]}, {"$set": doc})
        doc["id"] = existing["id"]
    else:
        await db.attendance.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.post("/checkout")
async def checkout(user=Depends(get_current_user)):
    db = get_db()
    if not user.get("employee_id"):
        raise HTTPException(400, "Not an employee")
    today = _today()
    rec = await db.attendance.find_one({"employee_id": user["employee_id"], "date": today}, {"_id": 0})
    if not rec or not rec.get("check_in"):
        raise HTTPException(400, "No check-in today")
    if rec.get("check_out"):
        raise HTTPException(400, "Already checked out")
    ci = datetime.fromisoformat(rec["check_in"])
    co = datetime.now(timezone.utc)
    hours = round((co - ci).total_seconds() / 3600.0, 2)
    await db.attendance.update_one({"id": rec["id"]}, {"$set": {
        "check_out": co.isoformat(), "hours": hours, "updated_at": now_iso(),
    }})
    rec["check_out"] = co.isoformat()
    rec["hours"] = hours
    return rec


@router.get("")
async def list_attendance(user=Depends(get_current_user)):
    db = get_db()
    if user["role"] == "employee" and user.get("employee_id"):
        rows = await db.attendance.find({"employee_id": user["employee_id"]}, {"_id": 0}).sort("date", -1).to_list(200)
    else:
        rows = await db.attendance.find({"company_id": user.get("company_id")}, {"_id": 0}).sort("date", -1).to_list(500)
    return rows


@router.get("/today")
async def today(user=Depends(get_current_user)):
    db = get_db()
    if not user.get("employee_id"):
        return None
    rec = await db.attendance.find_one({"employee_id": user["employee_id"], "date": _today()}, {"_id": 0})
    return rec
