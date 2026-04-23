"""Attendance v2 — shift-aware check-in/out, geo-fencing, late mark, half-day detection."""
import math
from datetime import date, datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from auth import get_current_user
from db import get_db
from models import now_iso, uid
from models_attendance import CheckInBodyV2

router = APIRouter(prefix="/api/attendance", tags=["attendance"])


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _haversine_m(lat1, lon1, lat2, lon2) -> float:
    """Great-circle distance in metres."""
    R = 6371000.0
    rlat1, rlat2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


async def _active_shift_for(db, emp: dict, on_date: str) -> Optional[dict]:
    """Find shift assignment whose window contains `on_date`; fallback to company default."""
    assigns = await db.shift_assignments.find(
        {"company_id": emp["company_id"], "employee_id": emp["id"], "from_date": {"$lte": on_date}},
        {"_id": 0},
    ).to_list(20)
    for a in sorted(assigns, key=lambda x: x["from_date"], reverse=True):
        if not a.get("to_date") or a["to_date"] >= on_date:
            return await db.shifts.find_one({"id": a["shift_id"]}, {"_id": 0})
    return await db.shifts.find_one(
        {"company_id": emp["company_id"], "is_default": True, "is_active": True}, {"_id": 0}
    )


async def _geo_check(db, emp: dict, body: CheckInBodyV2) -> tuple[bool, Optional[str]]:
    """Return (within_fence, site_id_matched). Only enforces if employee is WFO/Field AND site provided."""
    # WFH bypass
    if body.type == "wfh":
        return True, None
    if body.latitude is None or body.longitude is None:
        return False, None
    # Find the nearest active site for this company
    sites = await db.work_sites.find(
        {"company_id": emp["company_id"], "is_active": True}, {"_id": 0}
    ).to_list(100)
    if not sites:
        return True, None    # no geo-fencing configured
    # Filter by branch if employee has one
    candidates = [s for s in sites if not s.get("branch_id") or s["branch_id"] == emp.get("branch_id")]
    if not candidates:
        candidates = sites
    for s in candidates:
        d = _haversine_m(body.latitude, body.longitude, s["latitude"], s["longitude"])
        if d <= s["radius_meters"]:
            return True, s["id"]
    return False, None


@router.post("/checkin")
async def checkin(body: CheckInBodyV2, user=Depends(get_current_user)):
    db = get_db()
    if not user.get("employee_id"):
        raise HTTPException(400, "Not an employee")
    emp = await db.employees.find_one({"id": user["employee_id"]}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employee missing")
    today = _today()
    existing = await db.attendance.find_one(
        {"company_id": emp["company_id"], "employee_id": emp["id"], "date": today},
        {"_id": 0},
    )
    if existing and existing.get("check_in"):
        raise HTTPException(400, "Already checked in")

    shift = await _active_shift_for(db, emp, today)
    # Geo fence verification
    geo_ok, matched_site = await _geo_check(db, emp, body)
    if not geo_ok:
        raise HTTPException(400, "Outside allowed location — contact HR or submit regularization")

    # Late mark logic
    is_late = False
    late_minutes = 0
    if shift:
        try:
            expected = datetime.combine(
                date.fromisoformat(today),
                datetime.strptime(shift["start_time"], "%H:%M").time(),
                tzinfo=timezone.utc,
            )
            now_utc = datetime.now(timezone.utc)
            delta_min = int((now_utc - expected).total_seconds() / 60)
            if delta_min > shift.get("grace_minutes", 15):
                is_late = True
                late_minutes = delta_min - shift.get("grace_minutes", 15)
        except Exception:
            pass

    doc = {
        "id": uid(), "company_id": emp["company_id"], "employee_id": emp["id"],
        "employee_name": emp["name"],
        "date": today, "check_in": now_iso(), "check_out": None, "hours": 0.0,
        "location": body.location, "type": body.type, "note": body.note,
        "latitude": body.latitude, "longitude": body.longitude,
        "site_id": matched_site, "device_info": body.device_info,
        "shift_id": shift["id"] if shift else None,
        "shift_code": shift["code"] if shift else None,
        "is_late": is_late, "late_minutes": late_minutes,
        "is_half_day": False, "is_regularized": False,
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

    # Half-day detection based on shift
    is_half_day = False
    if rec.get("shift_id"):
        shift = await db.shifts.find_one({"id": rec["shift_id"]}, {"_id": 0})
        if shift and hours < float(shift.get("min_hours_for_full_day", 8.0)) and hours >= float(shift.get("half_day_threshold_hours", 4.5)):
            is_half_day = True

    await db.attendance.update_one({"id": rec["id"]}, {"$set": {
        "check_out": co.isoformat(), "hours": hours, "is_half_day": is_half_day, "updated_at": now_iso(),
    }})
    rec["check_out"] = co.isoformat()
    rec["hours"] = hours
    rec["is_half_day"] = is_half_day
    return rec


@router.get("")
async def list_attendance(
    user=Depends(get_current_user),
    employee_id: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
):
    db = get_db()
    flt = {}
    if user["role"] == "employee" and user.get("employee_id"):
        flt["employee_id"] = user["employee_id"]
    elif user["role"] != "super_admin":
        flt["company_id"] = user.get("company_id")
    if employee_id and user["role"] != "employee":
        flt["employee_id"] = employee_id
    if from_date or to_date:
        rng = {}
        if from_date: rng["$gte"] = from_date
        if to_date: rng["$lte"] = to_date
        flt["date"] = rng
    rows = await db.attendance.find(flt, {"_id": 0}).sort("date", -1).to_list(1000)
    return rows


@router.get("/today")
async def today(user=Depends(get_current_user)):
    db = get_db()
    if not user.get("employee_id"):
        return None
    rec = await db.attendance.find_one(
        {"employee_id": user["employee_id"], "date": _today()}, {"_id": 0}
    )
    return rec


@router.get("/register")
async def monthly_register(
    user=Depends(get_current_user),
    month: str = Query(..., description="YYYY-MM"),
    branch_id: Optional[str] = Query(None),
):
    """Monthly attendance MIS: per-employee row with daily status (P/A/L/H/HD/WO)."""
    db = get_db()
    cid = user.get("company_id")
    if user["role"] == "employee" and user.get("employee_id"):
        emp_flt = {"id": user["employee_id"]}
    else:
        emp_flt = {"company_id": cid}
        if branch_id: emp_flt["branch_id"] = branch_id

    employees = await db.employees.find(emp_flt, {"_id": 0}).to_list(500)
    yr, mo = map(int, month.split("-"))
    days_in_month = (date(yr + (1 if mo == 12 else 0), (mo % 12) + 1, 1) - timedelta(days=1)).day
    dates = [f"{month}-{d:02d}" for d in range(1, days_in_month + 1)]

    # Load holidays + attendance + leaves for the range
    holidays = {
        h["date"]: h for h in await db.holidays.find(
            {"company_id": cid, "date": {"$gte": dates[0], "$lte": dates[-1]}, "is_active": True, "kind": "mandatory"},
            {"_id": 0},
        ).to_list(50)
    }
    attn_rows = await db.attendance.find(
        {"company_id": cid, "date": {"$gte": dates[0], "$lte": dates[-1]}},
        {"_id": 0},
    ).to_list(5000)
    attn_map = {}
    for a in attn_rows:
        attn_map.setdefault(a["employee_id"], {})[a["date"]] = a
    leaves = await db.leave_requests.find(
        {"company_id": cid, "status": "approved"}, {"_id": 0}
    ).to_list(2000)
    leave_map = {}
    for lr in leaves:
        s = lr["start_date"][:10]; e = lr["end_date"][:10]
        cur = date.fromisoformat(s)
        end = date.fromisoformat(e)
        while cur <= end:
            leave_map.setdefault(lr["employee_id"], {})[cur.isoformat()] = lr
            cur += timedelta(days=1)

    out = []
    for emp in employees:
        row = {"employee_id": emp["id"], "employee_name": emp["name"], "employee_code": emp.get("employee_code"), "days": []}
        p = a_count = l_count = h_count = wo_count = hd_count = 0
        for d in dates:
            dt = date.fromisoformat(d)
            wd = dt.weekday()
            code = "A"
            if d in holidays: code = "H"; h_count += 1
            elif wd == 6: code = "WO"; wo_count += 1
            elif attn_map.get(emp["id"], {}).get(d):
                rec = attn_map[emp["id"]][d]
                if rec.get("is_half_day"): code = "HD"; hd_count += 1
                elif rec.get("is_late"): code = "P*"; p += 1
                else: code = "P"; p += 1
            elif leave_map.get(emp["id"], {}).get(d):
                code = "L"; l_count += 1
            else:
                a_count += 1
            row["days"].append({"date": d, "code": code})
        row["summary"] = {"present": p, "absent": a_count, "leave": l_count, "holidays": h_count, "week_off": wo_count, "half_day": hd_count}
        out.append(row)
    return {"month": month, "dates": dates, "rows": out}
