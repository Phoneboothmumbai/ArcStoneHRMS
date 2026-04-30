"""Phase 2 — Budget Module routes.

Endpoints:
  GET    /api/budgets                          List envelopes (filterable)
  POST   /api/budgets                          Create envelope
  GET    /api/budgets/{id}                     Get one with current utilization
  PUT    /api/budgets/{id}                     Update
  DELETE /api/budgets/{id}                     Archive (soft-delete by status)
  POST   /api/budgets/check                    Pre-flight check before submitting an expense/PO
  GET    /api/budgets/dashboard                Aggregated summary across envelopes
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional, List, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query
from auth import require_roles, get_current_user
from db import get_db
from models import now_iso, uid
from models_budget import BudgetEnvelopeCreate, BudgetCheckRequest

router = APIRouter(prefix="/api/budgets", tags=["budgets"])

MGR = ("super_admin", "company_admin", "country_head", "region_head", "branch_manager")


def _fy_for(date: Optional[datetime] = None, fy_start_month: int = 4) -> str:
    """Indian default: FY runs April → March. FY2026 = Apr 2026 → Mar 2027."""
    d = date or datetime.now(timezone.utc)
    year = d.year if d.month >= fy_start_month else d.year - 1
    return f"FY{year + 1}"   # FY26 means ending in Mar 2026 → confusing; use end-year style "FY2026"


def _fy_label_now() -> str:
    d = datetime.now(timezone.utc)
    fy_start = d.year if d.month >= 4 else d.year - 1
    return f"FY{fy_start + 1}"  # e.g. FY2026 covers Apr-2025 → Mar-2026 (Indian convention)


def _scope_match_filter(branch_id: str, department_id: Optional[str],
                        cost_center: Optional[str], category: Optional[str]) -> dict:
    """A query that finds envelopes matching this scope, where null fields = wildcard."""
    return {
        "branch_id": branch_id,
        "department_id": {"$in": [department_id, None]} if department_id else None,
        "cost_center": {"$in": [cost_center, None]} if cost_center else None,
        "category": {"$in": [category, None]} if category else None,
    }


def _specificity(env: dict) -> int:
    """Higher score = more specific match. Used to pick the best envelope when multiple apply."""
    return (
        (1 if env.get("department_id") else 0) +
        (1 if env.get("cost_center") else 0) +
        (1 if env.get("category") else 0)
    )


async def _utilization(db, env: dict) -> float:
    """Sum approved expense claims + non-cancelled POs scoped to this envelope's
    branch/department/category. Lightweight; aggregations would be heavier."""
    cid = env["company_id"]
    branch_id = env["branch_id"]
    flt_exp = {
        "company_id": cid,
        "branch_id": branch_id,
        "status": {"$in": ["approved", "submitted", "reimbursed"]},
    }
    # Expenses
    total = 0.0
    async for c in db.expense_claims.find(flt_exp, {"_id": 0, "total_amount": 1}):
        total += float(c.get("total_amount", 0) or 0)
    # POs
    flt_po = {
        "company_id": cid,
        "delivery_location": {"$regex": branch_id[:8], "$options": "i"},
        "status": {"$in": ["approved", "sent", "acknowledged", "in_transit",
                           "partially_received", "received", "invoiced", "paid"]},
    }
    async for p in db.purchase_orders.find(flt_po, {"_id": 0, "grand_total": 1}):
        total += float(p.get("grand_total", 0) or 0)
    return round(total, 2)


@router.get("")
async def list_envelopes(
    branch_id: Optional[str] = Query(None),
    fiscal_year: Optional[str] = Query(None),
    user=Depends(get_current_user),
):
    db = get_db()
    cid = user.get("company_id")
    flt = {} if user["role"] == "super_admin" else {"company_id": cid}
    if branch_id:
        flt["branch_id"] = branch_id
    if fiscal_year:
        flt["fiscal_year"] = fiscal_year
    rows = await db.budget_envelopes.find(flt, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Annotate utilization
    for env in rows:
        u = await _utilization(db, env)
        env["utilized"] = u
        env["remaining"] = round(env["amount"] - u, 2)
        env["utilization_pct"] = round((u / env["amount"]) * 100, 1) if env["amount"] else 0.0
    return rows


@router.get("/dashboard")
async def dashboard(fiscal_year: Optional[str] = Query(None), user=Depends(get_current_user)):
    """Aggregate dashboard: total budget, total utilized, count by branch."""
    db = get_db()
    cid = user.get("company_id")
    if not cid and user["role"] != "super_admin":
        raise HTTPException(403, "No company scope")
    flt = {"status": "active"} if user["role"] == "super_admin" else {"company_id": cid, "status": "active"}
    if fiscal_year:
        flt["fiscal_year"] = fiscal_year
    rows = await db.budget_envelopes.find(flt, {"_id": 0}).to_list(500)
    total_amount = 0.0
    total_utilized = 0.0
    by_branch = {}
    for env in rows:
        u = await _utilization(db, env)
        total_amount += float(env["amount"])
        total_utilized += u
        bid = env["branch_id"]
        by_branch.setdefault(bid, {"branch_id": bid, "amount": 0.0, "utilized": 0.0, "count": 0})
        by_branch[bid]["amount"] += env["amount"]
        by_branch[bid]["utilized"] += u
        by_branch[bid]["count"] += 1
    return {
        "fiscal_year": fiscal_year or _fy_label_now(),
        "envelope_count": len(rows),
        "total_amount": round(total_amount, 2),
        "total_utilized": round(total_utilized, 2),
        "total_remaining": round(total_amount - total_utilized, 2),
        "utilization_pct": round((total_utilized / total_amount) * 100, 1) if total_amount else 0.0,
        "by_branch": list(by_branch.values()),
    }


@router.post("")
async def create_envelope(body: BudgetEnvelopeCreate, user=Depends(require_roles(*MGR))):
    db = get_db()
    cid = user.get("company_id")
    if not cid:
        raise HTTPException(400, "Company scope required")
    branch = await db.branches.find_one({"id": body.branch_id, "company_id": cid}, {"_id": 0})
    if not branch:
        raise HTTPException(404, "Branch not found")
    if body.amount <= 0:
        raise HTTPException(400, "amount must be > 0")
    if not (0 <= body.soft_warn_pct <= 100):
        raise HTTPException(400, "soft_warn_pct must be 0..100")
    if not (0 <= body.hard_block_pct <= 200):
        raise HTTPException(400, "hard_block_pct must be 0..200")
    doc = body.model_dump()
    doc.update({
        "id": uid(),
        "company_id": cid,
        "status": "active",
        "created_by": user["id"], "created_by_name": user.get("name"),
        "created_at": now_iso(), "updated_at": now_iso(),
    })
    await db.budget_envelopes.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/{env_id}")
async def get_envelope(env_id: str, user=Depends(get_current_user)):
    db = get_db()
    env = await db.budget_envelopes.find_one({"id": env_id}, {"_id": 0})
    if not env:
        raise HTTPException(404, "Not found")
    if user["role"] != "super_admin" and user.get("company_id") != env["company_id"]:
        raise HTTPException(403, "Forbidden")
    u = await _utilization(db, env)
    env["utilized"] = u
    env["remaining"] = round(env["amount"] - u, 2)
    env["utilization_pct"] = round((u / env["amount"]) * 100, 1) if env["amount"] else 0.0
    return env


@router.put("/{env_id}")
async def update_envelope(env_id: str, body: dict, user=Depends(require_roles(*MGR))):
    db = get_db()
    cid = user.get("company_id")
    allowed = {"name", "description", "department_id", "cost_center", "category",
               "amount", "currency", "soft_warn_pct", "hard_block_pct",
               "allow_override", "status", "period_label"}
    patch = {k: v for k, v in body.items() if k in allowed}
    if not patch:
        raise HTTPException(400, "Nothing to update")
    patch["updated_at"] = now_iso()
    res = await db.budget_envelopes.update_one(
        {"id": env_id, "company_id": cid}, {"$set": patch},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Not found")
    out = await db.budget_envelopes.find_one({"id": env_id}, {"_id": 0})
    return out


@router.delete("/{env_id}")
async def archive_envelope(env_id: str, user=Depends(require_roles(*MGR))):
    db = get_db()
    cid = user.get("company_id")
    res = await db.budget_envelopes.update_one(
        {"id": env_id, "company_id": cid},
        {"$set": {"status": "archived", "updated_at": now_iso()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}


@router.post("/check")
async def budget_check(body: BudgetCheckRequest, user=Depends(get_current_user)):
    """Pre-flight: would committing `amount` to this scope breach a budget?"""
    db = get_db()
    cid = user.get("company_id")
    if not cid:
        raise HTTPException(400, "Company scope required")
    if body.amount < 0:
        raise HTTPException(400, "amount must be ≥ 0")
    # Find candidate envelopes (active, current FY, scope-compatible)
    fy = _fy_label_now()
    base = {"company_id": cid, "branch_id": body.branch_id, "status": "active",
            "fiscal_year": fy}
    candidates = await db.budget_envelopes.find(base, {"_id": 0}).to_list(50)

    def matches(env):
        # null on env = wildcard for that dimension
        for k, v in [("department_id", body.department_id),
                     ("cost_center", body.cost_center),
                     ("category", body.category)]:
            if env.get(k) and env[k] != v:
                return False
        return True

    matched = [e for e in candidates if matches(e)]
    if not matched:
        return {
            "matched": False, "amount": body.amount,
            "block": False, "warn": False, "overridable": True,
            "message": f"No active budget envelope for branch · FY {fy}. Submission allowed.",
        }
    # Pick the most-specific
    matched.sort(key=_specificity, reverse=True)
    env = matched[0]
    utilized_before = await _utilization(db, env)
    utilized_after = utilized_before + body.amount
    remaining_before = env["amount"] - utilized_before
    remaining_after = env["amount"] - utilized_after
    pct_after = (utilized_after / env["amount"]) * 100 if env["amount"] else 0.0
    block = pct_after > env.get("hard_block_pct", 100.0)
    warn = pct_after > env.get("soft_warn_pct", 80.0) and not block
    overridable = bool(env.get("allow_override", True))
    if block:
        msg = (f"Hard block — would exceed envelope by ₹{round(utilized_after - env['amount'], 2):,.0f}. "
               + ("An admin can override." if overridable else "No override allowed."))
    elif warn:
        msg = f"Soft warn — would push utilization to {pct_after:.1f}%."
    else:
        msg = f"OK — utilization will be {pct_after:.1f}%."
    return {
        "envelope_id": env["id"], "envelope_name": env["name"],
        "matched": True, "amount": body.amount,
        "envelope_total": env["amount"],
        "utilized_before": round(utilized_before, 2),
        "utilized_after": round(utilized_after, 2),
        "remaining_before": round(remaining_before, 2),
        "remaining_after": round(remaining_after, 2),
        "pct_after": round(pct_after, 1),
        "block": block, "warn": warn, "overridable": overridable,
        "message": msg,
    }
