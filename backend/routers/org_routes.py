"""Organization hierarchy: regions, countries, branches, departments + tree."""
from fastapi import APIRouter, Depends, HTTPException
from auth import get_current_user, require_roles
from db import get_db
from models import OrgNodeCreate, now_iso, uid

router = APIRouter(prefix="/api/org", tags=["org"])


def _scope(user) -> str:
    if user["role"] in ("super_admin",):
        return None  # can pass company_id in query
    cid = user.get("company_id")
    if not cid:
        raise HTTPException(403, "No company scope")
    return cid


@router.get("/tree")
async def org_tree(company_id: str = None, user=Depends(get_current_user)):
    db = get_db()
    cid = company_id or user.get("company_id")
    if not cid:
        raise HTTPException(400, "company_id required")
    if user["role"] not in ("super_admin",) and user.get("company_id") != cid:
        raise HTTPException(403, "Forbidden")
    regions = await db.regions.find({"company_id": cid}, {"_id": 0}).to_list(1000)
    countries = await db.countries.find({"company_id": cid}, {"_id": 0}).to_list(1000)
    branches = await db.branches.find({"company_id": cid}, {"_id": 0}).to_list(1000)
    departments = await db.departments.find({"company_id": cid}, {"_id": 0}).to_list(1000)
    employees = await db.employees.find({"company_id": cid}, {"_id": 0}).to_list(5000)

    # Build hierarchy
    for r in regions:
        r["countries"] = []
    for c in countries:
        c["branches"] = []
        rg = next((r for r in regions if r["id"] == c["region_id"]), None)
        if rg:
            rg["countries"].append(c)
    for b in branches:
        b["departments"] = []
        b["employees"] = [e for e in employees if e.get("branch_id") == b["id"]]
        co = next((c for c in countries if c["id"] == b["country_id"]), None)
        if co:
            co["branches"].append(b)
    for d in departments:
        br = next((b for b in branches if b["id"] == d.get("branch_id")), None)
        if br:
            br["departments"].append(d)
    return {"regions": regions, "stats": {
        "regions": len(regions), "countries": len(countries), "branches": len(branches),
        "departments": len(departments), "employees": len(employees),
    }}


@router.get("/regions")
async def list_regions(user=Depends(get_current_user)):
    db = get_db()
    cid = user.get("company_id")
    return await db.regions.find({"company_id": cid}, {"_id": 0}).to_list(500)


@router.post("/regions")
async def create_region(body: OrgNodeCreate, user=Depends(require_roles("super_admin", "company_admin"))):
    db = get_db()
    cid = user.get("company_id")
    if not cid:
        raise HTTPException(400, "company scope required")
    doc = {"id": uid(), "company_id": cid, "name": body.name, "head_user_id": None,
           "created_at": now_iso(), "updated_at": now_iso()}
    await db.regions.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/countries")
async def list_countries(user=Depends(get_current_user)):
    db = get_db()
    return await db.countries.find({"company_id": user.get("company_id")}, {"_id": 0}).to_list(1000)


@router.post("/countries")
async def create_country(body: OrgNodeCreate, user=Depends(require_roles("super_admin", "company_admin"))):
    db = get_db()
    if not body.parent_id:
        raise HTTPException(400, "parent_id (region_id) required")
    doc = {"id": uid(), "company_id": user.get("company_id"), "region_id": body.parent_id,
           "name": body.name, "iso_code": body.iso_code or "", "head_user_id": None,
           "created_at": now_iso(), "updated_at": now_iso()}
    await db.countries.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/branches")
async def list_branches(user=Depends(get_current_user)):
    db = get_db()
    return await db.branches.find({"company_id": user.get("company_id")}, {"_id": 0}).to_list(1000)


@router.post("/branches")
async def create_branch(body: OrgNodeCreate, user=Depends(require_roles("super_admin", "company_admin"))):
    db = get_db()
    if not body.parent_id:
        raise HTTPException(400, "parent_id (country_id) required")
    doc = {"id": uid(), "company_id": user.get("company_id"), "country_id": body.parent_id,
           "name": body.name, "city": body.city or "", "address": body.address,
           "manager_user_id": None, "created_at": now_iso(), "updated_at": now_iso()}
    await db.branches.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/departments")
async def list_departments(user=Depends(get_current_user)):
    db = get_db()
    return await db.departments.find({"company_id": user.get("company_id")}, {"_id": 0}).to_list(1000)


@router.post("/departments")
async def create_department(body: OrgNodeCreate, user=Depends(require_roles("super_admin", "company_admin"))):
    db = get_db()
    doc = {"id": uid(), "company_id": user.get("company_id"), "branch_id": body.parent_id,
           "name": body.name, "head_user_id": None,
           "created_at": now_iso(), "updated_at": now_iso()}
    await db.departments.insert_one(doc)
    doc.pop("_id", None)
    return doc
