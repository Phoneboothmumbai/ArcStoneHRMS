"""Resource Booking — meeting rooms, vehicles, projectors, etc.

Anyone in the company can book any resource for a time slot. HR admins
(and resource managers, when set) own the resource definitions. Bookings
are first-come-first-served — overlap is rejected.

Endpoints
─────────
GET    /api/resources                       list resources
POST   /api/resources                       create  (HR admin)
PATCH  /api/resources/{rid}                 update  (HR admin)
DELETE /api/resources/{rid}                 delete  (HR admin)
GET    /api/resource-bookings               list bookings (filterable)
POST   /api/resource-bookings               create
DELETE /api/resource-bookings/{bid}         cancel (creator or admin)
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from db import get_db
from auth import get_current_user, require_roles
from models import uid, now_iso

ADMIN = ("super_admin", "company_admin", "country_head", "region_head")

# ─────────── Models ───────────
RESOURCE_TYPES = ("meeting_room", "vehicle", "equipment", "desk", "other")


class ResourceBase(BaseModel):
    name: str
    resource_type: str = Field(default="meeting_room")
    location: Optional[str] = None         # building, floor, branch label
    capacity: Optional[int] = None         # seats / weight / etc.
    description: Optional[str] = None
    color: Optional[str] = "#3b82f6"
    active: bool = True


class ResourceUpdate(BaseModel):
    name: Optional[str] = None
    resource_type: Optional[str] = None
    location: Optional[str] = None
    capacity: Optional[int] = None
    description: Optional[str] = None
    color: Optional[str] = None
    active: Optional[bool] = None


class BookingCreate(BaseModel):
    resource_id: str
    starts_at: datetime
    ends_at: datetime
    purpose: Optional[str] = None
    attendees: Optional[List[str]] = None  # employee_ids


# ─────────── Resources ───────────
resources_router = APIRouter(prefix="/api/resources", tags=["resources"])


@resources_router.get("")
async def list_resources(active: Optional[bool] = None, user=Depends(get_current_user)):
    db = get_db()
    flt = {"company_id": user.get("company_id")}
    if active is not None:
        flt["active"] = active
    return await db.resources.find(flt, {"_id": 0}).sort("name", 1).to_list(500)


@resources_router.post("")
async def create_resource(body: ResourceBase, user=Depends(require_roles(*ADMIN))):
    if body.resource_type not in RESOURCE_TYPES:
        raise HTTPException(400, f"resource_type must be one of {RESOURCE_TYPES}")
    db = get_db()
    doc = body.model_dump()
    doc.update({
        "id": uid(), "company_id": user.get("company_id"),
        "created_by": user["id"], "created_at": now_iso(), "updated_at": now_iso(),
    })
    await db.resources.insert_one(doc)
    doc.pop("_id", None)
    return doc


@resources_router.patch("/{rid}")
async def update_resource(rid: str, body: ResourceUpdate, user=Depends(require_roles(*ADMIN))):
    db = get_db()
    upd = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not upd:
        raise HTTPException(400, "No fields to update")
    if "resource_type" in upd and upd["resource_type"] not in RESOURCE_TYPES:
        raise HTTPException(400, f"resource_type must be one of {RESOURCE_TYPES}")
    upd["updated_at"] = now_iso()
    r = await db.resources.update_one(
        {"id": rid, "company_id": user.get("company_id")}, {"$set": upd},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Not found")
    return await db.resources.find_one({"id": rid}, {"_id": 0})


@resources_router.delete("/{rid}")
async def delete_resource(rid: str, user=Depends(require_roles(*ADMIN))):
    db = get_db()
    # Soft-delete: deactivate so historical bookings keep their resource ref.
    r = await db.resources.update_one(
        {"id": rid, "company_id": user.get("company_id")},
        {"$set": {"active": False, "updated_at": now_iso()}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}


# ─────────── Bookings ───────────
bookings_router = APIRouter(prefix="/api/resource-bookings", tags=["resource-bookings"])


@bookings_router.get("")
async def list_bookings(
    resource_id: Optional[str] = None,
    from_date: Optional[str] = Query(None, description="ISO8601 lower bound"),
    to_date: Optional[str] = Query(None, description="ISO8601 upper bound"),
    mine: bool = False,
    user=Depends(get_current_user),
):
    db = get_db()
    flt = {"company_id": user.get("company_id"), "status": {"$ne": "cancelled"}}
    if resource_id:
        flt["resource_id"] = resource_id
    if mine:
        flt["created_by"] = user["id"]
    rng = {}
    if from_date:
        rng["$gte"] = from_date
    if to_date:
        rng["$lte"] = to_date
    if rng:
        flt["starts_at"] = rng
    rows = await db.resource_bookings.find(flt, {"_id": 0}).sort("starts_at", 1).to_list(2000)
    return rows


@bookings_router.post("")
async def create_booking(body: BookingCreate, user=Depends(get_current_user)):
    if body.ends_at <= body.starts_at:
        raise HTTPException(400, "ends_at must be after starts_at")
    db = get_db()
    cid = user.get("company_id")
    res = await db.resources.find_one({"id": body.resource_id, "company_id": cid}, {"_id": 0})
    if not res or not res.get("active", True):
        raise HTTPException(404, "Resource not available")

    starts = body.starts_at.astimezone(timezone.utc).isoformat()
    ends = body.ends_at.astimezone(timezone.utc).isoformat()

    # Overlap check: any non-cancelled booking on the same resource where
    # existing.starts_at < new.ends AND existing.ends_at > new.starts.
    clash = await db.resource_bookings.find_one({
        "company_id": cid, "resource_id": body.resource_id,
        "status": {"$ne": "cancelled"},
        "starts_at": {"$lt": ends}, "ends_at": {"$gt": starts},
    }, {"_id": 0})
    if clash:
        raise HTTPException(409, f"Resource is already booked from {clash['starts_at']} to {clash['ends_at']}")

    doc = {
        "id": uid(), "company_id": cid,
        "resource_id": body.resource_id, "resource_name": res["name"],
        "resource_type": res.get("resource_type"),
        "starts_at": starts, "ends_at": ends,
        "purpose": body.purpose, "attendees": body.attendees or [],
        "status": "confirmed",
        "created_by": user["id"],
        "created_by_name": user.get("name"),
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.resource_bookings.insert_one(doc)
    doc.pop("_id", None)
    return doc


@bookings_router.delete("/{bid}")
async def cancel_booking(bid: str, user=Depends(get_current_user)):
    db = get_db()
    bk = await db.resource_bookings.find_one({"id": bid, "company_id": user.get("company_id")}, {"_id": 0})
    if not bk:
        raise HTTPException(404, "Not found")
    is_admin = user.get("role") in ADMIN
    if bk["created_by"] != user["id"] and not is_admin:
        raise HTTPException(403, "Only the creator or an admin can cancel this booking")
    await db.resource_bookings.update_one(
        {"id": bid}, {"$set": {"status": "cancelled", "cancelled_at": now_iso(), "updated_at": now_iso()}},
    )
    return {"ok": True}
