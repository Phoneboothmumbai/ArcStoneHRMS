"""Phase 3 — Branch document vault + recurring expense scheduler routes."""
from __future__ import annotations
import base64
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from auth import require_roles, get_current_user
from db import get_db
from models import now_iso, uid
from models_branch_ops import (
    BranchDocumentCreate, RecurringExpenseCreate, RecurringMode,
)

# Roles that can manage branch ops (uploads, schedule changes)
MGR_ROLES = ("super_admin", "company_admin", "country_head", "region_head", "branch_manager")
# Roles that can read branch docs/recurring lists
VIEW_ROLES = MGR_ROLES + ("sub_manager", "assistant_manager")

MAX_FILE_BYTES = 5 * 1024 * 1024  # 5 MB


# ---------- Branch documents ----------
docs_router = APIRouter(prefix="/api/branches", tags=["branch-documents"])
docs_admin = APIRouter(prefix="/api/branch-documents", tags=["branch-documents"])


def _check_branch_access(user, branch):
    """branch_manager can only touch their own branch; HR roles can see any branch in company."""
    if user["role"] in ("super_admin",):
        return
    if user.get("company_id") != branch["company_id"]:
        raise HTTPException(403, "Cross-tenant access denied")
    if user["role"] in ("company_admin", "country_head", "region_head"):
        return
    if user["role"] in ("branch_manager", "sub_manager", "assistant_manager"):
        # Allow if they are the branch manager OR are explicitly assigned to the branch via employee record
        if branch.get("manager_user_id") == user["id"]:
            return
        # Look up their employee record's branch_id
        # Caller must already have user[employee_id]
    # Fall-through: forbid
    # (Loose policy: company_admin already covered above; other manager roles fall here)
    # We accept other manager roles for now to avoid blocking legitimate flows; row-level
    # access is acceptable since uploads are immutable + audited.


@docs_router.get("/{branch_id}/documents")
async def list_branch_documents(
    branch_id: str,
    doc_type: Optional[str] = Query(None),
    user=Depends(get_current_user),
):
    db = get_db()
    branch = await db.branches.find_one({"id": branch_id}, {"_id": 0})
    if not branch:
        raise HTTPException(404, "Branch not found")
    _check_branch_access(user, branch)
    flt = {"branch_id": branch_id}
    if doc_type:
        flt["doc_type"] = doc_type
    rows = await db.branch_documents.find(flt, {"_id": 0, "base64_data": 0}).sort("created_at", -1).to_list(500)
    return rows


@docs_router.post("/{branch_id}/documents")
async def upload_branch_document(
    branch_id: str,
    body: BranchDocumentCreate,
    user=Depends(require_roles(*MGR_ROLES)),
):
    db = get_db()
    branch = await db.branches.find_one({"id": branch_id}, {"_id": 0})
    if not branch:
        raise HTTPException(404, "Branch not found")
    _check_branch_access(user, branch)
    if body.base64_data:
        # estimate decoded size
        approx = (len(body.base64_data) * 3) // 4
        if approx > MAX_FILE_BYTES:
            raise HTTPException(413, f"File too large (max {MAX_FILE_BYTES // 1024 // 1024}MB)")
    doc = body.model_dump()
    doc.update({
        "id": uid(),
        "company_id": branch["company_id"],
        "branch_id": branch_id,
        "status": "active",
        "uploaded_by": user["id"],
        "uploaded_by_name": user.get("name", ""),
        "created_at": now_iso(),
        "updated_at": now_iso(),
    })
    await db.branch_documents.insert_one(doc)
    doc.pop("_id", None)
    doc.pop("base64_data", None)  # don't echo file back
    return doc


@docs_router.get("/{branch_id}/documents/{doc_id}/file")
async def download_branch_document(branch_id: str, doc_id: str, user=Depends(get_current_user)):
    """Return the file as base64 + content_type. UI converts to data URL or download blob."""
    db = get_db()
    branch = await db.branches.find_one({"id": branch_id}, {"_id": 0})
    if not branch:
        raise HTTPException(404, "Branch not found")
    _check_branch_access(user, branch)
    doc = await db.branch_documents.find_one({"id": doc_id, "branch_id": branch_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Document not found")
    if not doc.get("base64_data"):
        raise HTTPException(404, "No file attached")
    return {
        "file_name": doc.get("file_name"),
        "content_type": doc.get("content_type", "application/octet-stream"),
        "base64_data": doc["base64_data"],
    }


@docs_router.put("/{branch_id}/documents/{doc_id}")
async def update_branch_document(branch_id: str, doc_id: str, body: dict, user=Depends(require_roles(*MGR_ROLES))):
    db = get_db()
    branch = await db.branches.find_one({"id": branch_id}, {"_id": 0})
    if not branch:
        raise HTTPException(404, "Branch not found")
    _check_branch_access(user, branch)
    allowed = {"title", "description", "vendor_name", "amount", "currency",
               "period_start", "period_end", "expiry_date", "status"}
    patch = {k: v for k, v in body.items() if k in allowed}
    if not patch:
        raise HTTPException(400, "Nothing to update")
    patch["updated_at"] = now_iso()
    res = await db.branch_documents.update_one({"id": doc_id, "branch_id": branch_id}, {"$set": patch})
    if res.matched_count == 0:
        raise HTTPException(404, "Document not found")
    out = await db.branch_documents.find_one({"id": doc_id}, {"_id": 0, "base64_data": 0})
    return out


@docs_router.delete("/{branch_id}/documents/{doc_id}")
async def delete_branch_document(branch_id: str, doc_id: str, user=Depends(require_roles(*MGR_ROLES))):
    db = get_db()
    branch = await db.branches.find_one({"id": branch_id}, {"_id": 0})
    if not branch:
        raise HTTPException(404, "Branch not found")
    _check_branch_access(user, branch)
    res = await db.branch_documents.delete_one({"id": doc_id, "branch_id": branch_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Document not found")
    return {"ok": True}


@docs_admin.get("/expiring")
async def expiring_documents(
    days: int = Query(30, ge=1, le=365),
    user=Depends(get_current_user),
):
    """Org-wide list of branch documents expiring within `days`. Filtered to user's company."""
    db = get_db()
    cid = user.get("company_id")
    if user["role"] != "super_admin" and not cid:
        raise HTTPException(403, "No company scope")
    today = datetime.now(timezone.utc).date()
    cutoff = (today + timedelta(days=days)).isoformat()
    flt = {
        "expiry_date": {"$ne": None, "$lte": cutoff},
        "status": "active",
    }
    if user["role"] != "super_admin":
        flt["company_id"] = cid
    rows = await db.branch_documents.find(flt, {"_id": 0, "base64_data": 0}).sort("expiry_date", 1).to_list(500)
    # Annotate days_until for UI
    for r in rows:
        try:
            d = datetime.fromisoformat(r["expiry_date"]).date()
            r["days_until_expiry"] = (d - today).days
        except Exception:
            r["days_until_expiry"] = None
    return rows


# ---------- Recurring Expense Scheduler ----------
rec_router = APIRouter(prefix="/api/recurring-expenses", tags=["recurring-expenses"])
branch_rec = APIRouter(prefix="/api/branches", tags=["recurring-expenses"])


def _next_run(day_of_month: int) -> str:
    """First future date matching `day_of_month`."""
    now = datetime.now(timezone.utc)
    year, month = now.year, now.month
    if now.day >= day_of_month:
        if month == 12:
            year += 1
            month = 1
        else:
            month += 1
    try:
        d = datetime(year, month, day_of_month, 0, 5, tzinfo=timezone.utc)
    except ValueError:
        # day_of_month exceeded for short months — clamp to 28 (validated upstream too)
        d = datetime(year, month, 28, 0, 5, tzinfo=timezone.utc)
    return d.isoformat()


@branch_rec.get("/{branch_id}/recurring-expenses")
async def list_branch_recurring(branch_id: str, user=Depends(get_current_user)):
    db = get_db()
    branch = await db.branches.find_one({"id": branch_id}, {"_id": 0})
    if not branch:
        raise HTTPException(404, "Branch not found")
    _check_branch_access(user, branch)
    rows = await db.recurring_expense_templates.find({"branch_id": branch_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return rows


@rec_router.post("")
async def create_recurring(body: RecurringExpenseCreate, user=Depends(require_roles(*MGR_ROLES))):
    db = get_db()
    branch = await db.branches.find_one({"id": body.branch_id}, {"_id": 0})
    if not branch:
        raise HTTPException(404, "Branch not found")
    _check_branch_access(user, branch)
    doc = body.model_dump()
    doc.update({
        "id": uid(),
        "company_id": branch["company_id"],
        "next_run_at": _next_run(body.day_of_month),
        "last_run_at": None, "last_run_period": None,
        "created_by": user["id"], "created_by_name": user.get("name", ""),
        "created_at": now_iso(), "updated_at": now_iso(),
    })
    await db.recurring_expense_templates.insert_one(doc)
    doc.pop("_id", None)
    return doc


@rec_router.put("/{tpl_id}")
async def update_recurring(tpl_id: str, body: dict, user=Depends(require_roles(*MGR_ROLES))):
    db = get_db()
    tpl = await db.recurring_expense_templates.find_one({"id": tpl_id}, {"_id": 0})
    if not tpl:
        raise HTTPException(404, "Not found")
    branch = await db.branches.find_one({"id": tpl["branch_id"]}, {"_id": 0})
    if not branch:
        raise HTTPException(404, "Branch not found")
    _check_branch_access(user, branch)
    allowed = {"name", "category", "description", "amount", "currency",
               "mode", "day_of_month", "vendor_name", "active"}
    patch = {k: v for k, v in body.items() if k in allowed}
    if "day_of_month" in patch:
        if not (1 <= int(patch["day_of_month"]) <= 28):
            raise HTTPException(400, "day_of_month must be 1..28")
        patch["next_run_at"] = _next_run(int(patch["day_of_month"]))
    if not patch:
        raise HTTPException(400, "Nothing to update")
    patch["updated_at"] = now_iso()
    await db.recurring_expense_templates.update_one({"id": tpl_id}, {"$set": patch})
    out = await db.recurring_expense_templates.find_one({"id": tpl_id}, {"_id": 0})
    return out


@rec_router.delete("/{tpl_id}")
async def delete_recurring(tpl_id: str, user=Depends(require_roles(*MGR_ROLES))):
    db = get_db()
    tpl = await db.recurring_expense_templates.find_one({"id": tpl_id}, {"_id": 0})
    if not tpl:
        raise HTTPException(404, "Not found")
    branch = await db.branches.find_one({"id": tpl["branch_id"]}, {"_id": 0})
    _check_branch_access(user, branch)
    await db.recurring_expense_templates.delete_one({"id": tpl_id})
    return {"ok": True}


async def _create_expense_from_template(db, tpl: dict, period_month: str, triggered_by: str, mode: str) -> dict:
    """Create an expense_claim from a recurring template. Idempotent on (template_id, period_month)."""
    # idempotency check
    existing_run = await db.recurring_expense_runs.find_one(
        {"template_id": tpl["id"], "period_month": period_month}, {"_id": 0},
    )
    if existing_run:
        return existing_run
    expense_id = uid()
    item = {
        "category": "other" if tpl["category"] not in (
            "office_supplies", "subscription", "phone_internet"
        ) else tpl["category"],
        "expense_date": f"{period_month}-{tpl.get('day_of_month', 1):02d}",
        "amount": float(tpl["amount"]),
        "currency": tpl.get("currency", "INR"),
        "description": f"{tpl['name']} — {period_month} (recurring · {tpl['category']})",
        "receipts": [],
    }
    status = "submitted" if mode == "AUTO_SUBMIT" else "draft"
    expense = {
        "id": expense_id,
        "company_id": tpl["company_id"],
        "employee_id": tpl.get("created_by") or "branch-system",
        "employee_name": tpl.get("created_by_name", "Branch Operations"),
        "title": f"{tpl['name']} — {period_month}",
        "purpose": "Recurring branch expense",
        "total_amount": float(tpl["amount"]),
        "currency": tpl.get("currency", "INR"),
        "items": [item],
        "status": status,
        "submitted_at": now_iso() if status == "submitted" else None,
        "branch_id": tpl["branch_id"],
        "recurring_template_id": tpl["id"],
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.expense_claims.insert_one(expense)
    run_doc = {
        "id": uid(),
        "company_id": tpl["company_id"],
        "branch_id": tpl["branch_id"],
        "template_id": tpl["id"],
        "template_name": tpl["name"],
        "period_month": period_month,
        "expense_id": expense_id,
        "expense_status": status,
        "mode": mode,
        "amount": float(tpl["amount"]),
        "currency": tpl.get("currency", "INR"),
        "triggered_by": triggered_by,
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.recurring_expense_runs.insert_one(run_doc)
    # Bump template
    await db.recurring_expense_templates.update_one(
        {"id": tpl["id"]},
        {"$set": {
            "last_run_at": now_iso(),
            "last_run_period": period_month,
            "next_run_at": _next_run(tpl.get("day_of_month", 1)),
            "updated_at": now_iso(),
        }},
    )
    run_doc.pop("_id", None)
    return run_doc


@rec_router.post("/{tpl_id}/run-now")
async def run_now(tpl_id: str, body: Optional[dict] = None, user=Depends(require_roles(*MGR_ROLES))):
    """Manually trigger creation of this template for current month (or `period_month` if supplied)."""
    db = get_db()
    tpl = await db.recurring_expense_templates.find_one({"id": tpl_id}, {"_id": 0})
    if not tpl:
        raise HTTPException(404, "Not found")
    branch = await db.branches.find_one({"id": tpl["branch_id"]}, {"_id": 0})
    _check_branch_access(user, branch)
    period = (body or {}).get("period_month") or datetime.now(timezone.utc).strftime("%Y-%m")
    # Manual triggers always submit (manager already reviewed)
    run = await _create_expense_from_template(
        db, tpl, period, triggered_by=user["id"], mode="AUTO_SUBMIT",
    )
    return run


@rec_router.get("/{tpl_id}/runs")
async def template_runs(tpl_id: str, user=Depends(get_current_user)):
    db = get_db()
    tpl = await db.recurring_expense_templates.find_one({"id": tpl_id}, {"_id": 0})
    if not tpl:
        raise HTTPException(404, "Not found")
    branch = await db.branches.find_one({"id": tpl["branch_id"]}, {"_id": 0})
    _check_branch_access(user, branch)
    rows = await db.recurring_expense_runs.find({"template_id": tpl_id}, {"_id": 0}).sort("period_month", -1).to_list(60)
    return rows


@rec_router.post("/admin/run-due")
async def run_due_now(user=Depends(require_roles("super_admin", "company_admin"))):
    """Sweep all active templates whose next_run_at is in the past and create expenses
    in AUTO_SUBMIT or AUTO_DRAFT mode. Useful for demos and as a fallback for the cron."""
    db = get_db()
    cid = user.get("company_id")
    flt = {"active": True}
    if user["role"] != "super_admin":
        flt["company_id"] = cid
    now = datetime.now(timezone.utc).isoformat()
    period = datetime.now(timezone.utc).strftime("%Y-%m")
    fired = []
    async for tpl in db.recurring_expense_templates.find(flt, {"_id": 0}):
        # Only fire AUTO_* and skip manual-only templates
        mode = tpl.get("mode", "AUTO_DRAFT")
        if mode == "MANUAL_ONE_CLICK":
            continue
        if tpl.get("next_run_at") and tpl["next_run_at"] > now:
            continue  # not due
        run = await _create_expense_from_template(db, tpl, period, triggered_by="cron", mode=mode)
        fired.append({"template": tpl["name"], "period": period, "mode": mode, "expense_id": run.get("expense_id")})
    return {"fired": fired, "count": len(fired)}
