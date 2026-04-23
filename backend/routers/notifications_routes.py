"""Notifications API — inbox, mark read, preferences."""
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from auth import get_current_user
from db import get_db
from models import now_iso, uid

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


class PrefUpdate(BaseModel):
    channels: Optional[dict] = None
    mute_events: Optional[List[str]] = None
    digest_frequency: Optional[str] = None


@router.get("")
async def list_mine(user=Depends(get_current_user), unread_only: bool = Query(False), limit: int = 50):
    db = get_db()
    flt = {"recipient_user_id": user["id"]}
    if unread_only:
        flt["read"] = False
    rows = await db.notifications.find(flt, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return rows


@router.get("/unread_count")
async def unread_count(user=Depends(get_current_user)):
    db = get_db()
    n = await db.notifications.count_documents({"recipient_user_id": user["id"], "read": False})
    return {"count": n}


@router.post("/{nid}/read")
async def mark_read(nid: str, user=Depends(get_current_user)):
    db = get_db()
    await db.notifications.update_one(
        {"id": nid, "recipient_user_id": user["id"]},
        {"$set": {"read": True, "read_at": now_iso()}},
    )
    return {"ok": True}


@router.post("/read_all")
async def mark_all_read(user=Depends(get_current_user)):
    db = get_db()
    await db.notifications.update_many(
        {"recipient_user_id": user["id"], "read": False},
        {"$set": {"read": True, "read_at": now_iso()}},
    )
    return {"ok": True}


@router.get("/preferences")
async def my_prefs(user=Depends(get_current_user)):
    db = get_db()
    pref = await db.notification_prefs.find_one({"user_id": user["id"]}, {"_id": 0})
    if not pref:
        pref = {
            "id": uid(), "user_id": user["id"],
            "channels": {"in_app": True, "email": True, "push": False},
            "mute_events": [], "digest_frequency": "realtime",
            "created_at": now_iso(), "updated_at": now_iso(),
        }
        await db.notification_prefs.insert_one(pref)
        pref.pop("_id", None)
    return pref


@router.put("/preferences")
async def update_prefs(body: PrefUpdate, user=Depends(get_current_user)):
    db = get_db()
    patch = body.model_dump(exclude_none=True)
    patch["updated_at"] = now_iso()
    await db.notification_prefs.update_one(
        {"user_id": user["id"]}, {"$set": patch}, upsert=True,
    )
    return await db.notification_prefs.find_one({"user_id": user["id"]}, {"_id": 0})
