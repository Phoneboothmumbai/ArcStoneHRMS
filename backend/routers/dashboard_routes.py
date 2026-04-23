"""Dashboard stats (role-aware)."""
from fastapi import APIRouter, Depends
from auth import get_current_user
from db import get_db

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats")
async def stats(user=Depends(get_current_user)):
    db = get_db()
    role = user["role"]
    if role == "super_admin":
        return {
            "resellers": await db.resellers.count_documents({}),
            "companies": await db.companies.count_documents({}),
            "employees": await db.employees.count_documents({}),
            "active_users": await db.users.count_documents({"is_active": True}),
            "pending_approvals": await db.approval_requests.count_documents({"status": "pending"}),
        }
    if role == "reseller":
        rid = user.get("reseller_id")
        cmps = await db.companies.find({"reseller_id": rid}, {"_id": 0}).to_list(1000)
        plan_price = {"starter": 99, "growth": 299, "enterprise": 999}
        mrr = sum(plan_price.get(c.get("plan", "growth"), 299) for c in cmps)
        reseller = await db.resellers.find_one({"id": rid}, {"_id": 0}) or {}
        rate = reseller.get("commission_rate", 0.15)
        return {
            "companies": len(cmps),
            "employees": await db.employees.count_documents({"company_id": {"$in": [c["id"] for c in cmps]}}),
            "mrr": mrr,
            "monthly_commission": round(mrr * rate, 2),
            "commission_rate": rate,
        }
    cid = user.get("company_id")
    if role in ("company_admin", "country_head", "region_head"):
        pending = await db.approval_requests.count_documents({"company_id": cid, "status": "pending"})
        return {
            "employees": await db.employees.count_documents({"company_id": cid}),
            "branches": await db.branches.count_documents({"company_id": cid}),
            "pending_approvals": pending,
            "open_leave": await db.leave_requests.count_documents({"company_id": cid, "status": "pending"}),
            "open_requests": await db.product_service_requests.count_documents({"company_id": cid, "status": "pending"}),
        }
    if role in ("branch_manager", "sub_manager", "assistant_manager"):
        my_approvals = await db.approval_requests.count_documents({"steps.approver_user_id": user["id"], "status": "pending"})
        team_count = await db.employees.count_documents({"manager_id": user.get("employee_id")}) if user.get("employee_id") else 0
        return {
            "team_count": team_count,
            "pending_approvals": my_approvals,
            "my_requests": await db.approval_requests.count_documents({"requester_user_id": user["id"]}),
        }
    # employee
    return {
        "my_leave": await db.leave_requests.count_documents({"employee_id": user.get("employee_id")}) if user.get("employee_id") else 0,
        "my_requests": await db.product_service_requests.count_documents({"employee_id": user.get("employee_id")}) if user.get("employee_id") else 0,
        "attendance_today": await db.attendance.find_one({"employee_id": user.get("employee_id")}, {"_id": 0}) if user.get("employee_id") else None,
    }
