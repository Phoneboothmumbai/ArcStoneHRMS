"""Mobile-app companion APIs.

Endpoints
---------
POST /api/mobile/checkin              — selfie + GPS check-in (geofence-validated)
POST /api/mobile/checkout             — selfie + GPS check-out
POST /api/mobile/locations/ping       — bulk location pings during the workday
GET  /api/mobile/locations/me         — employee's own pings (today)
GET  /api/mobile/locations/team       — manager/HR view of team locations (latest per emp)
POST /api/mobile/push-token           — register Expo push token
GET  /api/mobile/me                   — bootstrap data (profile, work-sites, today's status)
POST /api/mobile/visit                — field-visit log entry (sales/service)
"""
from __future__ import annotations

import base64
import math
import uuid
from datetime import date, datetime, timezone
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user, require_roles
from db import get_db
from models import now_iso, uid

router = APIRouter(prefix="/api/mobile", tags=["mobile"])


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


# =========================================================
#  Models
# =========================================================
class CheckInBody(BaseModel):
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    selfie_b64: Optional[str] = None
    site_id: Optional[str] = None
    device_id: Optional[str] = None


class CheckOutBody(BaseModel):
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    selfie_b64: Optional[str] = None
    device_id: Optional[str] = None


class LocationPing(BaseModel):
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    speed: Optional[float] = None
    heading: Optional[float] = None
    captured_at: str   # ISO timestamp from device
    battery: Optional[float] = None


class LocationPingBody(BaseModel):
    pings: List[LocationPing]
    device_id: Optional[str] = None


class PushTokenBody(BaseModel):
    token: str
    platform: Literal["ios", "android"] = "android"
    device_id: Optional[str] = None


class FieldVisitBody(BaseModel):
    customer_name: str
    purpose: str
    latitude: float
    longitude: float
    notes: Optional[str] = None
    selfie_b64: Optional[str] = None


# =========================================================
#  Helpers
# =========================================================
async def _get_emp(db, user) -> dict:
    if not user.get("employee_id"):
        raise HTTPException(400, "Only employees can use this endpoint")
    emp = await db.employees.find_one({"id": user["employee_id"]}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employee record not found")
    return emp


async def _check_geofence(db, cid: str, lat: float, lon: float, prefer_site_id: Optional[str] = None) -> dict:
    """Return matching work site or raise 403."""
    flt: dict = {"company_id": cid, "is_active": {"$ne": False}}
    if prefer_site_id:
        flt["id"] = prefer_site_id
    sites = await db.work_sites.find(flt, {"_id": 0}).to_list(200)
    if not sites:
        # No sites configured → permissive
        return {"name": "Unfenced", "id": None, "distance_m": 0}
    matched = None
    for s in sites:
        d = _haversine_m(lat, lon, float(s["latitude"]), float(s["longitude"]))
        if d <= float(s["radius_meters"]):
            matched = {**s, "distance_m": round(d, 1)}
            break
    if not matched:
        # Provide nearest distance for friendly error
        nearest = min(sites,
                      key=lambda s: _haversine_m(lat, lon, float(s["latitude"]), float(s["longitude"])))
        nearest_d = _haversine_m(lat, lon, float(nearest["latitude"]), float(nearest["longitude"]))
        raise HTTPException(403, f"You're {int(nearest_d)} m away from the nearest authorized site "
                                  f"({nearest['name']}). Move closer to check in.")
    return matched


# =========================================================
#  Bootstrap
# =========================================================
@router.get("/me")
async def me_bootstrap(user=Depends(get_current_user)):
    db = get_db()
    cid = user.get("company_id")
    emp = await _get_emp(db, user)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    today_att = await db.attendance.find_one(
        {"company_id": cid, "employee_id": emp["id"], "on_date": today}, {"_id": 0},
    )
    work_sites = await db.work_sites.find(
        {"company_id": cid, "is_active": {"$ne": False}}, {"_id": 0},
    ).to_list(200)
    return {
        "employee": {
            "id": emp["id"], "name": emp.get("name"), "code": emp.get("employee_code"),
            "title": emp.get("job_title"), "department": emp.get("department_name"),
            "branch": emp.get("branch_name"), "type": emp.get("employee_type"),
            "email": emp.get("email"), "phone": emp.get("phone"),
        },
        "today": {
            "date": today,
            "checked_in_at": today_att.get("check_in") if today_att else None,
            "checked_out_at": today_att.get("check_out") if today_att else None,
            "site_name": today_att.get("site_name") if today_att else None,
            "status": today_att.get("status") if today_att else "absent",
        },
        "work_sites": [
            {"id": s["id"], "name": s["name"], "latitude": s["latitude"],
             "longitude": s["longitude"], "radius_meters": s["radius_meters"]}
            for s in work_sites
        ],
        "tracking_required": emp.get("employee_type") in ("field", "wfo"),
    }


# =========================================================
#  Check-in / Check-out
# =========================================================
@router.post("/checkin")
async def mobile_checkin(body: CheckInBody, user=Depends(get_current_user)):
    db = get_db()
    cid = user.get("company_id")
    emp = await _get_emp(db, user)
    site = await _check_geofence(db, cid, body.latitude, body.longitude, body.site_id)

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    existing = await db.attendance.find_one(
        {"company_id": cid, "employee_id": emp["id"], "on_date": today}, {"_id": 0},
    )
    if existing and existing.get("check_in"):
        raise HTTPException(400, "Already checked in today")

    selfie_id = None
    if body.selfie_b64:
        selfie_id = uid()
        await db.attendance_selfies.insert_one({
            "id": selfie_id, "company_id": cid, "employee_id": emp["id"],
            "kind": "checkin", "on_date": today,
            "image_b64": body.selfie_b64[:2_000_000],   # cap at ~1.5 MB after b64
            "captured_at": now_iso(),
        })

    doc = {
        "id": existing.get("id") if existing else uid(),
        "company_id": cid, "employee_id": emp["id"],
        "employee_name": emp.get("name"), "employee_code": emp.get("employee_code"),
        "on_date": today,
        "check_in": now_iso(),
        "check_in_lat": body.latitude, "check_in_lon": body.longitude,
        "check_in_accuracy": body.accuracy,
        "site_id": site.get("id"), "site_name": site.get("name"),
        "check_in_distance_m": site.get("distance_m"),
        "check_in_selfie_id": selfie_id,
        "device_id": body.device_id,
        "status": "present",
        "source": "mobile",
        "updated_at": now_iso(),
    }
    if existing:
        await db.attendance.update_one({"id": existing["id"]}, {"$set": doc})
    else:
        doc["created_at"] = now_iso()
        await db.attendance.insert_one(doc)
    doc.pop("_id", None)
    return {"ok": True, "checked_in_at": doc["check_in"], "site": site.get("name"),
            "distance_m": site.get("distance_m"), "attendance": doc}


@router.post("/checkout")
async def mobile_checkout(body: CheckOutBody, user=Depends(get_current_user)):
    db = get_db()
    cid = user.get("company_id")
    emp = await _get_emp(db, user)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    existing = await db.attendance.find_one(
        {"company_id": cid, "employee_id": emp["id"], "on_date": today}, {"_id": 0},
    )
    if not existing or not existing.get("check_in"):
        raise HTTPException(400, "Check in first before checking out")
    if existing.get("check_out"):
        raise HTTPException(400, "Already checked out today")

    selfie_id = None
    if body.selfie_b64:
        selfie_id = uid()
        await db.attendance_selfies.insert_one({
            "id": selfie_id, "company_id": cid, "employee_id": emp["id"],
            "kind": "checkout", "on_date": today,
            "image_b64": body.selfie_b64[:2_000_000],
            "captured_at": now_iso(),
        })

    # Compute hours worked
    try:
        ci = datetime.fromisoformat(existing["check_in"].replace("Z", "+00:00"))
        co = datetime.now(timezone.utc)
        hours = round((co - ci).total_seconds() / 3600.0, 2)
    except Exception:
        hours = None

    await db.attendance.update_one(
        {"id": existing["id"]},
        {"$set": {
            "check_out": now_iso(),
            "check_out_lat": body.latitude, "check_out_lon": body.longitude,
            "check_out_accuracy": body.accuracy,
            "check_out_selfie_id": selfie_id,
            "hours": hours, "updated_at": now_iso(),
        }},
    )
    return {"ok": True, "checked_out_at": now_iso(), "hours": hours}


# =========================================================
#  Location pings (background tracking after check-in)
# =========================================================
@router.post("/locations/ping")
async def location_ping(body: LocationPingBody, user=Depends(get_current_user)):
    db = get_db()
    cid = user.get("company_id")
    emp = await _get_emp(db, user)
    if not body.pings:
        return {"ok": True, "saved": 0}

    # Only accept pings between check-in and check-out (or the last 16 hours fallback)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    att = await db.attendance.find_one(
        {"company_id": cid, "employee_id": emp["id"], "on_date": today}, {"_id": 0},
    )
    if not att or not att.get("check_in"):
        # Pings only allowed when checked in
        return {"ok": False, "saved": 0, "reason": "not_checked_in"}
    if att.get("check_out"):
        return {"ok": False, "saved": 0, "reason": "already_checked_out"}

    docs = []
    for p in body.pings:
        docs.append({
            "id": uid(), "company_id": cid, "employee_id": emp["id"],
            "employee_name": emp.get("name"), "employee_code": emp.get("employee_code"),
            "on_date": today, "attendance_id": att["id"],
            "latitude": p.latitude, "longitude": p.longitude,
            "accuracy": p.accuracy, "speed": p.speed, "heading": p.heading,
            "battery": p.battery, "captured_at": p.captured_at,
            "device_id": body.device_id,
            "received_at": now_iso(),
        })
    if docs:
        await db.location_pings.insert_many(docs, ordered=False)
    # Update latest known position on attendance row for fast UI lookup
    last = body.pings[-1]
    await db.attendance.update_one({"id": att["id"]}, {"$set": {
        "last_lat": last.latitude, "last_lon": last.longitude,
        "last_seen_at": last.captured_at, "updated_at": now_iso(),
    }})

    # Geofence breach detection — fire a breach notification if the LAST ping
    # is farther than (employee.geofence_radius_m OR branch.radius_meters OR 500m)
    # from the employee's home branch. Throttled to one alert per employee per hour
    # to avoid flooding HR with repeated pings.
    try:
        if emp.get("branch_id"):
            br = await db.branches.find_one({"id": emp["branch_id"]}, {"_id": 0})
            if br and br.get("latitude") is not None and br.get("longitude") is not None:
                threshold = int(
                    emp.get("geofence_radius_m")
                    or br.get("radius_meters")
                    or 500
                )
                d = _haversine_m(last.latitude, last.longitude,
                                 float(br["latitude"]), float(br["longitude"]))
                if d > threshold:
                    one_hour_ago = datetime.now(timezone.utc).replace(microsecond=0).isoformat()[:13]  # hour precision
                    recent = await db.notifications.find_one({
                        "company_id": cid, "kind": "geofence.breach",
                        "employee_id": emp["id"],
                        "created_at": {"$gte": one_hour_ago},
                    }, {"_id": 0, "id": 1})
                    if not recent:
                        # Notify HR admins (company_admin role)
                        admins = await db.users.find(
                            {"company_id": cid, "role": {"$in": ["company_admin", "country_head", "region_head"]}},
                            {"_id": 0, "id": 1},
                        ).to_list(50)
                        for adm in admins:
                            await db.notifications.insert_one({
                                "id": uid(), "company_id": cid,
                                "recipient_user_id": adm["id"],
                                "employee_id": emp["id"],
                                "title": "Geofence breach",
                                "body": (f"{emp.get('name')} is {int(d)} m from "
                                         f"{br.get('name')} (threshold {threshold} m)."),
                                "kind": "geofence.breach", "event": "geofence.breach",
                                "link": f"/app/live-tracking?emp={emp['id']}",
                                "distance_m": int(d),
                                "threshold_m": threshold,
                                "read": False, "read_at": None,
                                "created_at": now_iso(), "updated_at": now_iso(),
                            })
    except Exception:
        pass  # breach alerts are best-effort — never block the ping write

    return {"ok": True, "saved": len(docs)}


@router.get("/locations/me")
async def my_locations_today(user=Depends(get_current_user)):
    db = get_db()
    cid = user.get("company_id")
    emp = await _get_emp(db, user)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    rows = await db.location_pings.find(
        {"company_id": cid, "employee_id": emp["id"], "on_date": today}, {"_id": 0},
    ).sort("captured_at", 1).to_list(5000)
    return {"date": today, "pings": rows}


@router.get("/locations/team")
async def team_locations(
    user=Depends(require_roles("super_admin", "company_admin", "country_head",
                                "region_head", "branch_manager", "manager")),
):
    """Latest known location per employee currently checked in."""
    db = get_db()
    cid = user.get("company_id")
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    rows = await db.attendance.find(
        {"company_id": cid, "on_date": today, "check_in": {"$ne": None},
         "check_out": None, "last_lat": {"$ne": None}}, {"_id": 0},
    ).to_list(5000)
    out = []
    for r in rows:
        out.append({
            "employee_id": r["employee_id"],
            "employee_name": r.get("employee_name"),
            "employee_code": r.get("employee_code"),
            "latitude": r.get("last_lat"), "longitude": r.get("last_lon"),
            "last_seen_at": r.get("last_seen_at"),
            "site_name": r.get("site_name"),
            "checked_in_at": r.get("check_in"),
        })
    return {"date": today, "locations": out}


# =========================================================
#  Push tokens & field visits
# =========================================================
@router.post("/push-token")
async def register_push_token(body: PushTokenBody, user=Depends(get_current_user)):
    db = get_db()
    await db.push_tokens.update_one(
        {"user_id": user["id"], "device_id": body.device_id or body.token[:32]},
        {"$set": {
            "user_id": user["id"], "company_id": user.get("company_id"),
            "employee_id": user.get("employee_id"),
            "token": body.token, "platform": body.platform,
            "device_id": body.device_id, "updated_at": now_iso(),
        },
         "$setOnInsert": {"id": uid(), "created_at": now_iso()}},
        upsert=True,
    )
    return {"ok": True}


@router.post("/visit")
async def log_field_visit(body: FieldVisitBody, user=Depends(get_current_user)):
    db = get_db()
    cid = user.get("company_id")
    emp = await _get_emp(db, user)
    selfie_id = None
    if body.selfie_b64:
        selfie_id = uid()
        await db.field_visit_selfies.insert_one({
            "id": selfie_id, "company_id": cid, "employee_id": emp["id"],
            "image_b64": body.selfie_b64[:2_000_000], "captured_at": now_iso(),
        })
    doc = {
        "id": uid(), "company_id": cid, "employee_id": emp["id"],
        "employee_name": emp.get("name"),
        "customer_name": body.customer_name, "purpose": body.purpose,
        "latitude": body.latitude, "longitude": body.longitude,
        "notes": body.notes, "selfie_id": selfie_id,
        "logged_at": now_iso(), "created_at": now_iso(),
    }
    await db.field_visits.insert_one(doc)
    doc.pop("_id", None)
    return {"ok": True, "visit": doc}
