"""Employee management."""
from fastapi import APIRouter, Depends, HTTPException, Query
from auth import require_roles, get_current_user, hash_password
from db import get_db
from models import EmployeeCreate, now_iso, uid

router = APIRouter(prefix="/api/employees", tags=["employees"])


@router.get("")
async def list_employees(
    user=Depends(get_current_user),
    branch_id: str = Query(None),
    department_id: str = Query(None),
    employee_type: str = Query(None),
    q: str = Query(None),
):
    db = get_db()
    cid = user.get("company_id")
    if user["role"] == "super_admin":
        pass  # return all or require company_id filter
    elif not cid:
        raise HTTPException(403, "No company scope")
    flt = {} if user["role"] == "super_admin" else {"company_id": cid}
    if branch_id:
        flt["branch_id"] = branch_id
    if department_id:
        flt["department_id"] = department_id
    if employee_type:
        flt["employee_type"] = employee_type
    if q:
        flt["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"email": {"$regex": q, "$options": "i"}},
            {"employee_code": {"$regex": q, "$options": "i"}},
            {"job_title": {"$regex": q, "$options": "i"}},
        ]
    rows = await db.employees.find(flt, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return rows


@router.post("")
async def create_employee(body: EmployeeCreate, user=Depends(require_roles("super_admin", "company_admin", "branch_manager"))):
    db = get_db()
    cid = user.get("company_id")
    if not cid:
        raise HTTPException(400, "Company scope required")

    # next code
    count = await db.employees.count_documents({"company_id": cid})
    code = f"EMP-{count + 1:04d}"

    doc = {
        "id": uid(), "company_id": cid, "user_id": None, "employee_code": code,
        "name": body.name, "email": body.email.lower(), "phone": body.phone,
        "employee_type": body.employee_type, "region_id": body.region_id,
        "country_id": body.country_id, "branch_id": body.branch_id,
        "department_id": body.department_id, "job_title": body.job_title,
        "manager_id": body.manager_id, "role_in_company": body.role_in_company,
        "joined_on": now_iso(), "status": "active",
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.employees.insert_one(doc)

    if body.create_login and body.password:
        if await db.users.find_one({"email": doc["email"]}):
            raise HTTPException(400, "User email already exists")
        u_id = uid()
        await db.users.insert_one({
            "id": u_id, "email": doc["email"], "password_hash": hash_password(body.password),
            "name": body.name, "role": body.role_in_company, "company_id": cid,
            "reseller_id": user.get("reseller_id"), "employee_id": doc["id"],
            "is_active": True, "created_at": now_iso(), "updated_at": now_iso(),
        })
        await db.employees.update_one({"id": doc["id"]}, {"$set": {"user_id": u_id}})
        doc["user_id"] = u_id

    # bump company count
    await db.companies.update_one({"id": cid}, {"$inc": {"employee_count": 1}})
    doc.pop("_id", None)
    return doc


@router.get("/me")
async def me_employee(user=Depends(get_current_user)):
    db = get_db()
    if not user.get("employee_id"):
        raise HTTPException(404, "Not an employee-linked user")
    emp = await db.employees.find_one({"id": user["employee_id"]}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employee record missing")
    return emp


@router.get("/team")
async def my_team(user=Depends(get_current_user)):
    """Direct reports for the current user (if they are a manager)."""
    db = get_db()
    if not user.get("employee_id"):
        return []
    rows = await db.employees.find({"manager_id": user["employee_id"]}, {"_id": 0}).to_list(1000)
    return rows


@router.get("/{emp_id}")
async def get_employee(emp_id: str, user=Depends(get_current_user)):
    db = get_db()
    emp = await db.employees.find_one({"id": emp_id}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Not found")
    if user["role"] != "super_admin" and user.get("company_id") != emp["company_id"]:
        raise HTTPException(403, "Forbidden")
    return emp
