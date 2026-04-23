"""Reseller management (super_admin scope)."""
from fastapi import APIRouter, Depends, HTTPException
from auth import require_roles, hash_password
from db import get_db
from models import ResellerCreate, now_iso, uid

router = APIRouter(prefix="/api/resellers", tags=["resellers"])


@router.get("")
async def list_resellers(user=Depends(require_roles("super_admin"))):
    db = get_db()
    rows = await db.resellers.find({}, {"_id": 0}).to_list(1000)
    for r in rows:
        r["company_count"] = await db.companies.count_documents({"reseller_id": r["id"]})
    return rows


@router.post("")
async def create_reseller(body: ResellerCreate, user=Depends(require_roles("super_admin"))):
    db = get_db()
    if await db.resellers.find_one({"contact_email": body.contact_email}):
        raise HTTPException(400, "Reseller email already registered")
    doc = {
        "id": uid(),
        "name": body.name,
        "company_name": body.company_name,
        "contact_email": body.contact_email.lower(),
        "phone": body.phone,
        "commission_rate": body.commission_rate,
        "status": "active",
        "white_label": {},
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.resellers.insert_one(doc)
    # create reseller admin user
    if await db.users.find_one({"email": doc["contact_email"]}):
        raise HTTPException(400, "User with this email exists")
    await db.users.insert_one({
        "id": uid(),
        "email": doc["contact_email"],
        "password_hash": hash_password(body.admin_password),
        "name": body.name,
        "role": "reseller",
        "company_id": None,
        "reseller_id": doc["id"],
        "employee_id": None,
        "is_active": True,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    })
    doc.pop("_id", None)
    return doc


@router.get("/{reseller_id}")
async def get_reseller(reseller_id: str, user=Depends(require_roles("super_admin", "reseller"))):
    db = get_db()
    if user["role"] == "reseller" and user.get("reseller_id") != reseller_id:
        raise HTTPException(403, "Forbidden")
    r = await db.resellers.find_one({"id": reseller_id}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Reseller not found")
    r["company_count"] = await db.companies.count_documents({"reseller_id": reseller_id})
    # commission summary (based on company count x plan baseline)
    plan_pricing = {"starter": 99, "growth": 299, "enterprise": 999}
    companies = await db.companies.find({"reseller_id": reseller_id}, {"_id": 0}).to_list(1000)
    mrr = sum(plan_pricing.get(c.get("plan", "growth"), 299) for c in companies)
    r["mrr"] = mrr
    r["monthly_commission"] = round(mrr * r.get("commission_rate", 0), 2)
    return r
