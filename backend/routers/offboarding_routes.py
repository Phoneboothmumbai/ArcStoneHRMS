"""Offboarding: exit case + clearance checklist + exit interview + F&F trigger."""
from fastapi import APIRouter, Depends, HTTPException, Query

from auth import get_current_user, require_roles
from db import get_db
from models import now_iso
from models_profile import (
    ClearanceItemUpdate, ExitClearanceItem, ExitInterview,
    Offboarding, OffboardingStart,
)
from tenant import requires_module

router = APIRouter(prefix="/api/offboarding", tags=["offboarding"])

DEFAULT_CLEARANCE = [
    ("it", "Return laptop / device"),
    ("it", "Revoke system access & email"),
    ("admin", "Return ID card and access badge"),
    ("admin", "Return company assets (phone, keys, books)"),
    ("finance", "Clear pending reimbursements / advances"),
    ("hr", "Submit resignation acceptance"),
    ("manager", "Handover work & documentation"),
    ("security", "Final sign-out"),
]

HR_ROLES = {"super_admin", "company_admin", "country_head", "region_head"}


@router.get("")
async def list_offboardings(
    user=Depends(requires_module("onboarding")),
    status: str = Query(None),
):
    db = get_db()
    cid = user.get("company_id")
    flt = {"company_id": cid}
    if status:
        flt["status"] = status
    rows = await db.offboardings.find(flt, {"_id": 0}).sort("created_at", -1).to_list(500)
    return rows


@router.post("")
async def start_offboarding(
    body: OffboardingStart,
    user=Depends(require_roles("super_admin", "company_admin", "branch_manager")),
):
    db = get_db()
    cid = user.get("company_id")
    emp = await db.employees.find_one({"id": body.employee_id, "company_id": cid}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employee not found")
    clearance = [ExitClearanceItem(department=dep, title=title) for dep, title in DEFAULT_CLEARANCE]
    doc = Offboarding(
        company_id=cid, employee_id=emp["id"], employee_name=emp["name"],
        resignation_date=body.resignation_date, last_working_day=body.last_working_day,
        reason=body.reason, reason_details=body.reason_details,
        notice_period_days=body.notice_period_days, clearance=clearance,
    ).model_dump()
    await db.offboardings.insert_one(doc)

    # Notify HR + employee
    try:
        from notify import notify, company_admins
        admins = await company_admins(db, cid)
        for a_id in admins:
            await notify(
                company_id=cid, recipient_user_id=a_id,
                event="offboarding.initiated",
                data={"employee": emp["name"], "lwd": body.last_working_day},
                link=f"/app/offboarding/{doc['id']}",
                dedup_key=f"offboarding:{doc['id']}:init:{a_id}",
            )
    except Exception:
        pass

    doc.pop("_id", None)
    return doc


@router.get("/{ob_id}")
async def get_offboarding(ob_id: str, user=Depends(requires_module("onboarding"))):
    db = get_db()
    ob = await db.offboardings.find_one(
        {"id": ob_id, "company_id": user.get("company_id")}, {"_id": 0}
    )
    if not ob:
        raise HTTPException(404, "Not found")
    return ob


@router.patch("/{ob_id}/clearance/{item_id}")
async def update_clearance(
    ob_id: str, item_id: str, body: ClearanceItemUpdate,
    user=Depends(requires_module("onboarding")),
):
    db = get_db()
    ob = await db.offboardings.find_one(
        {"id": ob_id, "company_id": user.get("company_id")}, {"_id": 0}
    )
    if not ob:
        raise HTTPException(404, "Not found")
    updated = []
    found = False
    for c in ob["clearance"]:
        if c["id"] == item_id:
            found = True
            c["status"] = body.status
            c["remarks"] = body.remarks
            if body.status == "cleared":
                c["cleared_by_user_id"] = user["id"]
                c["cleared_by_name"] = user.get("name") or user.get("email")
                c["cleared_at"] = now_iso()
        updated.append(c)
    if not found:
        raise HTTPException(404, "Clearance item not found")

    patch = {"clearance": updated, "updated_at": now_iso()}
    if any(c["status"] == "cleared" for c in updated) and ob["status"] == "initiated":
        patch["status"] = "in_progress"
    await db.offboardings.update_one({"id": ob_id}, {"$set": patch})
    return await db.offboardings.find_one({"id": ob_id}, {"_id": 0})


@router.post("/{ob_id}/exit_interview")
async def submit_exit_interview(
    ob_id: str, body: ExitInterview, user=Depends(get_current_user)
):
    db = get_db()
    ob = await db.offboardings.find_one(
        {"id": ob_id, "company_id": user.get("company_id")}, {"_id": 0}
    )
    if not ob:
        raise HTTPException(404, "Not found")
    if user.get("employee_id") != ob["employee_id"] and user["role"] not in HR_ROLES:
        raise HTTPException(403, "Forbidden")
    data = body.model_dump()
    data["submitted_at"] = now_iso()
    await db.offboardings.update_one(
        {"id": ob_id}, {"$set": {"exit_interview": data, "updated_at": now_iso()}}
    )
    return await db.offboardings.find_one({"id": ob_id}, {"_id": 0})


@router.post("/{ob_id}/complete")
async def complete_offboarding(
    ob_id: str, user=Depends(require_roles("super_admin", "company_admin"))
):
    db = get_db()
    ob = await db.offboardings.find_one(
        {"id": ob_id, "company_id": user.get("company_id")}, {"_id": 0}
    )
    if not ob:
        raise HTTPException(404, "Not found")
    if any(c["status"] != "cleared" for c in ob.get("clearance", [])):
        raise HTTPException(400, "All clearance items must be cleared before relieving")

    await db.offboardings.update_one({"id": ob_id}, {"$set": {
        "status": "relieved",
        "updated_at": now_iso(),
        "relieving_letter_issued": True,
        "experience_letter_issued": True,
        "fnf_settled": True,
    }})
    await db.employees.update_one(
        {"id": ob["employee_id"]}, {"$set": {"status": "terminated"}}
    )
    emp = await db.employees.find_one({"id": ob["employee_id"]}, {"_id": 0})
    if emp and emp.get("user_id"):
        await db.users.update_one(
            {"id": emp["user_id"]}, {"$set": {"is_active": False}}
        )
    return {"ok": True}
