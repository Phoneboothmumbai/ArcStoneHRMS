"""Phase 4 — Joining Kit + Procurement Categories routes."""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from auth import require_roles, get_current_user
from db import get_db
from models import now_iso, uid
from models_joining_kit import (
    PROCUREMENT_CATEGORIES, KitTemplateCreate, KitIssuanceCreate,
)

cat_router = APIRouter(prefix="/api/procurement", tags=["procurement-categories"])
kit_tpl_router = APIRouter(prefix="/api/joining-kit/templates", tags=["joining-kit"])
kit_iss_router = APIRouter(prefix="/api/joining-kit/issuances", tags=["joining-kit"])

MGR = ("super_admin", "company_admin", "country_head", "region_head", "branch_manager")


@cat_router.get("/category-catalog")
async def category_catalog(user=Depends(get_current_user)):
    """Curated taxonomy of procurement categories + sub-items. Used by RFQ create form."""
    return {"categories": PROCUREMENT_CATEGORIES}


# ---------- Templates ----------
@kit_tpl_router.get("")
async def list_templates(user=Depends(get_current_user)):
    db = get_db()
    cid = user.get("company_id")
    if not cid and user["role"] != "super_admin":
        raise HTTPException(403, "No company scope")
    flt = {} if user["role"] == "super_admin" else {"company_id": cid}
    rows = await db.kit_templates.find(flt, {"_id": 0}).sort("created_at", -1).to_list(200)
    return rows


@kit_tpl_router.post("")
async def create_template(body: KitTemplateCreate, user=Depends(require_roles(*MGR))):
    db = get_db()
    cid = user.get("company_id")
    if not cid:
        raise HTTPException(400, "Company scope required")
    doc = body.model_dump()
    doc.update({
        "id": uid(),
        "company_id": cid,
        "active": True,
        "created_by": user["id"], "created_by_name": user.get("name"),
        "created_at": now_iso(), "updated_at": now_iso(),
    })
    if doc.get("is_default"):
        # Only one default per scope (department_id, branch_id, employment_class)
        await db.kit_templates.update_many(
            {"company_id": cid, "is_default": True,
             "department_id": doc.get("department_id"),
             "branch_id": doc.get("branch_id"),
             "employment_class": doc.get("employment_class")},
            {"$set": {"is_default": False}},
        )
    await db.kit_templates.insert_one(doc)
    doc.pop("_id", None)
    return doc


@kit_tpl_router.put("/{tpl_id}")
async def update_template(tpl_id: str, body: dict, user=Depends(require_roles(*MGR))):
    db = get_db()
    cid = user.get("company_id")
    allowed = {"name", "description", "department_id", "branch_id",
               "employment_class", "items", "is_default", "active"}
    patch = {k: v for k, v in body.items() if k in allowed}
    if not patch:
        raise HTTPException(400, "Nothing to update")
    patch["updated_at"] = now_iso()
    res = await db.kit_templates.update_one(
        {"id": tpl_id, "company_id": cid}, {"$set": patch},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Not found")
    out = await db.kit_templates.find_one({"id": tpl_id}, {"_id": 0})
    return out


@kit_tpl_router.delete("/{tpl_id}")
async def delete_template(tpl_id: str, user=Depends(require_roles(*MGR))):
    db = get_db()
    cid = user.get("company_id")
    res = await db.kit_templates.delete_one({"id": tpl_id, "company_id": cid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}


# ---------- Issuances ----------
@kit_iss_router.get("")
async def list_issuances(employee_id: str = None, status: str = None, user=Depends(get_current_user)):
    db = get_db()
    cid = user.get("company_id")
    flt = {} if user["role"] == "super_admin" else {"company_id": cid}
    if employee_id:
        flt["employee_id"] = employee_id
    if status:
        flt["status"] = status
    rows = await db.kit_issuances.find(flt, {"_id": 0}).sort("created_at", -1).to_list(500)
    return rows


@kit_iss_router.post("")
async def create_issuance(body: KitIssuanceCreate, user=Depends(require_roles(*MGR))):
    db = get_db()
    cid = user.get("company_id")
    emp = await db.employees.find_one({"id": body.employee_id, "company_id": cid}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employee not found")
    items = list(body.items)
    template_name = None
    if body.template_id and not items:
        tpl = await db.kit_templates.find_one({"id": body.template_id, "company_id": cid}, {"_id": 0})
        if not tpl:
            raise HTTPException(404, "Template not found")
        template_name = tpl["name"]
        items = [
            {**ti, "issued": False, "issued_at": None, "returned": False,
             "returned_at": None, "status": "pending", "serial_number": None, "notes": None}
            for ti in tpl.get("items", [])
        ]
    doc = {
        "id": uid(),
        "company_id": cid,
        "employee_id": body.employee_id,
        "employee_name": emp["name"],
        "employee_code": emp.get("employee_code"),
        "branch_id": emp.get("branch_id"),
        "template_id": body.template_id,
        "template_name": template_name,
        "items": [it if isinstance(it, dict) else it.model_dump() for it in items],
        "status": "draft",
        "issued_at": None, "issued_by": None, "issued_by_name": None,
        "employee_signature_at": None,
        "notes": body.notes,
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.kit_issuances.insert_one(doc)
    doc.pop("_id", None)
    return doc


@kit_iss_router.post("/{iss_id}/issue")
async def mark_issued(iss_id: str, body: dict, user=Depends(require_roles(*MGR))):
    """Mark all items as issued, set timestamp + issuer."""
    db = get_db()
    cid = user.get("company_id")
    iss = await db.kit_issuances.find_one({"id": iss_id, "company_id": cid}, {"_id": 0})
    if not iss:
        raise HTTPException(404, "Not found")
    items = iss["items"]
    serials = (body or {}).get("serials", {}) if body else {}
    now = now_iso()
    for it in items:
        if not it.get("issued"):
            it["issued"] = True
            it["issued_at"] = now
            it["status"] = "issued"
            if it["sku"] in serials:
                it["serial_number"] = serials[it["sku"]]
    await db.kit_issuances.update_one(
        {"id": iss_id},
        {"$set": {"items": items, "status": "issued",
                  "issued_at": now, "issued_by": user["id"],
                  "issued_by_name": user.get("name"), "updated_at": now}},
    )
    return await db.kit_issuances.find_one({"id": iss_id}, {"_id": 0})


@kit_iss_router.post("/{iss_id}/sign")
async def employee_sign(iss_id: str, user=Depends(get_current_user)):
    """Employee accepts the kit (records e-signature timestamp)."""
    db = get_db()
    iss = await db.kit_issuances.find_one({"id": iss_id}, {"_id": 0})
    if not iss:
        raise HTTPException(404, "Not found")
    if user.get("employee_id") != iss["employee_id"] and user["role"] not in MGR:
        raise HTTPException(403, "Only the recipient can sign")
    await db.kit_issuances.update_one(
        {"id": iss_id},
        {"$set": {"employee_signature_at": now_iso(), "status": "completed",
                  "updated_at": now_iso()}},
    )
    return await db.kit_issuances.find_one({"id": iss_id}, {"_id": 0})


@kit_iss_router.post("/{iss_id}/return")
async def return_items(iss_id: str, body: dict, user=Depends(require_roles(*MGR))):
    """Mark specific returnable items as returned. body = { skus: [<sku>, ...] }"""
    db = get_db()
    cid = user.get("company_id")
    iss = await db.kit_issuances.find_one({"id": iss_id, "company_id": cid}, {"_id": 0})
    if not iss:
        raise HTTPException(404, "Not found")
    skus = set((body or {}).get("skus", []))
    if not skus:
        raise HTTPException(400, "skus is required")
    items = iss["items"]
    now = now_iso()
    for it in items:
        if it["sku"] in skus and it.get("is_returnable"):
            it["returned"] = True
            it["returned_at"] = now
            it["status"] = "returned"
    # Status: if all returnable items returned → returned, else partial
    returnable = [it for it in items if it.get("is_returnable")]
    all_returned = returnable and all(it.get("returned") for it in returnable)
    new_status = "returned" if all_returned else "partial"
    await db.kit_issuances.update_one(
        {"id": iss_id},
        {"$set": {"items": items, "status": new_status, "updated_at": now}},
    )
    return await db.kit_issuances.find_one({"id": iss_id}, {"_id": 0})
