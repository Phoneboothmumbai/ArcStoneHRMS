"""Rewire the approval engine to use per-company, per-type configurable workflows.
Falls back to manager walk-up when no workflow matches.
"""
from fastapi import APIRouter, Depends, HTTPException
from auth import get_current_user
from db import get_db
from models import ApprovalDecision, now_iso, uid

router = APIRouter(prefix="/api/approvals", tags=["approvals"])


# ---------------------------------------------------------------------------
# Workflow matching + step resolution
# ---------------------------------------------------------------------------
def _score_workflow(wf: dict, ctx: dict):
    """Return score (higher = better match) or None if workflow does not match."""
    score = 0
    # item_category (product_service)
    if wf.get("match_item_category"):
        if (ctx.get("item_category") or "").lower() != wf["match_item_category"].lower():
            return None
        score += 50
    # leave_type
    if wf.get("match_leave_type"):
        if ctx.get("leave_type") != wf["match_leave_type"]:
            return None
        score += 50
    # cost range
    cost = float(ctx.get("cost") or 0)
    if wf.get("match_min_cost") is not None and cost < wf["match_min_cost"]:
        return None
    if wf.get("match_max_cost") is not None and cost > wf["match_max_cost"]:
        return None
    if wf.get("match_min_cost") is not None or wf.get("match_max_cost") is not None:
        score += 20
    # days range (leave)
    days = int(ctx.get("days") or 0)
    if wf.get("match_min_days") is not None and days < wf["match_min_days"]:
        return None
    if wf.get("match_max_days") is not None and days > wf["match_max_days"]:
        return None
    if wf.get("match_min_days") is not None or wf.get("match_max_days") is not None:
        score += 15
    # branch scope
    if wf.get("match_branch_id"):
        if ctx.get("branch_id") != wf["match_branch_id"]:
            return None
        score += 30
    score += int(wf.get("priority", 10))
    return score


async def _find_matching_workflow(db, company_id: str, request_type: str, ctx: dict):
    flt = {"company_id": company_id, "request_type": request_type, "is_active": True}
    wfs = await db.approval_workflows.find(flt, {"_id": 0}).to_list(500)
    best, best_score = None, -1
    for wf in wfs:
        s = _score_workflow(wf, ctx)
        if s is None:
            continue
        if s > best_score:
            best, best_score = wf, s
    return best


async def _resolve_approver(db, step: dict, requester_employee, company_id: str):
    """Resolve a workflow step to a concrete user dict (or None)."""
    resolver = step.get("resolver")

    if resolver == "user":
        if not step.get("user_id"):
            return None
        return await db.users.find_one({"id": step["user_id"]}, {"_id": 0, "password_hash": 0})

    if resolver == "role":
        if not step.get("role"):
            return None
        return await db.users.find_one(
            {"company_id": company_id, "role": step["role"], "is_active": True},
            {"_id": 0, "password_hash": 0},
        )

    if resolver == "company_admin":
        return await db.users.find_one(
            {"company_id": company_id, "role": "company_admin"},
            {"_id": 0, "password_hash": 0},
        )

    if resolver == "manager":
        if requester_employee and requester_employee.get("manager_id"):
            mgr = await db.employees.find_one({"id": requester_employee["manager_id"]}, {"_id": 0})
            if mgr and mgr.get("user_id"):
                return await db.users.find_one({"id": mgr["user_id"]}, {"_id": 0, "password_hash": 0})
        return None

    if resolver == "department_head":
        if requester_employee and requester_employee.get("department_id"):
            dept = await db.departments.find_one({"id": requester_employee["department_id"]}, {"_id": 0})
            if dept and dept.get("head_user_id"):
                return await db.users.find_one({"id": dept["head_user_id"]}, {"_id": 0, "password_hash": 0})
        return None

    if resolver == "branch_manager":
        if requester_employee and requester_employee.get("branch_id"):
            br = await db.branches.find_one({"id": requester_employee["branch_id"]}, {"_id": 0})
            if br and br.get("manager_user_id"):
                return await db.users.find_one({"id": br["manager_user_id"]}, {"_id": 0, "password_hash": 0})
            # fallback: any user with branch_manager role in the company
            return await db.users.find_one(
                {"company_id": company_id, "role": "branch_manager"},
                {"_id": 0, "password_hash": 0},
            )
        return None

    return None


# ---------------------------------------------------------------------------
# Legacy manager walk-up — used as fallback when no workflow matches
# ---------------------------------------------------------------------------
async def _walk_manager_chain(db, company_id: str, requester_employee_id: str):
    steps, visited = [], set()
    cur_id = requester_employee_id
    step_no = 1
    while cur_id and cur_id not in visited and step_no <= 4:
        visited.add(cur_id)
        emp = await db.employees.find_one({"id": cur_id}, {"_id": 0})
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
        cur_id = mgr_id

    if not any(s["approver_role"] == "company_admin" for s in steps):
        admin = await db.users.find_one({"company_id": company_id, "role": "company_admin"}, {"_id": 0})
        if admin:
            steps.append({
                "step": step_no,
                "approver_user_id": admin["id"],
                "approver_name": admin["name"],
                "approver_role": "company_admin",
                "status": "pending",
                "decided_at": None,
                "comment": None,
            })
    return steps


# ---------------------------------------------------------------------------
# Public: create_approval_request (used by leave/requests routers)
# ---------------------------------------------------------------------------
async def create_approval_request(
    db, *, company_id, request_type, requester_user_id, requester_name,
    title, details, linked_id, requester_employee_id=None, context=None,
):
    context = dict(context or {})
    requester_emp = None
    if requester_employee_id:
        requester_emp = await db.employees.find_one({"id": requester_employee_id}, {"_id": 0})
        context.setdefault("branch_id", requester_emp.get("branch_id") if requester_emp else None)

    # 1. Try matching workflow
    wf = await _find_matching_workflow(db, company_id, request_type, context)
    workflow_id = wf["id"] if wf else None
    workflow_name = wf["name"] if wf else None
    steps = []

    if wf:
        step_no = 1
        for wf_step in sorted(wf.get("steps", []), key=lambda s: s["order"]):
            # conditional: cost threshold
            if wf_step.get("condition_min_cost") is not None:
                if float(context.get("cost") or 0) < float(wf_step["condition_min_cost"]):
                    continue
            approver = await _resolve_approver(db, wf_step, requester_emp, company_id)
            if not approver:
                # Can't resolve — skip silently; workflow is still applied for auditability
                continue
            steps.append({
                "step": step_no,
                "approver_user_id": approver["id"],
                "approver_name": approver["name"],
                "approver_role": wf_step.get("label") or approver.get("role", ""),
                "status": "pending",
                "decided_at": None,
                "comment": None,
            })
            step_no += 1

    # 2. Fallback: walk manager chain
    if not steps and requester_employee_id:
        steps = await _walk_manager_chain(db, company_id, requester_employee_id)

    # 3. Final fallback: company admin only
    if not steps:
        admin = await db.users.find_one({"company_id": company_id, "role": "company_admin"}, {"_id": 0})
        if admin:
            steps = [{
                "step": 1, "approver_user_id": admin["id"], "approver_name": admin["name"],
                "approver_role": "company_admin", "status": "pending",
                "decided_at": None, "comment": None,
            }]

    doc = {
        "id": uid(),
        "company_id": company_id,
        "request_type": request_type,
        "requester_user_id": requester_user_id,
        "requester_name": requester_name,
        "title": title,
        "details": details,
        "status": "pending",
        "current_step": 1,
        "steps": steps,
        "linked_id": linked_id,
        "workflow_id": workflow_id,
        "workflow_name": workflow_name,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.approval_requests.insert_one(doc)
    doc.pop("_id", None)

    # Notify the first approver (if any)
    try:
        from notify import notify
        if steps:
            first = steps[0]
            await notify(
                company_id=company_id, recipient_user_id=first["approver_user_id"],
                event="approval.pending",
                data={"actor": requester_name, "title": title},
                link="/app/approvals", dedup_key=f"approval:{doc['id']}:step1",
            )
    except Exception:
        pass

    return doc


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@router.get("")
async def list_my_approvals(status: str = "pending", user=Depends(get_current_user)):
    db = get_db()
    flt = {"steps.approver_user_id": user["id"]}
    if status != "all":
        flt["status"] = status
    rows = await db.approval_requests.find(flt, {"_id": 0}).sort("created_at", -1).to_list(500)
    for r in rows:
        r["is_my_turn"] = False
        for s in r.get("steps", []):
            if s["approver_user_id"] == user["id"] and s["step"] == r["current_step"] and r["status"] == "pending":
                r["is_my_turn"] = True
                break
    return rows


@router.get("/mine")
async def list_submitted(user=Depends(get_current_user)):
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

    if ap.get("linked_id"):
        coll_map = {
            "leave": "leave_requests",
            "product_service": "product_service_requests",
            "regularization": "regularizations",
            "overtime": "overtime_requests",
            "timesheet": "timesheets",
        }
        coll = coll_map.get(ap["request_type"], "product_service_requests")
        await db[coll].update_one({"id": ap["linked_id"]}, {"$set": {"status": ap["status"], "updated_at": now_iso()}})
        # Leave balance ledger sync: move pending → used on approve; release on reject
        if ap["request_type"] == "leave" and ap["status"] in ("approved", "rejected"):
            lr = await db.leave_requests.find_one({"id": ap["linked_id"]}, {"_id": 0})
            if lr and lr.get("balance_id"):
                bal = await db.leave_balances.find_one({"id": lr["balance_id"]}, {"_id": 0})
                if bal:
                    days = float(lr.get("days", 0))
                    new_pending = max(0.0, float(bal.get("pending", 0)) - days)
                    patch = {"pending": new_pending, "updated_at": now_iso()}
                    if ap["status"] == "approved":
                        patch["used"] = float(bal.get("used", 0)) + days
                    await db.leave_balances.update_one({"id": bal["id"]}, {"$set": patch})

    # Notify requester + next approver (if still in flight)
    try:
        from notify import notify
        if ap["status"] in ("approved", "rejected"):
            await notify(
                company_id=ap["company_id"],
                recipient_user_id=ap["requester_user_id"],
                event=f"approval.{ap['status']}",
                data={"approver": user.get("name") or user.get("email"), "title": ap["title"]},
                link=f"/app/approvals",
                dedup_key=f"approval:{ap['id']}:final",
            )
        else:
            next_step_obj = next((s for s in ap["steps"] if s["step"] == ap["current_step"]), None)
            if next_step_obj:
                await notify(
                    company_id=ap["company_id"],
                    recipient_user_id=next_step_obj["approver_user_id"],
                    event="approval.pending",
                    data={"actor": ap["requester_name"], "title": ap["title"]},
                    link="/app/approvals",
                    dedup_key=f"approval:{ap['id']}:step{ap['current_step']}",
                )
    except Exception:
        pass

    return ap


@router.post("/preview")
async def preview_workflow(body: dict, user=Depends(get_current_user)):
    """Resolve which workflow would match a given context, without creating anything.
    Useful for the Workflow Builder UI to 'test' a rule.
    Body: { request_type, item_category?, leave_type?, cost?, days?, branch_id? }
    """
    db = get_db()
    cid = user.get("company_id")
    if not cid:
        raise HTTPException(400, "Company scope required")
    wf = await _find_matching_workflow(db, cid, body.get("request_type", ""), body)
    if not wf:
        return {"matched": False, "fallback": "manager_walk_up"}
    return {"matched": True, "workflow": wf}
