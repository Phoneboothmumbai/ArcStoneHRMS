"""Employee rich profile — India-first. Per-section access control + completeness scoring."""
from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user
from db import get_db
from models import now_iso
from models_profile import EmployeeProfile, EmployeeProfilePatch

router = APIRouter(prefix="/api/profile", tags=["profile"])

# Weights for completeness calculation (must sum to 100)
COMPLETE_WEIGHTS = {
    "personal": 10, "contact": 10, "kyc": 15, "statutory_in": 15,
    "bank": 15, "employment": 15, "emergency_contacts": 5,
    "family": 5, "education": 5, "prior_employment": 5,
}

# HR-only sections — employees cannot self-edit these
HR_ONLY_SECTIONS = {"kyc", "statutory_in", "bank", "employment"}

HR_ROLES = {"super_admin", "company_admin", "country_head", "region_head"}
MANAGER_ROLES = HR_ROLES | {"branch_manager", "sub_manager", "assistant_manager"}


def _compute_completeness(doc: dict) -> float:
    score = 0
    for k, w in COMPLETE_WEIGHTS.items():
        v = doc.get(k)
        if isinstance(v, dict):
            if any(val not in (None, "", [], {}) for val in v.values()):
                score += w
        elif isinstance(v, list):
            if len(v) > 0:
                score += w
    return float(score)


async def _ensure_profile(db, company_id: str, employee_id: str) -> dict:
    p = await db.employee_profiles.find_one({"employee_id": employee_id}, {"_id": 0})
    if p:
        return p
    doc = EmployeeProfile(company_id=company_id, employee_id=employee_id).model_dump()
    await db.employee_profiles.insert_one(doc)
    return await db.employee_profiles.find_one({"employee_id": employee_id}, {"_id": 0})


def _can_view(user: dict, emp: dict) -> bool:
    if user["role"] == "super_admin":
        return True
    if user.get("company_id") != emp.get("company_id"):
        return False
    if user["role"] in MANAGER_ROLES:
        return True
    return user.get("employee_id") == emp["id"]


def _can_edit_section(user: dict, emp: dict, section: str) -> bool:
    if user["role"] in HR_ROLES:
        return user["role"] == "super_admin" or user.get("company_id") == emp["company_id"]
    if user.get("employee_id") == emp["id"] and user.get("company_id") == emp["company_id"]:
        return section not in HR_ONLY_SECTIONS
    return False


@router.get("/employee/{emp_id}")
async def get_profile(emp_id: str, user=Depends(get_current_user)):
    db = get_db()
    emp = await db.employees.find_one({"id": emp_id}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employee not found")
    if not _can_view(user, emp):
        raise HTTPException(403, "Forbidden")
    profile = await _ensure_profile(db, emp["company_id"], emp_id)
    editable = {s: _can_edit_section(user, emp, s) for s in COMPLETE_WEIGHTS.keys()}
    return {"employee": emp, "profile": profile, "editable": editable}


@router.patch("/employee/{emp_id}")
async def patch_profile(emp_id: str, body: EmployeeProfilePatch, user=Depends(get_current_user)):
    db = get_db()
    emp = await db.employees.find_one({"id": emp_id}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employee not found")
    if user["role"] != "super_admin" and user.get("company_id") != emp.get("company_id"):
        raise HTTPException(403, "Forbidden")

    await _ensure_profile(db, emp["company_id"], emp_id)
    data = body.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(400, "Nothing to update")

    for section in data.keys():
        if not _can_edit_section(user, emp, section):
            raise HTTPException(403, f"Not allowed to edit '{section}'")

    data["updated_at"] = now_iso()
    await db.employee_profiles.update_one({"employee_id": emp_id}, {"$set": data})
    p = await db.employee_profiles.find_one({"employee_id": emp_id}, {"_id": 0})
    completeness = _compute_completeness(p)
    await db.employee_profiles.update_one({"employee_id": emp_id}, {"$set": {"profile_completeness": completeness}})
    p["profile_completeness"] = completeness
    return p


@router.get("/me")
async def my_profile(user=Depends(get_current_user)):
    db = get_db()
    if not user.get("employee_id"):
        raise HTTPException(404, "Not an employee-linked user")
    emp = await db.employees.find_one({"id": user["employee_id"]}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employee record missing")
    profile = await _ensure_profile(db, emp["company_id"], user["employee_id"])
    editable = {s: _can_edit_section(user, emp, s) for s in COMPLETE_WEIGHTS.keys()}
    return {"employee": emp, "profile": profile, "editable": editable}
