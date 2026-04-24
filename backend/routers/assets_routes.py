"""Phase 1G — Asset management CRUD + assign / return flow."""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from auth import get_current_user, require_roles
from db import get_db
from models import now_iso
from models_assets import (
    Asset, AssetAssignment, AssetAssignRequest, AssetCreate, AssetReturnRequest,
)

assets_router = APIRouter(prefix="/api/assets", tags=["assets"])
assignments_router = APIRouter(prefix="/api/asset-assignments", tags=["asset-assignments"])

ADMIN_IT = ("super_admin", "company_admin", "country_head", "region_head")


# ---------------------------------------------------------------------------
# Assets
# ---------------------------------------------------------------------------
def _book_value(cost: float, purchase_date: str, life_years: int, method: str) -> float:
    if not purchase_date or not cost or method == "none":
        return cost or 0.0
    try:
        pd_date = datetime.fromisoformat(purchase_date[:10]).date()
        years = (date.today() - pd_date).days / 365.25
    except Exception:
        return cost
    if method == "slm":
        yearly = cost / max(life_years, 1)
        return round(max(cost - yearly * years, 0), 2)
    # WDV
    rate = 1 / max(life_years, 1)
    val = cost
    for _ in range(int(years)):
        val *= (1 - rate)
    return round(max(val, 0), 2)


@assets_router.get("")
async def list_assets(
    status: Optional[str] = None,
    category: Optional[str] = None,
    assigned_to: Optional[str] = None,
    user=Depends(require_roles(*ADMIN_IT)),
):
    db = get_db()
    flt = {"company_id": user.get("company_id")}
    if status:
        flt["status"] = status
    if category:
        flt["category"] = category
    if assigned_to:
        flt["assigned_to_employee_id"] = assigned_to
    rows = await db.assets.find(flt, {"_id": 0}).sort("asset_tag", 1).to_list(5000)
    for a in rows:
        a["current_book_value"] = _book_value(
            a.get("purchase_cost", 0), a.get("purchase_date"), a.get("useful_life_years", 4),
            a.get("depreciation_method", "slm"),
        )
    return rows


@assets_router.get("/me")
async def my_assets(user=Depends(get_current_user)):
    db = get_db()
    if not user.get("employee_id"):
        return []
    rows = await db.assets.find(
        {"company_id": user.get("company_id"), "assigned_to_employee_id": user["employee_id"]},
        {"_id": 0, "purchase_cost": 0},   # hide financials from employee
    ).to_list(100)
    return rows


@assets_router.post("")
async def create_asset(body: AssetCreate, user=Depends(require_roles(*ADMIN_IT))):
    db = get_db()
    cid = user.get("company_id")
    if await db.assets.find_one({"company_id": cid, "asset_tag": body.asset_tag}):
        raise HTTPException(400, "Asset with this tag already exists")
    doc = Asset(company_id=cid, **body.model_dump()).model_dump()
    await db.assets.insert_one(doc)
    doc.pop("_id", None)
    return doc


@assets_router.put("/{aid}")
async def update_asset(aid: str, body: AssetCreate, user=Depends(require_roles(*ADMIN_IT))):
    db = get_db()
    upd = {**body.model_dump(), "updated_at": now_iso()}
    r = await db.assets.update_one({"id": aid, "company_id": user.get("company_id")}, {"$set": upd})
    if r.matched_count == 0:
        raise HTTPException(404, "Not found")
    return await db.assets.find_one({"id": aid}, {"_id": 0})


@assets_router.delete("/{aid}")
async def retire_asset(aid: str, user=Depends(require_roles(*ADMIN_IT))):
    db = get_db()
    await db.assets.update_one(
        {"id": aid, "company_id": user.get("company_id")},
        {"$set": {"status": "retired", "updated_at": now_iso()}},
    )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Assignment flow
# ---------------------------------------------------------------------------
@assignments_router.post("/assign")
async def assign_asset(body: AssetAssignRequest, user=Depends(require_roles(*ADMIN_IT))):
    db = get_db()
    cid = user.get("company_id")
    asset = await db.assets.find_one({"id": body.asset_id, "company_id": cid}, {"_id": 0})
    if not asset:
        raise HTTPException(404, "Asset not found")
    if asset["status"] not in ("available", "maintenance"):
        raise HTTPException(400, f"Asset is {asset['status']}; cannot assign")
    emp = await db.employees.find_one({"id": body.employee_id, "company_id": cid}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employee not found")

    assigned_on = body.assigned_on or date.today().isoformat()
    assignment = AssetAssignment(
        company_id=cid, asset_id=body.asset_id, asset_tag=asset["asset_tag"],
        employee_id=body.employee_id, employee_name=emp["name"],
        assigned_on=assigned_on, assigned_by_user_id=user["id"],
    ).model_dump()
    await db.asset_assignments.insert_one(assignment)

    await db.assets.update_one(
        {"id": body.asset_id},
        {"$set": {
            "status": "assigned",
            "assigned_to_employee_id": body.employee_id,
            "assigned_to_employee_name": emp["name"],
            "assigned_on": assigned_on, "updated_at": now_iso(),
        }},
    )
    assignment.pop("_id", None)
    return assignment


@assignments_router.post("/{aid}/return")
async def return_asset(aid: str, body: AssetReturnRequest, user=Depends(require_roles(*ADMIN_IT))):
    db = get_db()
    cid = user.get("company_id")
    asmt = await db.asset_assignments.find_one(
        {"id": aid, "company_id": cid, "is_current": True}, {"_id": 0},
    )
    if not asmt:
        raise HTTPException(404, "Active assignment not found")
    return_date = body.return_date or date.today().isoformat()
    await db.asset_assignments.update_one(
        {"id": aid},
        {"$set": {
            "returned_on": return_date, "return_condition": body.condition,
            "return_notes": body.notes, "is_current": False, "updated_at": now_iso(),
        }},
    )
    asset_status = "maintenance" if body.condition in ("damaged",) else (
        "lost" if body.condition == "lost" else "available"
    )
    await db.assets.update_one(
        {"id": asmt["asset_id"]},
        {"$set": {
            "status": asset_status, "assigned_to_employee_id": None,
            "assigned_to_employee_name": None, "assigned_on": None,
            "updated_at": now_iso(),
        }},
    )
    return {"ok": True, "new_asset_status": asset_status}


@assignments_router.get("")
async def list_assignments(
    employee_id: Optional[str] = None,
    current_only: bool = False,
    user=Depends(require_roles(*ADMIN_IT)),
):
    db = get_db()
    flt = {"company_id": user.get("company_id")}
    if employee_id:
        flt["employee_id"] = employee_id
    if current_only:
        flt["is_current"] = True
    rows = await db.asset_assignments.find(flt, {"_id": 0}).sort("assigned_on", -1).to_list(5000)
    return rows


@assignments_router.post("/{aid}/acknowledge")
async def acknowledge_assignment(aid: str, user=Depends(get_current_user)):
    """Employee acknowledges receipt of the asset."""
    db = get_db()
    if not user.get("employee_id"):
        raise HTTPException(403, "Only employees can acknowledge")
    r = await db.asset_assignments.update_one(
        {"id": aid, "company_id": user.get("company_id"),
         "employee_id": user["employee_id"], "is_current": True},
        {"$set": {"acknowledged_at": now_iso(), "updated_at": now_iso()}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}
