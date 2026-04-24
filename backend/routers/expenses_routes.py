"""Phase 1H — Expense claims + travel requests."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi import Depends as _Depends

from auth import get_current_user, require_roles
from db import get_db
from models import now_iso
from models_expenses import (
    ExpenseClaim, ExpenseClaimCreate, TravelRequest, TravelRequestCreate,
)
from tenant import requires_module

_gate = [_Depends(requires_module("expense"))]

expenses_router = APIRouter(prefix="/api/expenses", tags=["expenses"], dependencies=_gate)
travel_router = APIRouter(prefix="/api/travel-requests", tags=["travel-requests"], dependencies=_gate)

ADMIN = ("super_admin", "company_admin", "country_head", "region_head")

MAX_RECEIPT_BYTES = 2 * 1024 * 1024  # 2MB


def _sum_items(items: list[dict]) -> float:
    return round(sum((i.get("amount") or 0) for i in items), 2)


# ---------------------------------------------------------------------------
# Expense claims
# ---------------------------------------------------------------------------
@expenses_router.post("")
async def create_expense(body: ExpenseClaimCreate, user=Depends(get_current_user)):
    db = get_db()
    if not user.get("employee_id"):
        raise HTTPException(400, "Not linked to an employee")
    # Basic receipt-size guard (base64 is ~33% larger than raw)
    for it in body.items:
        for r in it.receipts:
            if len(r.base64_data) > int(MAX_RECEIPT_BYTES * 1.4):
                raise HTTPException(400, f"Receipt '{r.file_name}' exceeds 2 MB limit")
    items = [i.model_dump() for i in body.items]
    doc = ExpenseClaim(
        company_id=user["company_id"], employee_id=user["employee_id"],
        employee_name=user["name"], title=body.title, purpose=body.purpose,
        project_code=body.project_code, travel_request_id=body.travel_request_id,
        items=items, currency=body.currency, total_amount=_sum_items(items),
    ).model_dump()
    await db.expense_claims.insert_one(doc)
    doc.pop("_id", None)
    return doc


@expenses_router.get("")
async def list_expenses(
    status: Optional[str] = None,
    employee_id: Optional[str] = None,
    user=Depends(get_current_user),
):
    db = get_db()
    cid = user.get("company_id")
    flt: dict = {"company_id": cid}
    if status:
        flt["status"] = status
    if user["role"] not in ADMIN:
        flt["employee_id"] = user.get("employee_id")
    elif employee_id:
        flt["employee_id"] = employee_id
    rows = await db.expense_claims.find(flt, {"_id": 0}).sort("created_at", -1).to_list(2000)
    # Strip heavy base64 from list view
    for r in rows:
        for it in r.get("items", []):
            for rec in it.get("receipts", []):
                rec.pop("base64_data", None)
    return rows


@expenses_router.get("/{eid}")
async def get_expense(eid: str, user=Depends(get_current_user)):
    db = get_db()
    doc = await db.expense_claims.find_one({"id": eid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    if user["role"] == "super_admin":
        return doc
    if user.get("company_id") != doc["company_id"]:
        raise HTTPException(403, "Forbidden")
    if user["role"] not in ADMIN and user.get("employee_id") != doc["employee_id"]:
        raise HTTPException(403, "Forbidden")
    return doc


@expenses_router.post("/{eid}/submit")
async def submit_expense(eid: str, user=Depends(get_current_user)):
    db = get_db()
    doc = await db.expense_claims.find_one({"id": eid, "company_id": user.get("company_id")}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    if doc.get("employee_id") != user.get("employee_id"):
        raise HTTPException(403, "Forbidden")
    if doc["status"] != "draft":
        raise HTTPException(400, f"Can't submit from status {doc['status']}")
    # TODO: wire into approval engine (Phase 1H follow-up).
    # For MVP we transition to "submitted" and rely on HR/admin to decide via /decide.
    await db.expense_claims.update_one(
        {"id": eid}, {"$set": {"status": "submitted", "submitted_at": now_iso(), "updated_at": now_iso()}},
    )
    return await db.expense_claims.find_one({"id": eid}, {"_id": 0})


@expenses_router.post("/{eid}/decide")
async def decide_expense(eid: str, body: dict, user=Depends(require_roles(*ADMIN))):
    """Simple admin approve/reject for MVP. Full approval chain wired in a follow-up."""
    db = get_db()
    doc = await db.expense_claims.find_one({"id": eid, "company_id": user.get("company_id")}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    if doc["status"] != "submitted":
        raise HTTPException(400, "Only submitted claims can be decided")
    decision = body.get("decision")
    if decision == "approve":
        patch = {"status": "approved", "updated_at": now_iso()}
    elif decision == "reject":
        patch = {"status": "rejected", "rejection_reason": body.get("reason"), "updated_at": now_iso()}
    else:
        raise HTTPException(400, "decision must be 'approve' or 'reject'")
    await db.expense_claims.update_one({"id": eid}, {"$set": patch})
    return await db.expense_claims.find_one({"id": eid}, {"_id": 0})


@expenses_router.post("/{eid}/mark-reimbursed")
async def mark_reimbursed(eid: str, body: dict, user=Depends(require_roles(*ADMIN))):
    db = get_db()
    r = await db.expense_claims.update_one(
        {"id": eid, "company_id": user.get("company_id"), "status": "approved"},
        {"$set": {
            "status": "reimbursed",
            "reimbursed_in_run_id": body.get("run_id"),
            "reimbursed_at": now_iso(),
            "updated_at": now_iso(),
        }},
    )
    if r.matched_count == 0:
        raise HTTPException(400, "Only approved claims can be marked reimbursed")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Travel requests
# ---------------------------------------------------------------------------
@travel_router.post("")
async def create_travel(body: TravelRequestCreate, user=Depends(get_current_user)):
    db = get_db()
    if not user.get("employee_id"):
        raise HTTPException(400, "Not linked to an employee")
    doc = TravelRequest(
        company_id=user["company_id"], employee_id=user["employee_id"],
        employee_name=user["name"], **body.model_dump(),
    ).model_dump()
    await db.travel_requests.insert_one(doc)
    doc.pop("_id", None)
    return doc


@travel_router.get("")
async def list_travel(
    status: Optional[str] = None,
    user=Depends(get_current_user),
):
    db = get_db()
    flt: dict = {"company_id": user.get("company_id")}
    if status:
        flt["status"] = status
    if user["role"] not in ADMIN:
        flt["employee_id"] = user.get("employee_id")
    rows = await db.travel_requests.find(flt, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return rows


@travel_router.post("/{tid}/submit")
async def submit_travel(tid: str, user=Depends(get_current_user)):
    db = get_db()
    doc = await db.travel_requests.find_one({"id": tid, "company_id": user.get("company_id")}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    if doc.get("employee_id") != user.get("employee_id"):
        raise HTTPException(403, "Forbidden")
    await db.travel_requests.update_one(
        {"id": tid}, {"$set": {"status": "submitted", "updated_at": now_iso()}},
    )
    return await db.travel_requests.find_one({"id": tid}, {"_id": 0})


@travel_router.post("/{tid}/decide")
async def decide_travel(tid: str, body: dict, user=Depends(require_roles(*ADMIN))):
    db = get_db()
    decision = body.get("decision")
    patch: dict = {"updated_at": now_iso()}
    if decision == "approve":
        patch["status"] = "approved"
    elif decision == "reject":
        patch["status"] = "rejected"
        patch["notes"] = body.get("reason")
    elif decision == "book":
        patch["status"] = "booked"
        patch["booking_reference"] = body.get("booking_reference")
    elif decision == "complete":
        patch["status"] = "completed"
    else:
        raise HTTPException(400, "Invalid decision")
    r = await db.travel_requests.update_one(
        {"id": tid, "company_id": user.get("company_id")}, {"$set": patch},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Not found")
    return await db.travel_requests.find_one({"id": tid}, {"_id": 0})
