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
policy_router = APIRouter(prefix="/api/expense-policies", tags=["expense-policies"], dependencies=_gate)

ADMIN = ("super_admin", "company_admin", "country_head", "region_head")

MAX_RECEIPT_BYTES = 2 * 1024 * 1024  # 2MB

# Default per-item caps (INR) — applied only if company has no policy row in DB.
# Prevents an employee from submitting a ₹50k "meals" item without anyone noticing.
# HR can override via POST /api/expense-policies.
_DEFAULT_POLICY = {
    "meals":          {"max_per_item": 2_000,   "receipt_required_above": 500},
    "travel_taxi":    {"max_per_item": 5_000,   "receipt_required_above": 500},
    "travel_mileage": {"max_per_item": 10_000,  "receipt_required_above": 0},
    "travel_hotel":   {"max_per_item": 15_000,  "receipt_required_above": 2_000},
    "travel_flight":  {"max_per_item": 50_000,  "receipt_required_above": 2_000},
    "fuel":           {"max_per_item": 3_000,   "receipt_required_above": 500},
    "office_supplies":{"max_per_item": 5_000,   "receipt_required_above": 1_000},
    "subscription":   {"max_per_item": 20_000,  "receipt_required_above": 1_000},
    "training":       {"max_per_item": 50_000,  "receipt_required_above": 1_000},
    "phone_internet": {"max_per_item": 2_000,   "receipt_required_above": 500},
    "medical":        {"max_per_item": 20_000,  "receipt_required_above": 1_000},
    "client_meeting": {"max_per_item": 5_000,   "receipt_required_above": 1_000},
    "travel_per_diem":{"max_per_item": 2_500,   "receipt_required_above": 0},
    "other":          {"max_per_item": 5_000,   "receipt_required_above": 500},
}


async def _load_policy(db, company_id: str) -> dict:
    """Fetch per-category caps: DB override → default fallback."""
    row = await db.expense_policies.find_one({"company_id": company_id}, {"_id": 0}) or {}
    stored = {p["category"]: p for p in row.get("rules", [])}
    merged = {}
    for cat, default in _DEFAULT_POLICY.items():
        merged[cat] = {**default, **stored.get(cat, {})}
    return merged


def _enforce_policy(items: list, policy: dict) -> None:
    """Raise 422 if any item breaches the cap or lacks a receipt.
    Runs BEFORE the ExpenseClaim is saved — failure = no DB write."""
    for idx, it in enumerate(items):
        rule = policy.get(it["category"])
        if not rule:
            continue
        amt = float(it.get("amount") or 0)
        cap = rule.get("max_per_item")
        if cap and amt > cap:
            raise HTTPException(
                422,
                f"Item #{idx + 1} ({it['category']}): ₹{amt:,.0f} exceeds per-item cap of ₹{cap:,.0f}. "
                f"Ask HR to raise the cap before resubmitting.",
            )
        thresh = rule.get("receipt_required_above")
        if thresh and amt > thresh and not it.get("receipts"):
            raise HTTPException(
                422,
                f"Item #{idx + 1} ({it['category']}): receipt is mandatory for amounts above ₹{thresh:,.0f}.",
            )


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
    # Policy-cap enforcement — blocks submission if caps breached or receipts missing.
    policy = await _load_policy(db, user["company_id"])
    _enforce_policy(items, policy)
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


@expenses_router.get("/{eid}/voucher-pdf")
async def voucher_pdf(eid: str, user=Depends(get_current_user)):
    """Download approved-expense voucher as a signed PDF."""
    from fastapi.responses import Response
    from pdf_render import render_expense_voucher_pdf
    db = get_db()
    cid = user.get("company_id")
    claim = await db.expense_claims.find_one({"id": eid, "company_id": cid}, {"_id": 0})
    if not claim:
        raise HTTPException(404, "Claim not found")
    if user["role"] == "employee" and claim.get("employee_id") != user.get("employee_id"):
        raise HTTPException(403, "Forbidden")
    if claim.get("status") not in ("approved", "reimbursed"):
        raise HTTPException(400, "Voucher is generated only after the claim is approved")
    company = await db.companies.find_one({"id": cid}, {"_id": 0}) or {}
    settings = await db.company_settings.find_one({"company_id": cid}, {"_id": 0}) or {}
    pdf_bytes = render_expense_voucher_pdf(
        claim, company_name=company.get("name", "Company"),
        legal_entity=settings.get("legal_entity_name") or company.get("legal_entity_name"),
        logo_base64=settings.get("logo_base64"),
    )
    fname = f"voucher_{(claim.get('id') or '')[:8]}.pdf"
    return Response(content=pdf_bytes, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename={fname}"})


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



# ---------------------------------------------------------------------------
# Expense policies — per-company cap & receipt-threshold overrides
# ---------------------------------------------------------------------------
@policy_router.get("")
async def get_policy(user=Depends(get_current_user)):
    """Return merged policy (defaults + overrides) so the UI can show
    'cap left for this month' hints before the user submits."""
    db = get_db()
    return await _load_policy(db, user.get("company_id"))


@policy_router.put("")
async def upsert_policy(body: dict, user=Depends(require_roles(*ADMIN))):
    """HR overrides one or more category caps. Body shape:
        { "rules": [ {"category": "meals", "max_per_item": 3000,
                      "receipt_required_above": 300}, ... ] }
    Unspecified categories keep defaults."""
    db = get_db()
    rules = body.get("rules") or []
    for r in rules:
        if r.get("category") not in _DEFAULT_POLICY:
            raise HTTPException(422, f"Unknown category: {r.get('category')}")
    await db.expense_policies.update_one(
        {"company_id": user["company_id"]},
        {"$set": {"rules": rules, "updated_at": now_iso(), "updated_by": user["id"]}},
        upsert=True,
    )
    return await _load_policy(db, user["company_id"])
