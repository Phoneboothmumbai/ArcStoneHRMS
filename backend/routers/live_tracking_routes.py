"""Live location tracking — admin-facing endpoints.

Visibility rules (enforced server-side):
  • super_admin / company_admin / country_head / region_head  → can view every employee
  • branch_manager / sub_manager / assistant_manager          → can view their direct reports
  • any employee listed in target's `location_viewers[]`      → can view that target
  • Otherwise: forbidden.

Only employees flagged with `is_field_tracked = True` surface on the live map.
Everyone else is hidden from the admin tracking UI (office workers who don't
need tracking aren't shown — saves battery too, since the mobile app gates
background pings by the same flag).

Endpoints
─────────
GET    /api/admin/locations/live                      latest ping per tracked employee
GET    /api/admin/locations/trail/{eid}?date=YYYY-MM-DD   full day trail for one employee
GET    /api/admin/locations/viewers/{eid}             who can view this employee's map
PATCH  /api/admin/locations/viewers/{eid}             update viewers
POST   /api/admin/locations/field-flag/{eid}          toggle is_field_tracked
GET    /api/admin/locations/breaches                  recent geofence breaches
"""
from __future__ import annotations
from datetime import date, datetime, timezone
from math import radians, sin, cos, sqrt, atan2
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from db import get_db
from auth import get_current_user, require_roles
from models import now_iso

ADMIN = ("super_admin", "company_admin", "country_head", "region_head")
MANAGER = (*ADMIN, "branch_manager", "sub_manager", "assistant_manager")

router = APIRouter(prefix="/api/admin/locations", tags=["admin-locations"])


def _haversine_m(lat1, lon1, lat2, lon2) -> float:
    R = 6371000.0
    dlat, dlon = radians(lat2 - lat1), radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * R * atan2(sqrt(a), sqrt(1 - a))


async def _can_view(db, user: dict, target_emp: dict) -> bool:
    """RBAC for live location viewing."""
    role = user.get("role")
    if role in ADMIN:
        return True
    # Direct-report check
    if role in ("branch_manager", "sub_manager", "assistant_manager"):
        manager_emp = await db.employees.find_one({"user_id": user["id"]}, {"_id": 0, "id": 1})
        if manager_emp and target_emp.get("manager_id") == manager_emp["id"]:
            return True
    # Explicit viewers (TL / peer / mentor)
    viewers = target_emp.get("location_viewers") or []
    if user["id"] in viewers:
        return True
    return False


async def _visible_employees(db, user: dict) -> list:
    """Return only employees this user is allowed to track."""
    cid = user.get("company_id")
    flt = {"company_id": cid, "is_field_tracked": True, "status": {"$ne": "terminated"}}
    all_tracked = await db.employees.find(
        flt, {"_id": 0, "id": 1, "name": 1, "employee_code": 1, "email": 1,
              "manager_id": 1, "branch_id": 1, "department_id": 1,
              "designation": 1, "photo_base64": 1, "location_viewers": 1}
    ).to_list(2000)

    if user.get("role") in ADMIN:
        return all_tracked
    # Manager / viewer paths
    mine = []
    manager_emp = await db.employees.find_one({"user_id": user["id"]}, {"_id": 0, "id": 1})
    my_eid = manager_emp["id"] if manager_emp else None
    for e in all_tracked:
        if my_eid and e.get("manager_id") == my_eid:
            mine.append(e)
            continue
        if user["id"] in (e.get("location_viewers") or []):
            mine.append(e)
    return mine


# ──────────────── GET /live ────────────────
@router.get("/live")
async def live_snapshot(user=Depends(get_current_user)):
    """Latest ping per tracked employee the caller is allowed to see.
    Includes distance to home branch (for dashboards/sort) and geofence status."""
    db = get_db()
    cid = user.get("company_id")
    emps = await _visible_employees(db, user)
    if not emps:
        return {"count": 0, "rows": []}

    # Fetch today's attendance rows for fast last-ping lookup
    today = date.today().isoformat()
    att = await db.attendance.find(
        {"company_id": cid, "on_date": today,
         "employee_id": {"$in": [e["id"] for e in emps]}},
        {"_id": 0, "employee_id": 1, "check_in": 1, "check_out": 1,
         "last_lat": 1, "last_lon": 1, "last_seen_at": 1}
    ).to_list(2000)
    att_by_eid = {a["employee_id"]: a for a in att}

    # Pre-load branches for home-office coordinates
    branch_ids = list({e["branch_id"] for e in emps if e.get("branch_id")})
    branches = await db.branches.find(
        {"id": {"$in": branch_ids}}, {"_id": 0}
    ).to_list(500) if branch_ids else []
    br_by_id = {b["id"]: b for b in branches}

    rows = []
    for e in emps:
        a = att_by_eid.get(e["id"])
        br = br_by_id.get(e.get("branch_id"))
        row = {
            "employee_id": e["id"],
            "employee_code": e.get("employee_code"),
            "name": e["name"],
            "designation": e.get("designation"),
            "photo_base64": e.get("photo_base64"),
            "branch_id": e.get("branch_id"),
            "branch_name": (br or {}).get("name"),
            "branch_lat": (br or {}).get("latitude"),
            "branch_lon": (br or {}).get("longitude"),
            "status": "offline",
            "last_lat": None, "last_lon": None, "last_seen_at": None,
            "distance_m": None,
            "checked_in_at": None, "checked_out_at": None,
        }
        if a:
            row["checked_in_at"] = a.get("check_in")
            row["checked_out_at"] = a.get("check_out")
            row["last_lat"] = a.get("last_lat")
            row["last_lon"] = a.get("last_lon")
            row["last_seen_at"] = a.get("last_seen_at")
            if a.get("check_in") and not a.get("check_out"):
                row["status"] = "on_duty"
            elif a.get("check_out"):
                row["status"] = "signed_out"
        # Distance to home branch if we have both
        if row["last_lat"] is not None and row["branch_lat"] is not None:
            try:
                row["distance_m"] = round(_haversine_m(
                    row["last_lat"], row["last_lon"],
                    float(row["branch_lat"]), float(row["branch_lon"])
                ))
            except Exception:
                pass
        rows.append(row)

    # Sort: on_duty first (by most-recent ping), then signed_out, then offline
    order = {"on_duty": 0, "signed_out": 1, "offline": 2}
    rows.sort(key=lambda r: (order.get(r["status"], 3), -(r["last_seen_at"] or "")[:16].__hash__()))
    return {"count": len(rows), "rows": rows, "server_time": now_iso()}


# ──────────────── GET /trail/{eid} ────────────────
@router.get("/trail/{eid}")
async def trail(eid: str, date_str: Optional[str] = Query(None, alias="date"), user=Depends(get_current_user)):
    db = get_db()
    cid = user.get("company_id")
    emp = await db.employees.find_one({"id": eid, "company_id": cid}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employee not found")
    if not await _can_view(db, user, emp):
        raise HTTPException(403, "You don't have permission to view this employee's location")
    on_date = date_str or date.today().isoformat()
    pings = await db.location_pings.find(
        {"company_id": cid, "employee_id": eid, "on_date": on_date},
        {"_id": 0, "latitude": 1, "longitude": 1, "captured_at": 1,
         "accuracy": 1, "speed": 1, "battery": 1}
    ).sort("captured_at", 1).to_list(10000)
    return {"employee_id": eid, "employee_name": emp.get("name"),
            "date": on_date, "count": len(pings), "pings": pings}


# ──────────────── Viewers management ────────────────
class ViewersUpdate(BaseModel):
    viewer_user_ids: List[str]


@router.get("/viewers/{eid}")
async def list_viewers(eid: str, user=Depends(require_roles(*MANAGER))):
    db = get_db()
    emp = await db.employees.find_one(
        {"id": eid, "company_id": user.get("company_id")},
        {"_id": 0, "location_viewers": 1, "name": 1, "manager_id": 1},
    )
    if not emp:
        raise HTTPException(404, "Employee not found")
    viewer_ids = emp.get("location_viewers") or []
    users = await db.users.find({"id": {"$in": viewer_ids}}, {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1}).to_list(200)
    return {"employee": {"id": eid, "name": emp.get("name"), "manager_id": emp.get("manager_id")}, "viewers": users}


@router.patch("/viewers/{eid}")
async def update_viewers(eid: str, body: ViewersUpdate, user=Depends(require_roles(*ADMIN))):
    """Replace the viewer list. Admin-only to prevent privacy drift."""
    db = get_db()
    cid = user.get("company_id")
    # Validate viewer user IDs belong to this company
    bad = []
    if body.viewer_user_ids:
        found = await db.users.find(
            {"id": {"$in": body.viewer_user_ids}, "company_id": cid},
            {"_id": 0, "id": 1},
        ).to_list(500)
        found_ids = {u["id"] for u in found}
        bad = [i for i in body.viewer_user_ids if i not in found_ids]
    if bad:
        raise HTTPException(400, f"These user IDs don't belong to your company: {bad}")
    r = await db.employees.update_one(
        {"id": eid, "company_id": cid},
        {"$set": {"location_viewers": list(set(body.viewer_user_ids)),
                  "updated_at": now_iso()}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Employee not found")
    return {"ok": True, "viewer_count": len(set(body.viewer_user_ids))}


# ──────────────── Field-flag toggle ────────────────
class FieldFlagBody(BaseModel):
    is_field_tracked: bool
    geofence_radius_m: Optional[int] = None   # override default breach threshold


@router.post("/field-flag/{eid}")
async def toggle_field_flag(eid: str, body: FieldFlagBody, user=Depends(require_roles(*ADMIN))):
    db = get_db()
    upd = {"is_field_tracked": body.is_field_tracked, "updated_at": now_iso()}
    if body.geofence_radius_m is not None:
        upd["geofence_radius_m"] = max(0, int(body.geofence_radius_m))
    r = await db.employees.update_one(
        {"id": eid, "company_id": user.get("company_id")}, {"$set": upd},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Employee not found")
    return {"ok": True, "is_field_tracked": body.is_field_tracked}


# ──────────────── Breaches feed ────────────────
@router.get("/breaches")
async def list_breaches(limit: int = 100, user=Depends(require_roles(*MANAGER))):
    db = get_db()
    cid = user.get("company_id")
    flt = {"company_id": cid, "kind": "geofence.breach"}
    # Managers only see their team's breaches
    if user.get("role") not in ADMIN:
        manager_emp = await db.employees.find_one({"user_id": user["id"]}, {"_id": 0, "id": 1})
        if not manager_emp:
            return []
        team = await db.employees.find(
            {"manager_id": manager_emp["id"]}, {"_id": 0, "id": 1}
        ).to_list(2000)
        team_ids = [e["id"] for e in team]
        flt["employee_id"] = {"$in": team_ids}
    rows = await db.notifications.find(flt, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return rows
