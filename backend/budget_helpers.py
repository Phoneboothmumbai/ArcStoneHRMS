"""Phase 2 follow-up — Budget pre-flight helpers shared across expense / RFQ / PO routes.

Why a separate module?  Both the `/api/budgets/check` HTTP endpoint and the
inline pre-flight on /api/expenses, /api/procurement/po, etc. need the same
matching + utilization logic. Importing route handlers from each other creates
circular imports — the helpers below are pure functions over the DB.
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional, Tuple


def fy_label_for(date: Optional[datetime] = None, fy_start_month: int = 4) -> str:
    """Indian default: FY runs April → March. April 2026 → "FY2027"."""
    d = date or datetime.now(timezone.utc)
    fy_start_year = d.year if d.month >= fy_start_month else d.year - 1
    return f"FY{fy_start_year + 1}"


def _specificity(env: dict) -> int:
    return (
        (1 if env.get("department_id") else 0) +
        (1 if env.get("cost_center") else 0) +
        (1 if env.get("category") else 0)
    )


async def utilization(db, env: dict) -> float:
    """Sum approved/submitted expense_claims + non-cancelled POs scoped to this envelope's branch."""
    cid = env["company_id"]
    branch_id = env["branch_id"]
    total = 0.0
    flt_exp = {
        "company_id": cid, "branch_id": branch_id,
        "status": {"$in": ["approved", "submitted", "reimbursed", "awaiting_approval"]},
    }
    async for c in db.expense_claims.find(flt_exp, {"_id": 0, "total_amount": 1}):
        total += float(c.get("total_amount", 0) or 0)
    flt_po = {
        "company_id": cid,
        "delivery_location": {"$regex": branch_id[:8], "$options": "i"},
        "status": {"$in": ["approved", "sent", "acknowledged", "in_transit",
                           "partially_received", "received", "invoiced", "paid",
                           "awaiting_approval"]},
    }
    async for p in db.purchase_orders.find(flt_po, {"_id": 0, "grand_total": 1}):
        total += float(p.get("grand_total", 0) or 0)
    return round(total, 2)


async def check_budget(
    db, *,
    company_id: str,
    branch_id: Optional[str],
    department_id: Optional[str] = None,
    cost_center: Optional[str] = None,
    category: Optional[str] = None,
    amount: float = 0.0,
) -> dict:
    """Pre-flight budget check. Returns dict shaped like the `/api/budgets/check` response.

    If branch_id is missing or no envelope matches, returns a permissive result
    (block=False, matched=False, message='no envelope · allowed').
    """
    if not branch_id or amount <= 0:
        return {"matched": False, "block": False, "warn": False,
                "overridable": True, "amount": amount,
                "message": "No branch scope or zero amount — budget check skipped."}
    fy = fy_label_for()
    base = {"company_id": company_id, "branch_id": branch_id,
            "status": "active", "fiscal_year": fy}
    candidates = await db.budget_envelopes.find(base, {"_id": 0}).to_list(50)

    def matches(env):
        for k, v in [("department_id", department_id),
                     ("cost_center", cost_center),
                     ("category", category)]:
            if env.get(k) and env[k] != v:
                return False
        return True

    matched = [e for e in candidates if matches(e)]
    if not matched:
        return {"matched": False, "block": False, "warn": False,
                "overridable": True, "amount": amount,
                "message": f"No active envelope (branch · {fy}) — submission allowed."}
    matched.sort(key=_specificity, reverse=True)
    env = matched[0]
    util = await utilization(db, env)
    after = util + amount
    pct_after = (after / env["amount"]) * 100 if env["amount"] else 0.0
    block = pct_after > env.get("hard_block_pct", 100.0)
    warn = pct_after > env.get("soft_warn_pct", 80.0) and not block
    return {
        "matched": True,
        "envelope_id": env["id"],
        "envelope_name": env["name"],
        "envelope_total": env["amount"],
        "utilized_before": round(util, 2),
        "utilized_after": round(after, 2),
        "remaining_before": round(env["amount"] - util, 2),
        "remaining_after": round(env["amount"] - after, 2),
        "pct_after": round(pct_after, 1),
        "block": block, "warn": warn,
        "overridable": bool(env.get("allow_override", True)),
        "amount": amount,
        "message": (
            f"Hard block — would exceed {env['name']} by ₹{round(after - env['amount'], 2):,.0f}."
            if block else
            f"Soft warn — would push {env['name']} to {pct_after:.1f}%."
            if warn else
            f"OK — {env['name']} would be at {pct_after:.1f}%."
        ),
    }
