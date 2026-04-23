"""Company (tenant) management."""
from fastapi import APIRouter, Depends, HTTPException
from auth import require_roles, hash_password
from db import get_db
from models import CompanyCreate, now_iso, uid

router = APIRouter(prefix="/api/companies", tags=["companies"])


@router.get("")
async def list_companies(user=Depends(require_roles("super_admin", "reseller"))):
    db = get_db()
    flt = {}
    if user["role"] == "reseller":
        flt = {"reseller_id": user.get("reseller_id")}
    rows = await db.companies.find(flt, {"_id": 0}).to_list(1000)
    return rows


@router.post("")
async def create_company(body: CompanyCreate, user=Depends(require_roles("super_admin", "reseller"))):
    db = get_db()
    reseller_id = body.reseller_id
    if user["role"] == "reseller":
        reseller_id = user.get("reseller_id")
    doc = {
        "id": uid(),
        "name": body.name,
        "reseller_id": reseller_id,
        "plan": body.plan,
        "status": "active",
        "industry": body.industry,
        "logo_url": None,
        "employee_count": 0,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.companies.insert_one(doc)
    admin_email = body.admin_email.lower()
    if await db.users.find_one({"email": admin_email}):
        raise HTTPException(400, "Admin email already registered")
    await db.users.insert_one({
        "id": uid(),
        "email": admin_email,
        "password_hash": hash_password(body.admin_password),
        "name": body.admin_name,
        "role": "company_admin",
        "company_id": doc["id"],
        "reseller_id": reseller_id,
        "employee_id": None,
        "is_active": True,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    })
    doc.pop("_id", None)
    return doc


@router.get("/{company_id}")
async def get_company(company_id: str, user=Depends(require_roles("super_admin", "reseller", "company_admin"))):
    db = get_db()
    if user["role"] == "reseller" and user.get("reseller_id") is None:
        raise HTTPException(403, "Forbidden")
    if user["role"] == "company_admin" and user.get("company_id") != company_id:
        raise HTTPException(403, "Forbidden")
    c = await db.companies.find_one({"id": company_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Not found")
    if user["role"] == "reseller" and c.get("reseller_id") != user.get("reseller_id"):
        raise HTTPException(403, "Forbidden")
    return c
