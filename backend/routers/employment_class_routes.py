"""Employment-class entitlements API.

- Anyone logged-in can read `/permissions` for their own class (used by frontend
  to hide feature cards/nav items not available to off-roll / interns).
- Only company_admin / super_admin can view and edit the full per-class matrix.
"""
from fastapi import APIRouter, Depends, HTTPException
from auth import get_current_user, require_roles
from db import get_db
from models import now_iso, uid
from employment_class_policy import (
    FEATURES, CLASSES, CLASS_KEYS, FEATURE_KEYS,
    default_matrix, get_effective_matrix, get_permissions_for, _normalize,
)

router = APIRouter(prefix="/api/employment-class", tags=["employment-class"])
admin = APIRouter(prefix="/api/admin/employment-class", tags=["employment-class-admin"])


@router.get("/catalog")
async def catalog(user=Depends(get_current_user)):
    """Feature keys + class metadata for UI rendering."""
    return {"classes": CLASSES, "features": FEATURES}


@router.get("/permissions")
async def my_permissions(user=Depends(get_current_user)):
    """Current user's effective feature permissions (derived from their employee record).

    If the user has no linked employee record (admins etc.), returns on_roll defaults.
    """
    db = get_db()
    cid = user.get("company_id")
    emp_class = "on_roll"
    if user.get("employee_id"):
        emp = await db.employees.find_one({"id": user["employee_id"]}, {"_id": 0, "employment_class": 1})
        if emp and emp.get("employment_class") in CLASS_KEYS:
            emp_class = emp["employment_class"]
    if not cid:
        return {"employment_class": emp_class, "permissions": {k: True for k in FEATURE_KEYS}}
    perms = await get_permissions_for(db, cid, emp_class)
    return {"employment_class": emp_class, "permissions": perms}


@admin.get("/config")
async def get_config(user=Depends(require_roles("super_admin", "company_admin"))):
    db = get_db()
    cid = user.get("company_id")
    if not cid:
        raise HTTPException(400, "Company scope required")
    matrix = await get_effective_matrix(db, cid)
    doc = await db.employment_class_permissions.find_one({"company_id": cid}, {"_id": 0})
    return {
        "company_id": cid,
        "matrix": matrix,
        "is_custom": bool(doc),
        "updated_at": (doc or {}).get("updated_at"),
        "updated_by": (doc or {}).get("updated_by_name"),
    }


@admin.put("/config")
async def put_config(body: dict, user=Depends(require_roles("super_admin", "company_admin"))):
    db = get_db()
    cid = user.get("company_id")
    if not cid:
        raise HTTPException(400, "Company scope required")
    matrix = body.get("matrix") or {}
    if not isinstance(matrix, dict):
        raise HTTPException(400, "matrix must be an object")
    normalized = _normalize(matrix)
    existing = await db.employment_class_permissions.find_one({"company_id": cid})
    doc = {
        "company_id": cid,
        "matrix": normalized,
        "updated_at": now_iso(),
        "updated_by": user["id"],
        "updated_by_name": user.get("name"),
    }
    if existing:
        await db.employment_class_permissions.update_one({"company_id": cid}, {"$set": doc})
    else:
        doc["id"] = uid()
        doc["created_at"] = now_iso()
        await db.employment_class_permissions.insert_one(doc)
    return {"ok": True, "matrix": normalized}


@admin.post("/reset")
async def reset_to_defaults(user=Depends(require_roles("super_admin", "company_admin"))):
    db = get_db()
    cid = user.get("company_id")
    if not cid:
        raise HTTPException(400, "Company scope required")
    await db.employment_class_permissions.delete_one({"company_id": cid})
    return {"ok": True, "matrix": default_matrix()}


@admin.get("/stats")
async def class_stats(user=Depends(require_roles("super_admin", "company_admin",
                                                  "country_head", "region_head", "branch_manager"))):
    """Head-count per employment class for the current company."""
    db = get_db()
    cid = user.get("company_id")
    if not cid:
        raise HTTPException(400, "Company scope required")
    pipeline = [
        {"$match": {"company_id": cid, "status": {"$ne": "terminated"}}},
        {"$group": {"_id": "$employment_class", "count": {"$sum": 1}}},
    ]
    rows = await db.employees.aggregate(pipeline).to_list(20)
    counts = {c: 0 for c in CLASS_KEYS}
    for r in rows:
        k = r.get("_id") or "on_roll"
        if k in counts:
            counts[k] += r["count"]
        else:
            counts["on_roll"] += r["count"]
    return {"counts": counts, "total": sum(counts.values())}
