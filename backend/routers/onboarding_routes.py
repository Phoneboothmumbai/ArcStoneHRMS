"""Onboarding: templates + instance management. Gated behind 'onboarding' module."""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query

from auth import require_roles
from db import get_db
from models import now_iso
from models_profile import (
    Onboarding, OnboardingStart, OnboardingTaskState, OnboardingTaskUpdate,
    OnboardingTemplate, OnboardingTemplateCreate,
)
from tenant import requires_module

router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])


# ---------- Templates ----------
@router.get("/templates")
async def list_templates(user=Depends(requires_module("onboarding"))):
    db = get_db()
    cid = user.get("company_id")
    rows = await db.onboarding_templates.find(
        {"company_id": cid}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return rows


@router.post("/templates")
async def create_template(
    body: OnboardingTemplateCreate,
    user=Depends(require_roles("super_admin", "company_admin")),
):
    db = get_db()
    cid = user.get("company_id")
    if not cid:
        raise HTTPException(400, "Company scope required")
    doc = OnboardingTemplate(company_id=cid, **body.model_dump()).model_dump()
    if doc.get("is_default"):
        await db.onboarding_templates.update_many(
            {"company_id": cid}, {"$set": {"is_default": False}}
        )
    await db.onboarding_templates.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/templates/{tid}")
async def update_template(
    tid: str,
    body: OnboardingTemplateCreate,
    user=Depends(require_roles("super_admin", "company_admin")),
):
    db = get_db()
    cid = user.get("company_id")
    t = await db.onboarding_templates.find_one({"id": tid, "company_id": cid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Template not found")
    upd = body.model_dump()
    upd["updated_at"] = now_iso()
    if upd.get("is_default"):
        await db.onboarding_templates.update_many(
            {"company_id": cid, "id": {"$ne": tid}}, {"$set": {"is_default": False}}
        )
    await db.onboarding_templates.update_one({"id": tid}, {"$set": upd})
    return await db.onboarding_templates.find_one({"id": tid}, {"_id": 0})


@router.delete("/templates/{tid}")
async def delete_template(
    tid: str, user=Depends(require_roles("super_admin", "company_admin"))
):
    db = get_db()
    await db.onboarding_templates.delete_one(
        {"id": tid, "company_id": user.get("company_id")}
    )
    return {"ok": True}


# ---------- Instances ----------
@router.get("")
async def list_onboardings(
    user=Depends(requires_module("onboarding")),
    status: str = Query(None),
):
    db = get_db()
    cid = user.get("company_id")
    flt = {"company_id": cid}
    if status:
        flt["status"] = status
    rows = await db.onboardings.find(flt, {"_id": 0}).sort("created_at", -1).to_list(500)
    return rows


@router.post("")
async def start_onboarding(
    body: OnboardingStart,
    user=Depends(require_roles("super_admin", "company_admin", "branch_manager")),
):
    db = get_db()
    cid = user.get("company_id")
    emp = await db.employees.find_one({"id": body.employee_id, "company_id": cid}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employee not found")
    tpl = await db.onboarding_templates.find_one(
        {"id": body.template_id, "company_id": cid}, {"_id": 0}
    )
    if not tpl:
        raise HTTPException(404, "Template not found")

    # Compute due_date per task from DOJ
    try:
        doj = datetime.fromisoformat(body.date_of_joining)
    except ValueError:
        raise HTTPException(400, "Invalid date_of_joining, expected ISO date")

    task_states = []
    for t in tpl["tasks"]:
        due = (doj + timedelta(days=t.get("due_days_from_doj", 0))).date().isoformat()
        task_states.append(OnboardingTaskState(
            task_id=t["id"], stage=t["stage"], title=t["title"],
            assignee=t["assignee"], status="pending", due_date=due,
        ))

    doc = Onboarding(
        company_id=cid, employee_id=emp["id"], employee_name=emp["name"],
        template_id=tpl["id"], template_name=tpl["name"],
        date_of_joining=body.date_of_joining, tasks=task_states,
    ).model_dump()
    await db.onboardings.insert_one(doc)
    await db.employees.update_one({"id": emp["id"]}, {"$set": {"status": "onboarding"}})
    doc.pop("_id", None)
    return doc


@router.get("/{ob_id}")
async def get_onboarding(ob_id: str, user=Depends(requires_module("onboarding"))):
    db = get_db()
    ob = await db.onboardings.find_one(
        {"id": ob_id, "company_id": user.get("company_id")}, {"_id": 0}
    )
    if not ob:
        raise HTTPException(404, "Not found")
    return ob


@router.patch("/{ob_id}/task/{task_id}")
async def update_task(
    ob_id: str, task_id: str, body: OnboardingTaskUpdate,
    user=Depends(requires_module("onboarding")),
):
    db = get_db()
    ob = await db.onboardings.find_one(
        {"id": ob_id, "company_id": user.get("company_id")}, {"_id": 0}
    )
    if not ob:
        raise HTTPException(404, "Not found")

    found = False
    updated = []
    for t in ob["tasks"]:
        if t["task_id"] == task_id:
            found = True
            if body.status:
                t["status"] = body.status
                if body.status == "done":
                    t["completed_by_user_id"] = user["id"]
                    t["completed_by_name"] = user.get("name") or user.get("email")
                    t["completed_at"] = now_iso()
            if body.notes is not None:
                t["notes"] = body.notes
        updated.append(t)
    if not found:
        raise HTTPException(404, "Task not found")

    all_done = all(t["status"] in ("done", "skipped") for t in updated)
    patch = {"tasks": updated, "updated_at": now_iso()}
    if all_done:
        patch["status"] = "completed"
    await db.onboardings.update_one({"id": ob_id}, {"$set": patch})
    if all_done:
        await db.employees.update_one(
            {"id": ob["employee_id"]}, {"$set": {"status": "active"}}
        )
    return await db.onboardings.find_one({"id": ob_id}, {"_id": 0})


@router.post("/{ob_id}/complete")
async def complete_onboarding(
    ob_id: str, user=Depends(require_roles("super_admin", "company_admin"))
):
    db = get_db()
    ob = await db.onboardings.find_one(
        {"id": ob_id, "company_id": user.get("company_id")}, {"_id": 0}
    )
    if not ob:
        raise HTTPException(404, "Not found")
    await db.onboardings.update_one(
        {"id": ob_id}, {"$set": {"status": "completed", "updated_at": now_iso()}}
    )
    await db.employees.update_one(
        {"id": ob["employee_id"]}, {"$set": {"status": "active"}}
    )
    return {"ok": True}
