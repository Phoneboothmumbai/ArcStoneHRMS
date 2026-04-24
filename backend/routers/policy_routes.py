"""Phase 1E — Company policies + settings."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from auth import get_current_user, require_roles
from db import get_db
from models import now_iso, uid
from models_policy import (
    CompanyPolicy, CompanyPolicyCreate, CompanySettings, CompanySettingsUpdate,
    PolicyAcknowledgement,
)

policies_router = APIRouter(prefix="/api/policies", tags=["policies"])
settings_router = APIRouter(prefix="/api/company-settings", tags=["company-settings"])

ADMIN = ("super_admin", "company_admin")


# ---------------------------------------------------------------------------
# Policies
# ---------------------------------------------------------------------------
@policies_router.get("")
async def list_policies(
    status: Optional[str] = None,
    user=Depends(get_current_user),
):
    db = get_db()
    flt = {"company_id": user.get("company_id")}
    if user["role"] not in ("super_admin", "company_admin"):
        flt["status"] = "published"
    elif status:
        flt["status"] = status
    rows = await db.company_policies.find(flt, {"_id": 0}).sort("effective_from", -1).to_list(500)
    # Hide ack list from employees (PII)
    if user["role"] not in ("super_admin", "company_admin"):
        for r in rows:
            r.pop("acknowledgements", None)
    return rows


@policies_router.get("/{slug}")
async def get_policy(slug: str, user=Depends(get_current_user)):
    db = get_db()
    doc = await db.company_policies.find_one(
        {"company_id": user.get("company_id"), "slug": slug}, {"_id": 0},
    )
    if not doc:
        raise HTTPException(404, "Not found")
    if doc["status"] != "published" and user["role"] not in ADMIN:
        raise HTTPException(403, "Not published")
    if user["role"] not in ADMIN:
        doc.pop("acknowledgements", None)
    return doc


@policies_router.post("")
async def create_policy(body: CompanyPolicyCreate, user=Depends(require_roles(*ADMIN))):
    db = get_db()
    cid = user.get("company_id")
    if await db.company_policies.find_one({"company_id": cid, "slug": body.slug}):
        raise HTTPException(400, "Policy with this slug already exists")
    doc = CompanyPolicy(company_id=cid, **body.model_dump()).model_dump()
    await db.company_policies.insert_one(doc)
    doc.pop("_id", None)
    return doc


@policies_router.put("/{pid}")
async def update_policy(pid: str, body: CompanyPolicyCreate, user=Depends(require_roles(*ADMIN))):
    db = get_db()
    cid = user.get("company_id")
    upd = {**body.model_dump(), "updated_at": now_iso()}
    r = await db.company_policies.update_one({"id": pid, "company_id": cid}, {"$set": upd})
    if r.matched_count == 0:
        raise HTTPException(404, "Not found")
    return await db.company_policies.find_one({"id": pid}, {"_id": 0})


@policies_router.post("/{pid}/publish")
async def publish_policy(pid: str, user=Depends(require_roles(*ADMIN))):
    db = get_db()
    r = await db.company_policies.update_one(
        {"id": pid, "company_id": user.get("company_id")},
        {"$set": {"status": "published", "published_at": now_iso(), "updated_at": now_iso()}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}


@policies_router.post("/{pid}/archive")
async def archive_policy(pid: str, user=Depends(require_roles(*ADMIN))):
    db = get_db()
    await db.company_policies.update_one(
        {"id": pid, "company_id": user.get("company_id")},
        {"$set": {"status": "archived", "archived_at": now_iso(), "updated_at": now_iso()}},
    )
    return {"ok": True}


@policies_router.post("/{slug}/acknowledge")
async def acknowledge_policy(slug: str, request: Request, user=Depends(get_current_user)):
    db = get_db()
    cid = user.get("company_id")
    if not user.get("employee_id"):
        raise HTTPException(400, "Only employees can acknowledge")
    pol = await db.company_policies.find_one({"company_id": cid, "slug": slug, "status": "published"}, {"_id": 0})
    if not pol:
        raise HTTPException(404, "Not found or not published")
    # Deduplicate
    if any(a.get("employee_id") == user["employee_id"] for a in pol.get("acknowledgements", [])):
        return {"ok": True, "already": True}
    ip = request.client.host if request.client else None
    ack = PolicyAcknowledgement(
        employee_id=user["employee_id"], employee_name=user["name"],
        acknowledged_at=now_iso(), ip_address=ip,
    ).model_dump()
    await db.company_policies.update_one(
        {"id": pol["id"]},
        {"$push": {"acknowledgements": ack}, "$set": {"updated_at": now_iso()}},
    )
    return {"ok": True}


@policies_router.get("/me/pending-acks")
async def my_pending_acks(user=Depends(get_current_user)):
    """List published policies that require ack and I haven't yet."""
    db = get_db()
    cid = user.get("company_id")
    if not user.get("employee_id"):
        return []
    rows = await db.company_policies.find(
        {"company_id": cid, "status": "published", "requires_acknowledgement": True}, {"_id": 0},
    ).to_list(500)
    pending = []
    for p in rows:
        if not any(a.get("employee_id") == user["employee_id"] for a in p.get("acknowledgements", [])):
            p.pop("acknowledgements", None)
            pending.append(p)
    return pending


# ---------------------------------------------------------------------------
# Company settings (single doc per tenant)
# ---------------------------------------------------------------------------
async def _get_or_create_settings(db, cid: str) -> dict:
    doc = await db.company_settings.find_one({"company_id": cid}, {"_id": 0})
    if doc:
        return doc
    doc = CompanySettings(company_id=cid).model_dump()
    await db.company_settings.insert_one(doc)
    doc.pop("_id", None)
    return doc


@settings_router.get("")
async def get_settings(user=Depends(get_current_user)):
    db = get_db()
    cid = user.get("company_id")
    if not cid:
        raise HTTPException(400, "No tenant scope")
    doc = await _get_or_create_settings(db, cid)
    # Employees get a minimal view (branding + currency + timezone only)
    if user["role"] not in ("super_admin", "company_admin", "country_head", "region_head"):
        return {
            "fiscal_year_start_month": doc["fiscal_year_start_month"],
            "currency": doc["currency"], "timezone": doc["timezone"],
            "legal_entity_name": doc.get("legal_entity_name"),
            "logo_base64": doc.get("logo_base64"),
        }
    return doc


@settings_router.patch("")
async def update_settings(body: CompanySettingsUpdate, user=Depends(require_roles(*ADMIN))):
    db = get_db()
    cid = user.get("company_id")
    await _get_or_create_settings(db, cid)
    upd = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not upd:
        raise HTTPException(400, "No fields to update")
    upd["updated_at"] = now_iso()
    await db.company_settings.update_one({"company_id": cid}, {"$set": upd})
    return await db.company_settings.find_one({"company_id": cid}, {"_id": 0})


@settings_router.get("/fiscal-year")
async def current_fiscal_year(user=Depends(get_current_user)):
    """Helper returning the current FY string based on company settings (e.g., '2025-2026')."""
    db = get_db()
    cid = user.get("company_id")
    doc = await _get_or_create_settings(db, cid)
    t = datetime.utcnow()
    start_m = doc.get("fiscal_year_start_month", 4)
    y = t.year if t.month >= start_m else t.year - 1
    return {"financial_year": f"{y}-{y+1}", "start_month": start_m}
