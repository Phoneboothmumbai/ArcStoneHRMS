"""Leave management."""
from fastapi import APIRouter, Depends, HTTPException
from auth import get_current_user
from db import get_db
from models import LeaveCreate, now_iso, uid
from routers.approvals_routes import create_approval_request

router = APIRouter(prefix="/api/leave", tags=["leave"])


@router.post("")
async def create_leave(body: LeaveCreate, user=Depends(get_current_user)):
    db = get_db()
    if not user.get("employee_id"):
        raise HTTPException(400, "No employee profile on user")
    emp = await db.employees.find_one({"id": user["employee_id"]}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employee record missing")
    leave_id = uid()
    leave_doc = {
        "id": leave_id, "company_id": emp["company_id"], "employee_id": emp["id"],
        "employee_name": emp["name"], "leave_type": body.leave_type,
        "start_date": body.start_date, "end_date": body.end_date, "reason": body.reason,
        "status": "pending", "approval_request_id": None,
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.leave_requests.insert_one(leave_doc)
    leave_doc.pop("_id", None)
    ap = await create_approval_request(
        db, company_id=emp["company_id"], request_type="leave",
        requester_user_id=user["id"], requester_name=emp["name"],
        title=f"Leave: {body.leave_type} ({body.start_date} → {body.end_date})",
        details={"leave_type": body.leave_type, "start": body.start_date, "end": body.end_date, "reason": body.reason},
        linked_id=leave_id, requester_employee_id=emp["id"],
    )
    await db.leave_requests.update_one({"id": leave_id}, {"$set": {"approval_request_id": ap["id"]}})
    leave_doc["approval_request_id"] = ap["id"]
    return leave_doc


@router.get("")
async def list_leave(user=Depends(get_current_user)):
    db = get_db()
    if user["role"] == "super_admin":
        rows = await db.leave_requests.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    elif user["role"] == "employee" and user.get("employee_id"):
        rows = await db.leave_requests.find({"employee_id": user["employee_id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    else:
        rows = await db.leave_requests.find({"company_id": user.get("company_id")}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return rows
