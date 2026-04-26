"""Visitor Management — front-desk module.

Flow:
1. Receptionist creates a visitor entry (or self-checkin form on a kiosk).
2. System fires an in-app notification to the host employee.
3. (Future) An OTP can be sent to the visitor's phone for self-checkin auth.
4. On exit, receptionist (or host) signs them out.

Endpoints
─────────
GET    /api/visitors                       list (filterable)
POST   /api/visitors                       create / check-in
POST   /api/visitors/{vid}/checkout        sign out
GET    /api/visitors/today                 quick today-only feed
"""
from __future__ import annotations
from datetime import date, datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from db import get_db
from auth import get_current_user, require_roles
from models import uid, now_iso

ADMIN = ("super_admin", "company_admin", "country_head", "region_head", "branch_manager")


class VisitorCreate(BaseModel):
    name: str
    company: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    purpose: Optional[str] = None
    host_employee_id: str            # who they're meeting
    photo_base64: Optional[str] = None
    id_proof_type: Optional[str] = None     # aadhaar, dl, passport, etc.
    id_proof_last4: Optional[str] = None    # only last 4 digits stored
    badge_no: Optional[str] = None
    branch_id: Optional[str] = None
    expected_duration_min: Optional[int] = None


class VisitorCheckout(BaseModel):
    notes: Optional[str] = None


router = APIRouter(prefix="/api/visitors", tags=["visitors"])


@router.get("")
async def list_visitors(
    status: Optional[str] = Query(None, description="checked_in / checked_out / all"),
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    user=Depends(get_current_user),
):
    db = get_db()
    flt = {"company_id": user.get("company_id")}
    if status and status != "all":
        flt["status"] = status
    if from_date:
        flt.setdefault("checked_in_at", {})["$gte"] = from_date
    if to_date:
        flt.setdefault("checked_in_at", {})["$lte"] = to_date
    rows = await db.visitors.find(flt, {"_id": 0, "photo_base64": 0}).sort("checked_in_at", -1).to_list(1000)
    return rows


@router.get("/today")
async def todays_visitors(user=Depends(get_current_user)):
    db = get_db()
    today = date.today().isoformat()
    flt = {
        "company_id": user.get("company_id"),
        "checked_in_at": {"$gte": today + "T00:00:00", "$lte": today + "T23:59:59"},
    }
    rows = await db.visitors.find(flt, {"_id": 0, "photo_base64": 0}).sort("checked_in_at", -1).to_list(500)
    counts = {"checked_in": 0, "checked_out": 0, "total": len(rows)}
    for r in rows:
        s = r.get("status", "checked_in")
        counts[s] = counts.get(s, 0) + 1
    return {"counts": counts, "rows": rows}


@router.get("/{vid}")
async def get_visitor(vid: str, user=Depends(get_current_user)):
    db = get_db()
    v = await db.visitors.find_one({"id": vid, "company_id": user.get("company_id")}, {"_id": 0})
    if not v:
        raise HTTPException(404, "Not found")
    return v


@router.post("")
async def create_visitor(body: VisitorCreate, user=Depends(get_current_user)):
    """Reception desk creates a visitor entry. Anyone in the company can do this
    (so a self-check-in kiosk can be wired with a service account too)."""
    db = get_db()
    cid = user.get("company_id")
    host = await db.employees.find_one({"id": body.host_employee_id, "company_id": cid}, {"_id": 0})
    if not host:
        raise HTTPException(404, "Host employee not found")

    if body.photo_base64 and body.photo_base64.startswith("data:"):
        body.photo_base64 = body.photo_base64.split(",", 1)[1] if "," in body.photo_base64 else body.photo_base64
    # Photo size cap (~500 KB raw)
    if body.photo_base64 and len(body.photo_base64) > 700_000:
        raise HTTPException(400, "Photo too large; please retake.")

    doc = body.model_dump()
    doc.update({
        "id": uid(), "company_id": cid,
        "host_employee_name": host.get("name"),
        "host_email": host.get("email"),
        "status": "checked_in",
        "checked_in_at": now_iso(),
        "checked_in_by": user["id"],
        "checked_in_by_name": user.get("name"),
        "checked_out_at": None,
        "checked_out_by": None,
        "created_at": now_iso(), "updated_at": now_iso(),
    })
    await db.visitors.insert_one(doc)
    doc.pop("_id", None)

    # Notify the host (in-app + email-friendly notification doc)
    if host.get("user_id"):
        await db.notifications.insert_one({
            "id": uid(), "company_id": cid,
            "recipient_user_id": host["user_id"],
            "title": f"Visitor checked in: {body.name}",
            "body": (f"{body.name}{(' from ' + body.company) if body.company else ''} "
                     f"is here to see you. Purpose: {body.purpose or '—'}"),
            "kind": "visitor.arrived", "event": "visitor.arrived",
            "link": f"/app/visitors/{doc['id']}",
            "read": False, "read_at": None,
            "created_at": now_iso(), "updated_at": now_iso(),
        })

    # Don't return photo blob in list-style response
    out = {k: v for k, v in doc.items() if k != "photo_base64"}
    out["has_photo"] = bool(doc.get("photo_base64"))
    return out


@router.post("/{vid}/checkout")
async def checkout_visitor(vid: str, body: VisitorCheckout, user=Depends(get_current_user)):
    db = get_db()
    v = await db.visitors.find_one({"id": vid, "company_id": user.get("company_id")}, {"_id": 0})
    if not v:
        raise HTTPException(404, "Not found")
    if v.get("status") == "checked_out":
        raise HTTPException(400, "Visitor already checked out")
    upd = {
        "status": "checked_out",
        "checked_out_at": now_iso(),
        "checked_out_by": user["id"],
        "checked_out_by_name": user.get("name"),
        "updated_at": now_iso(),
    }
    if body.notes:
        upd["exit_notes"] = body.notes
    await db.visitors.update_one({"id": vid}, {"$set": upd})
    return {**v, **upd}
