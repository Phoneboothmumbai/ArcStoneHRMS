"""Audit log viewer — company-admin-only read API.

Read-only. The write side lives in audit.py (log_event). Admins need this to
answer compliance questions ("who changed Rahul's salary on March 12?") and
for forensics after a security incident.
"""
from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from auth import get_current_user
from db import get_db

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("/events")
async def list_events(
    event: Optional[str] = Query(None, description="Exact event name, e.g. 'auth.login'"),
    event_prefix: Optional[str] = Query(None, description="Prefix match, e.g. 'auth.'"),
    resource_type: Optional[str] = Query(None),
    resource_id: Optional[str] = Query(None),
    actor_id: Optional[str] = Query(None),
    since: Optional[str] = Query(None, description="ISO timestamp"),
    limit: int = Query(100, le=500),
    user=Depends(get_current_user),
):
    # Audit log is sensitive — only company admins and above can read it.
    if user["role"] not in ("super_admin", "reseller", "company_admin"):
        raise HTTPException(403, "Audit log access is restricted to admins.")

    q: dict = {}
    # Strict tenant isolation: non-super users see ONLY their company's events.
    if user["role"] == "company_admin":
        q["company_id"] = user.get("company_id")
    elif user["role"] == "reseller":
        q["reseller_id"] = user.get("reseller_id")

    if event:            q["event"] = event
    if event_prefix:     q["event"] = {"$regex": f"^{event_prefix}"}
    if resource_type:    q["resource_type"] = resource_type
    if resource_id:      q["resource_id"] = resource_id
    if actor_id:         q["actor_id"] = actor_id
    if since:            q["ts"] = {"$gte": since}

    cursor = get_db().audit_events.find(q, {"_id": 0}).sort("ts", -1).limit(limit)
    rows = await cursor.to_list(limit)
    return {"count": len(rows), "rows": rows}
