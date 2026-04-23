"""Generic multi-level approval engine."""
from fastapi import APIRouter, Depends, HTTPException
from auth import get_current_user
from db import get_db
from models import ApprovalDecision, now_iso, uid

router = APIRouter(prefix="/api/approvals", tags=["approvals"])


async def build_approval_chain(db, company_id: str, requester_employee_id: str, request_type: str):
    """Build the approval chain by walking up the manager hierarchy.
    Steps: direct manager → sub_manager → branch_manager → company_admin.
    Returns list of ApprovalStep dicts.
    """
    steps = []
    visited = set()
    current_emp_id = requester_employee_id
    step_no = 1
    # walk up the chain
    while current_emp_id and current_emp_id not in visited and step_no <= 4:
        visited.add(current_emp_id)
        emp = await db.employees.find_one({"id": current_emp_id}, {"_id": 0})
        if not emp:
            break
        mgr_id = emp.get("manager_id")
        if not mgr_id:
            break
        mgr = await db.employees.find_one({"id": mgr_id}, {"_id": 0})
        if not mgr:
            break
        if mgr.get("user_id"):
            steps.append({
                "step": step_no,
                "approver_user_id": mgr["user_id"],
                "approver_name": mgr["name"],
                "approver_role": mgr.get("role_in_company", "manager"),
                "status": "pending",
                "decided_at": None,
                "comment": None,
            })
            step_no += 1
        current_emp_id = mgr_id

    # Final step: company_admin (if not already in chain via role)
    if not any(s["approver_role"] == "company_admin" for s in steps):
        admin_user = await db.users.find_one({"company_id": company_id, "role": "company_admin"}, {"_id": 0})
        if admin_user:
            steps.append({
                "step": step_no,
                "approver_user_id": admin_user["id"],
                "approver_name": admin_user["name"],
                "approver_role": "company_admin",
                "status": "pending",
                "decided_at": None,
                "comment": None,
            })
    return steps


async def create_approval_request(db, *, company_id, request_type, requester_user_id, requester_name,
                                   title, details, linked_id, requester_employee_id=None):
    steps = []
    if requester_employee_id:
        steps = await build_approval_chain(db, company_id, requester_employee_id, request_type)
    if not steps:
        # fallback: company admin only
        admin = await db.users.find_one({"company_id": company_id, "role": "company_admin"}, {"_id": 0})
        if admin:
            steps = [{"step": 1, "approver_user_id": admin["id"], "approver_name": admin["name"],
                      "approver_role": "company_admin", "status": "pending",
                      "decided_at": None, "comment": None}]
    doc = {
        "id": uid(), "company_id": company_id, "request_type": request_type,
        "requester_user_id": requester_user_id, "requester_name": requester_name,
        "title": title, "details": details, "status": "pending",
        "current_step": 1, "steps": steps, "linked_id": linked_id,
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.approval_requests.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("")
async def list_my_approvals(status: str = "pending", user=Depends(get_current_user)):
    """Approvals where current user is an approver."""
    db = get_db()
    flt = {"steps.approver_user_id": user["id"]}
    if status != "all":
        flt["status"] = status
    rows = await db.approval_requests.find(flt, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Mark which step is mine and if it's currently actionable
    for r in rows:
        r["is_my_turn"] = False
        for s in r.get("steps", []):
            if s["approver_user_id"] == user["id"] and s["step"] == r["current_step"] and r["status"] == "pending":
                r["is_my_turn"] = True
                break
    return rows


@router.get("/mine")
async def list_submitted(user=Depends(get_current_user)):
    """Requests the current user has submitted."""
    db = get_db()
    rows = await db.approval_requests.find({"requester_user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return rows


@router.get("/{approval_id}")
async def get_approval(approval_id: str, user=Depends(get_current_user)):
    db = get_db()
    ap = await db.approval_requests.find_one({"id": approval_id}, {"_id": 0})
    if not ap:
        raise HTTPException(404, "Not found")
    if user["role"] != "super_admin" and user.get("company_id") != ap["company_id"]:
        raise HTTPException(403, "Forbidden")
    return ap


@router.post("/{approval_id}/decide")
async def decide(approval_id: str, body: ApprovalDecision, user=Depends(get_current_user)):
    db = get_db()
    ap = await db.approval_requests.find_one({"id": approval_id}, {"_id": 0})
    if not ap:
        raise HTTPException(404, "Not found")
    if ap["status"] != "pending":
        raise HTTPException(400, "Already finalized")

    current = next((s for s in ap["steps"] if s["step"] == ap["current_step"]), None)
    if not current:
        raise HTTPException(400, "No current step")
    if current["approver_user_id"] != user["id"]:
        raise HTTPException(403, "Not your turn to approve")

    current["status"] = "approved" if body.decision == "approve" else "rejected"
    current["decided_at"] = now_iso()
    current["comment"] = body.comment

    if body.decision == "reject":
        ap["status"] = "rejected"
    else:
        # advance step
        next_step = ap["current_step"] + 1
        has_next = any(s["step"] == next_step for s in ap["steps"])
        if has_next:
            ap["current_step"] = next_step
        else:
            ap["status"] = "approved"

    ap["updated_at"] = now_iso()
    await db.approval_requests.update_one({"id": approval_id}, {"$set": {
        "steps": ap["steps"], "status": ap["status"],
        "current_step": ap["current_step"], "updated_at": ap["updated_at"],
    }})

    # update linked record status
    if ap.get("linked_id"):
        collection = "leave_requests" if ap["request_type"] == "leave" else "product_service_requests"
        await db[collection].update_one({"id": ap["linked_id"]}, {"$set": {"status": ap["status"], "updated_at": now_iso()}})

    return ap
