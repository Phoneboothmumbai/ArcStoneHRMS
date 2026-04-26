"""Statutory data: state-wise Labour Welfare Fund (LWF) + Professional Tax (PT)
slabs, plus multi-location branch state mapping. Drives payroll-time deductions.

LWF rates source: state Labour Welfare Board notifications. These values can
be edited per company by HR via /api/lwf-rules. The ones below are the
out-of-the-box defaults used to seed every new company.

NOTE: PT slabs vary by gross monthly. We ship a simple per-state default but
the rules engine intentionally allows HR to override.
"""
from __future__ import annotations

from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from auth import get_current_user, require_roles
from db import get_db
from models import BaseDoc, now_iso, uid

HR = ("super_admin", "company_admin", "country_head", "region_head")


# ----------------------------------------------------------------------
# Default LWF dataset (employee + employer contributions, per state, per cycle)
# Cycle = "monthly" or "half_yearly" or "yearly". Most states are half-yearly.
# Amounts are INR.
# ----------------------------------------------------------------------
DEFAULT_LWF_STATES = [
    # (state_code, state_name, employee_amt, employer_amt, cycle, deduction_months[1-12])
    ("IN-AP", "Andhra Pradesh",   30,  70,  "yearly",      [12]),
    ("IN-AS", "Assam",             3,   6,  "monthly",     list(range(1, 13))),
    ("IN-CH", "Chandigarh",        5,  20,  "monthly",     list(range(1, 13))),
    ("IN-CT", "Chhattisgarh",     15,  45,  "half_yearly", [6, 12]),
    ("IN-DL", "Delhi",             0.75, 2.25, "half_yearly", [6, 12]),
    ("IN-GA", "Goa",              60, 180,  "half_yearly", [6, 12]),
    ("IN-GJ", "Gujarat",           6,  12,  "half_yearly", [6, 12]),
    ("IN-HR", "Haryana",          31,  62,  "monthly",     list(range(1, 13))),
    ("IN-KA", "Karnataka",        20,  40,  "yearly",      [12]),
    ("IN-KL", "Kerala",            4,   8,  "monthly",     list(range(1, 13))),
    ("IN-MP", "Madhya Pradesh",   10,  30,  "half_yearly", [6, 12]),
    ("IN-MH", "Maharashtra",      25,  75,  "half_yearly", [6, 12]),  # MLWF
    ("IN-OR", "Odisha",           20,  40,  "half_yearly", [6, 12]),
    ("IN-PB", "Punjab",            5,  20,  "monthly",     list(range(1, 13))),
    ("IN-TG", "Telangana",         2,   5,  "yearly",      [12]),
    ("IN-TN", "Tamil Nadu",       20,  40,  "yearly",      [12]),
    ("IN-WB", "West Bengal",       3,  15,  "half_yearly", [6, 12]),
]

# States WITHOUT LWF (for completeness — UI shows them as "Not applicable"):
LWF_NOT_APPLICABLE = ["IN-AR", "IN-BR", "IN-JK", "IN-JH", "IN-MN", "IN-ML", "IN-MZ",
                      "IN-NL", "IN-RJ", "IN-SK", "IN-TR", "IN-UT", "IN-UP", "IN-LD",
                      "IN-AN", "IN-DN", "IN-PY", "IN-LA"]


class LWFRule(BaseDoc):
    company_id: str
    state_code: str               # ISO 3166-2 e.g. "IN-MH"
    state_name: str
    employee_amount: float        # INR per employee per cycle
    employer_amount: float
    cycle: Literal["monthly", "half_yearly", "yearly"] = "half_yearly"
    deduction_months: List[int] = Field(default_factory=list)  # which calendar months trigger
    applicable: bool = True       # HR can disable per state
    notes: Optional[str] = None


class LWFRuleUpdate(BaseModel):
    employee_amount: Optional[float] = None
    employer_amount: Optional[float] = None
    cycle: Optional[Literal["monthly", "half_yearly", "yearly"]] = None
    deduction_months: Optional[List[int]] = None
    applicable: Optional[bool] = None
    notes: Optional[str] = None


router = APIRouter(prefix="/api/lwf-rules", tags=["lwf-rules"])


async def ensure_lwf_seed(db, cid: str):
    """Seed default LWF rules for a company if they don't exist yet (called lazily)."""
    existing = await db.lwf_rules.count_documents({"company_id": cid})
    if existing >= len(DEFAULT_LWF_STATES):
        return
    for sc, sn, eea, era, cyc, dm in DEFAULT_LWF_STATES:
        already = await db.lwf_rules.find_one({"company_id": cid, "state_code": sc}, {"_id": 0, "id": 1})
        if already:
            continue
        doc = LWFRule(
            company_id=cid, state_code=sc, state_name=sn,
            employee_amount=eea, employer_amount=era,
            cycle=cyc, deduction_months=dm, applicable=True,
        ).model_dump()
        await db.lwf_rules.insert_one(doc)


@router.get("")
async def list_lwf(user=Depends(get_current_user)):
    db = get_db()
    cid = user.get("company_id")
    if not cid:
        raise HTTPException(400, "No company context")
    await ensure_lwf_seed(db, cid)
    rows = await db.lwf_rules.find({"company_id": cid}, {"_id": 0}).sort("state_name", 1).to_list(200)
    return rows


@router.put("/{rule_id}")
async def update_lwf(rule_id: str, body: LWFRuleUpdate, user=Depends(require_roles(*HR))):
    db = get_db()
    cid = user.get("company_id")
    patch = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if not patch:
        raise HTTPException(400, "Nothing to update")
    patch["updated_at"] = now_iso()
    r = await db.lwf_rules.update_one({"id": rule_id, "company_id": cid}, {"$set": patch})
    if r.matched_count == 0:
        raise HTTPException(404, "Rule not found")
    return await db.lwf_rules.find_one({"id": rule_id}, {"_id": 0})


@router.post("/seed-defaults")
async def reseed_defaults(user=Depends(require_roles(*HR))):
    """Re-insert any missing default state rules without overwriting customised ones."""
    db = get_db()
    await ensure_lwf_seed(db, user.get("company_id"))
    return {"ok": True, "seeded": len(DEFAULT_LWF_STATES)}


@router.get("/states-not-applicable")
async def states_not_applicable():
    return {"states": LWF_NOT_APPLICABLE}


# ----------------------------------------------------------------------
# Compliance Bulletin (govt law change feed)
# ----------------------------------------------------------------------
class ComplianceBulletin(BaseDoc):
    company_id: Optional[str] = None    # null => platform-wide bulletin (super-admin authored)
    title: str
    summary: str
    body_markdown: str = ""
    category: Literal["payroll", "labour_law", "tax", "social_security", "leave", "other"] = "other"
    impact_states: List[str] = Field(default_factory=list)   # state codes
    effective_from: Optional[str] = None
    source_url: Optional[str] = None
    is_published: bool = True
    pinned: bool = False


class ComplianceBulletinCreate(BaseModel):
    title: str
    summary: str
    body_markdown: str = ""
    category: Literal["payroll", "labour_law", "tax", "social_security", "leave", "other"] = "other"
    impact_states: List[str] = Field(default_factory=list)
    effective_from: Optional[str] = None
    source_url: Optional[str] = None
    pinned: bool = False
    company_id: Optional[str] = None    # super_admin can target a specific company; HR must omit


bulletin_router = APIRouter(prefix="/api/compliance-bulletins", tags=["compliance-bulletins"])


@bulletin_router.post("")
async def create_bulletin(body: ComplianceBulletinCreate, user=Depends(get_current_user)):
    if user["role"] not in ("super_admin", "company_admin"):
        raise HTTPException(403, "HR / super-admin only")
    db = get_db()
    target_cid = body.company_id if user["role"] == "super_admin" else user.get("company_id")
    doc = ComplianceBulletin(
        company_id=target_cid, title=body.title, summary=body.summary,
        body_markdown=body.body_markdown, category=body.category,
        impact_states=body.impact_states, effective_from=body.effective_from,
        source_url=body.source_url, pinned=body.pinned,
    ).model_dump()
    await db.compliance_bulletins.insert_one(doc)
    doc.pop("_id", None)
    # Notify HR users of the company (or all admins if global)
    flt = {"role": {"$in": ["company_admin", "country_head", "region_head"]}, "is_active": True}
    if target_cid:
        flt["company_id"] = target_cid
    recips = await db.users.find(flt, {"_id": 0, "id": 1}).to_list(2000)
    for u in recips:
        await db.notifications.insert_one({
            "id": uid(), "company_id": target_cid,
            "recipient_user_id": u["id"], "title": f"📜 Compliance update — {body.title}",
            "body": body.summary, "event": "compliance.bulletin",
            "link": "/app/compliance", "read": False, "read_at": None,
            "created_at": now_iso(), "updated_at": now_iso(),
        })
    return doc


@bulletin_router.get("")
async def list_bulletins(user=Depends(get_current_user), category: Optional[str] = Query(None)):
    db = get_db()
    cid = user.get("company_id")
    flt: dict = {"is_published": True, "$or": [{"company_id": None}, {"company_id": cid}]}
    if category:
        flt["category"] = category
    rows = await db.compliance_bulletins.find(flt, {"_id": 0}).sort([("pinned", -1), ("created_at", -1)]).to_list(200)
    return rows


@bulletin_router.delete("/{bid}")
async def delete_bulletin(bid: str, user=Depends(require_roles("super_admin", "company_admin"))):
    db = get_db()
    cid = user.get("company_id")
    flt = {"id": bid}
    if user["role"] == "company_admin":
        flt["company_id"] = cid
    await db.compliance_bulletins.update_one(flt, {"$set": {"is_published": False, "updated_at": now_iso()}})
    return {"ok": True}
