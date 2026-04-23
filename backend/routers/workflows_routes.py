"""Approval-workflow CRUD. Per-company, per-request-type configurable chains."""
from fastapi import APIRouter, Depends, HTTPException
from auth import require_roles, get_current_user
from db import get_db
from models import ApprovalWorkflowCreate, now_iso, uid

router = APIRouter(prefix="/api/workflows", tags=["workflows"])


@router.get("")
async def list_workflows(
    request_type: str = None,
    user=Depends(get_current_user),
):
    db = get_db()
    cid = user.get("company_id")
    if user["role"] == "super_admin" and not cid:
        flt = {}
    elif not cid:
        raise HTTPException(403, "No company scope")
    else:
        flt = {"company_id": cid}
    if request_type:
        flt["request_type"] = request_type
    rows = await db.approval_workflows.find(flt, {"_id": 0}).sort([("priority", -1), ("created_at", -1)]).to_list(500)
    return rows


@router.post("")
async def create_workflow(body: ApprovalWorkflowCreate, user=Depends(require_roles("super_admin", "company_admin"))):
    db = get_db()
    cid = user.get("company_id")
    if not cid:
        raise HTTPException(400, "Company scope required")
    if not body.steps:
        raise HTTPException(400, "At least one step is required")
    # Normalize steps (re-order field) and validate resolver-specific fields
    for idx, step in enumerate(sorted(body.steps, key=lambda s: s.order), start=1):
        step.order = idx
        if step.resolver == "role" and not step.role:
            raise HTTPException(400, f"Step {idx}: role is required when resolver='role'")
        if step.resolver == "user" and not step.user_id:
            raise HTTPException(400, f"Step {idx}: user_id is required when resolver='user'")
    doc = body.model_dump()
    doc["match_item_category"] = (doc.get("match_item_category") or "").strip().lower() or None
    doc.update({
        "id": uid(),
        "company_id": cid,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    })
    await db.approval_workflows.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/{wf_id}")
async def get_workflow(wf_id: str, user=Depends(get_current_user)):
    db = get_db()
    wf = await db.approval_workflows.find_one({"id": wf_id}, {"_id": 0})
    if not wf:
        raise HTTPException(404, "Not found")
    if user["role"] != "super_admin" and user.get("company_id") != wf["company_id"]:
        raise HTTPException(403, "Forbidden")
    return wf


@router.put("/{wf_id}")
async def update_workflow(wf_id: str, body: ApprovalWorkflowCreate, user=Depends(require_roles("super_admin", "company_admin"))):
    db = get_db()
    cid = user.get("company_id")
    existing = await db.approval_workflows.find_one({"id": wf_id, "company_id": cid}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Not found")
    if not body.steps:
        raise HTTPException(400, "At least one step is required")
    for idx, step in enumerate(sorted(body.steps, key=lambda s: s.order), start=1):
        step.order = idx
    updates = body.model_dump()
    updates["match_item_category"] = (updates.get("match_item_category") or "").strip().lower() or None
    updates["updated_at"] = now_iso()
    await db.approval_workflows.update_one({"id": wf_id}, {"$set": updates})
    merged = {**existing, **updates}
    return merged


@router.delete("/{wf_id}")
async def delete_workflow(wf_id: str, user=Depends(require_roles("super_admin", "company_admin"))):
    db = get_db()
    res = await db.approval_workflows.delete_one({"id": wf_id, "company_id": user.get("company_id")})
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}


@router.post("/{wf_id}/toggle")
async def toggle_workflow(wf_id: str, user=Depends(require_roles("super_admin", "company_admin"))):
    db = get_db()
    wf = await db.approval_workflows.find_one({"id": wf_id, "company_id": user.get("company_id")}, {"_id": 0})
    if not wf:
        raise HTTPException(404, "Not found")
    new_state = not wf.get("is_active", True)
    await db.approval_workflows.update_one({"id": wf_id}, {"$set": {"is_active": new_state, "updated_at": now_iso()}})
    return {"is_active": new_state}
