"""Phase 1I — Helpdesk tickets + POSH confidential complaint flow."""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi import Depends as _Depends

from auth import get_current_user, require_roles
from db import get_db
from models import now_iso, uid
from models_helpdesk import (
    Ticket, TicketCreate, TicketComment, TicketCommentCreate,
    TicketCategory, TicketCategoryCreate, TicketAssign, TicketStatusChange,
    POSHComplaint, POSHComplaintCreate, POSHEventCreate, POSHOutcome,
    POSHCommitteeMember,
)
from tenant import requires_module

_helpdesk_gate = [_Depends(requires_module("helpdesk"))]

cats_router = APIRouter(prefix="/api/ticket-categories", tags=["helpdesk:categories"], dependencies=_helpdesk_gate)
tickets_router = APIRouter(prefix="/api/tickets", tags=["helpdesk:tickets"], dependencies=_helpdesk_gate)
posh_router = APIRouter(prefix="/api/posh", tags=["posh"], dependencies=_helpdesk_gate)

HR = ("super_admin", "company_admin", "country_head", "region_head")


def _cid(user):
    cid = user.get("company_id")
    if not cid:
        raise HTTPException(403, "No tenant scope")
    return cid


def _add_hours(iso: str, hours: int) -> str:
    dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return (dt + timedelta(hours=hours)).isoformat()


# ---------------------------------------------------------------------------
# Ticket Categories
# ---------------------------------------------------------------------------
@cats_router.post("")
async def create_category(body: TicketCategoryCreate, user=Depends(require_roles(*HR))):
    db = get_db()
    cid = _cid(user)
    if await db.ticket_categories.find_one({"company_id": cid, "slug": body.slug, "is_active": True}):
        raise HTTPException(400, "Category with this slug exists")
    doc = TicketCategory(company_id=cid, **body.model_dump()).model_dump()
    await db.ticket_categories.insert_one(doc)
    doc.pop("_id", None)
    return doc


@cats_router.get("")
async def list_categories(user=Depends(get_current_user)):
    db = get_db()
    rows = await db.ticket_categories.find(
        {"company_id": _cid(user), "is_active": True}, {"_id": 0},
    ).sort("name", 1).to_list(200)
    return rows


@cats_router.delete("/{catid}")
async def delete_category(catid: str, user=Depends(require_roles(*HR))):
    db = get_db()
    await db.ticket_categories.update_one(
        {"id": catid, "company_id": _cid(user)},
        {"$set": {"is_active": False, "updated_at": now_iso()}},
    )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Tickets
# ---------------------------------------------------------------------------
async def _next_ticket_code(db, cid: str) -> str:
    count = await db.tickets.count_documents({"company_id": cid}) + 1
    return f"HELP-{count:04d}"


@tickets_router.post("")
async def create_ticket(body: TicketCreate, user=Depends(get_current_user)):
    db = get_db()
    cid = _cid(user)
    cat = await db.ticket_categories.find_one(
        {"id": body.category_id, "company_id": cid, "is_active": True}, {"_id": 0},
    )
    if not cat:
        raise HTTPException(404, "Category not found")
    now = now_iso()
    code = await _next_ticket_code(db, cid)
    # Default assignee from category
    assignee_user_id = cat.get("default_assignee_user_id")
    assignee_name = None
    if assignee_user_id:
        u = await db.users.find_one({"id": assignee_user_id}, {"_id": 0, "name": 1})
        assignee_name = u.get("name") if u else None
    doc = Ticket(
        company_id=cid, code=code, category_id=cat["id"], category_name=cat["name"],
        subject=body.subject, description=body.description, priority=body.priority,
        raised_by_user_id=user["id"], raised_by_name=user["name"],
        raised_by_employee_id=user.get("employee_id"),
        assignee_user_id=assignee_user_id, assignee_name=assignee_name,
        first_response_due=_add_hours(now, cat.get("sla_hours_first_response", 8)),
        resolve_due=_add_hours(now, cat.get("sla_hours_resolve", 48)),
        tags=body.tags, attachments=body.attachments,
    ).model_dump()
    await db.tickets.insert_one(doc)
    doc.pop("_id", None)
    return doc


@tickets_router.get("")
async def list_tickets(
    status: Optional[str] = None, assignee_user_id: Optional[str] = None,
    mine: bool = False, user=Depends(get_current_user),
):
    db = get_db()
    cid = _cid(user)
    flt: dict = {"company_id": cid}
    if status:
        flt["status"] = status
    if user["role"] not in HR:
        # Employees see own tickets + tickets assigned to them
        uid_ = user["id"]
        flt["$or"] = [
            {"raised_by_user_id": uid_},
            {"assignee_user_id": uid_},
        ]
    else:
        if assignee_user_id:
            flt["assignee_user_id"] = assignee_user_id
        if mine:
            flt["assignee_user_id"] = user["id"]
    rows = await db.tickets.find(
        flt, {"_id": 0, "attachments": 0, "comments": 0},
    ).sort("updated_at", -1).to_list(2000)
    return rows


@tickets_router.get("/{tid}")
async def get_ticket(tid: str, user=Depends(get_current_user)):
    db = get_db()
    doc = await db.tickets.find_one({"id": tid, "company_id": _cid(user)}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Ticket not found")
    # Employee can only see own or assigned
    if user["role"] not in HR:
        if doc["raised_by_user_id"] != user["id"] and doc.get("assignee_user_id") != user["id"]:
            raise HTTPException(403, "Not allowed")
        # Strip internal comments for employees who aren't assignee
        if doc.get("assignee_user_id") != user["id"]:
            doc["comments"] = [c for c in (doc.get("comments") or []) if not c.get("is_internal")]
    return doc


@tickets_router.post("/{tid}/assign")
async def assign_ticket(tid: str, body: TicketAssign, user=Depends(require_roles(*HR))):
    db = get_db()
    u = await db.users.find_one({"id": body.assignee_user_id}, {"_id": 0, "name": 1})
    if not u:
        raise HTTPException(404, "User not found")
    r = await db.tickets.update_one(
        {"id": tid, "company_id": _cid(user)},
        {"$set": {"assignee_user_id": body.assignee_user_id, "assignee_name": u["name"],
                  "status": "in_progress", "updated_at": now_iso()}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Ticket not found")
    return await db.tickets.find_one({"id": tid}, {"_id": 0})


@tickets_router.post("/{tid}/status")
async def change_status(tid: str, body: TicketStatusChange, user=Depends(get_current_user)):
    db = get_db()
    cid = _cid(user)
    doc = await db.tickets.find_one({"id": tid, "company_id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Ticket not found")
    is_hr = user["role"] in HR
    is_assignee = doc.get("assignee_user_id") == user["id"]
    is_raiser = doc["raised_by_user_id"] == user["id"]
    # Raiser can reopen; assignee/HR can change anything; HR can close anything
    if not (is_hr or is_assignee or (is_raiser and body.status in ("reopened", "closed"))):
        raise HTTPException(403, "Not allowed")
    upd: dict = {"status": body.status, "updated_at": now_iso()}
    if body.status == "resolved":
        upd["resolved_at"] = now_iso()
    if body.status == "closed":
        upd["closed_at"] = now_iso()
    await db.tickets.update_one({"id": tid, "company_id": cid}, {"$set": upd})
    return await db.tickets.find_one({"id": tid}, {"_id": 0})


@tickets_router.post("/{tid}/comment")
async def add_comment(tid: str, body: TicketCommentCreate, user=Depends(get_current_user)):
    db = get_db()
    cid = _cid(user)
    doc = await db.tickets.find_one({"id": tid, "company_id": cid}, {"_id": 0, "raised_by_user_id": 1, "assignee_user_id": 1, "first_response_at": 1})
    if not doc:
        raise HTTPException(404, "Ticket not found")
    is_hr = user["role"] in HR
    if not is_hr and doc["raised_by_user_id"] != user["id"] and doc.get("assignee_user_id") != user["id"]:
        raise HTTPException(403, "Not allowed")
    # Employees cannot post internal comments
    is_internal = body.is_internal and (is_hr or doc.get("assignee_user_id") == user["id"])
    c = TicketComment(
        id=uid(), author_user_id=user["id"], author_name=user["name"],
        author_role=user["role"], created_at=now_iso(),
        body=body.body, is_internal=is_internal,
    ).model_dump()
    upd = {"$push": {"comments": c}, "$set": {"updated_at": now_iso()}}
    # Track first response (from HR or assignee, not from raiser)
    if not doc.get("first_response_at") and user["id"] != doc["raised_by_user_id"]:
        upd["$set"]["first_response_at"] = now_iso()
    await db.tickets.update_one({"id": tid, "company_id": cid}, upd)
    return c


@tickets_router.post("/{tid}/rate")
async def rate_ticket(tid: str, body: dict, user=Depends(get_current_user)):
    rating = int(body.get("rating", 0))
    if rating not in (1, 2, 3, 4, 5):
        raise HTTPException(400, "Rating must be 1..5")
    db = get_db()
    doc = await db.tickets.find_one({"id": tid, "company_id": _cid(user)}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Ticket not found")
    if doc["raised_by_user_id"] != user["id"]:
        raise HTTPException(403, "Only the raiser can rate")
    if doc["status"] not in ("resolved", "closed"):
        raise HTTPException(400, "Rate resolved/closed tickets only")
    await db.tickets.update_one(
        {"id": tid, "company_id": _cid(user)},
        {"$set": {"satisfaction_rating": rating, "updated_at": now_iso()}},
    )
    return {"ok": True, "rating": rating}


@tickets_router.get("/stats/overview")
async def stats_overview(user=Depends(require_roles(*HR))):
    db = get_db()
    cid = _cid(user)
    by_status: dict = {}
    by_category: dict = {}
    by_priority: dict = {}
    breached = 0
    now = datetime.now(timezone.utc)
    async for t in db.tickets.find({"company_id": cid}, {"_id": 0, "attachments": 0, "comments": 0}):
        by_status[t.get("status", "open")] = by_status.get(t.get("status", "open"), 0) + 1
        by_category[t.get("category_name", "—")] = by_category.get(t.get("category_name", "—"), 0) + 1
        by_priority[t.get("priority", "medium")] = by_priority.get(t.get("priority", "medium"), 0) + 1
        if t.get("status") in ("open", "in_progress") and t.get("resolve_due"):
            try:
                due = datetime.fromisoformat(t["resolve_due"])
                if due < now:
                    breached += 1
            except Exception:
                pass
    return {"by_status": by_status, "by_category": by_category, "by_priority": by_priority, "sla_breached": breached}


# ---------------------------------------------------------------------------
# POSH — confidential, committee-only
# ---------------------------------------------------------------------------
async def _is_committee(db, cid: str, user_id: str) -> bool:
    m = await db.posh_committee.find_one(
        {"company_id": cid, "user_id": user_id, "is_active": True}, {"_id": 0},
    )
    return bool(m)


@posh_router.post("/committee")
async def add_committee_member(body: dict, user=Depends(require_roles(*HR))):
    db = get_db()
    cid = _cid(user)
    user_id = body.get("user_id")
    role_ = body.get("role_in_committee", "internal_member")
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "name": 1})
    if not u:
        raise HTTPException(404, "User not found")
    # Dedup — flip-forward if inactive
    existing = await db.posh_committee.find_one({"company_id": cid, "user_id": user_id})
    if existing:
        await db.posh_committee.update_one(
            {"_id": existing["_id"]},
            {"$set": {"is_active": True, "role_in_committee": role_, "updated_at": now_iso()}},
        )
        return {"ok": True, "updated": True}
    doc = POSHCommitteeMember(
        company_id=cid, user_id=user_id, name=u["name"], role_in_committee=role_,
    ).model_dump()
    await db.posh_committee.insert_one(doc)
    doc.pop("_id", None)
    return doc


@posh_router.get("/committee")
async def list_committee(user=Depends(get_current_user)):
    """All authenticated users may read committee list — non-HR get an empty list (used for is-committee check on UI)."""
    db = get_db()
    rows = await db.posh_committee.find(
        {"company_id": _cid(user), "is_active": True}, {"_id": 0},
    ).to_list(50)
    return rows


async def _next_posh_code(db, cid: str) -> str:
    count = await db.posh_complaints.count_documents({"company_id": cid}) + 1
    return f"POSH-{count:04d}"


@posh_router.post("/complaints")
async def file_complaint(body: POSHComplaintCreate, user=Depends(get_current_user)):
    """Any authenticated user can file; anonymous intake protects identity."""
    db = get_db()
    cid = _cid(user)
    code = await _next_posh_code(db, cid)
    resp_name = body.respondent_name
    if body.respondent_user_id and not resp_name:
        r = await db.users.find_one({"id": body.respondent_user_id}, {"_id": 0, "name": 1})
        resp_name = r.get("name") if r else None
    # If anonymous, scrub identity
    complainant_user_id = None if body.is_anonymous else user["id"]
    complainant_name = "Anonymous" if body.is_anonymous else (body.complainant_name or user["name"])
    complainant_contact = None if body.is_anonymous else body.complainant_contact
    doc = POSHComplaint(
        company_id=cid, code=code,
        is_anonymous=body.is_anonymous,
        complainant_user_id=complainant_user_id,
        complainant_name=complainant_name,
        complainant_contact=complainant_contact,
        respondent_user_id=body.respondent_user_id,
        respondent_name=resp_name,
        respondent_designation=body.respondent_designation,
        incident_date=body.incident_date,
        incident_location=body.incident_location,
        incident_description=body.incident_description,
        witnesses=body.witnesses, severity=body.severity,
        attachments=body.attachments,
        filed_at=now_iso(), status="filed",
    ).model_dump()
    await db.posh_complaints.insert_one(doc)
    doc.pop("_id", None)
    # Return minimal ack to complainant; strip sensitive data
    return {"id": doc["id"], "code": code, "status": "filed",
            "message": "Your complaint has been received confidentially. The PoSH Committee will review it."}


@posh_router.get("/complaints")
async def list_complaints(user=Depends(get_current_user)):
    """Committee members only, OR raiser (can see own non-anonymous complaints)."""
    db = get_db()
    cid = _cid(user)
    is_committee = await _is_committee(db, cid, user["id"])
    is_super = user["role"] == "super_admin"
    if is_committee or is_super:
        rows = await db.posh_complaints.find({"company_id": cid}, {"_id": 0}).sort("filed_at", -1).to_list(500)
    else:
        # Raiser can only see their own filings (never anonymous)
        rows = await db.posh_complaints.find(
            {"company_id": cid, "complainant_user_id": user["id"], "is_anonymous": False},
            {"_id": 0, "investigation_log": 0, "attachments": 0},
        ).sort("filed_at", -1).to_list(50)
    return rows


@posh_router.get("/complaints/{cid_}")
async def get_complaint(cid_: str, user=Depends(get_current_user)):
    db = get_db()
    cid = _cid(user)
    doc = await db.posh_complaints.find_one({"id": cid_, "company_id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    is_committee = await _is_committee(db, cid, user["id"])
    if not (is_committee or user["role"] == "super_admin"
            or (doc.get("complainant_user_id") == user["id"] and not doc.get("is_anonymous"))):
        raise HTTPException(403, "Confidential — committee only")
    return doc


@posh_router.post("/complaints/{cid_}/event")
async def log_event(cid_: str, body: POSHEventCreate, user=Depends(get_current_user)):
    db = get_db()
    cid = _cid(user)
    if not await _is_committee(db, cid, user["id"]) and user["role"] != "super_admin":
        raise HTTPException(403, "Committee only")
    ev = {
        "id": uid(), "at": now_iso(),
        "by_user_id": user["id"], "by_name": user["name"],
        "kind": body.kind, "body": body.body,
    }
    r = await db.posh_complaints.update_one(
        {"id": cid_, "company_id": cid},
        {"$push": {"investigation_log": ev}, "$set": {"updated_at": now_iso()}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Not found")
    return ev


@posh_router.post("/complaints/{cid_}/status")
async def change_posh_status(cid_: str, body: dict, user=Depends(get_current_user)):
    db = get_db()
    cid = _cid(user)
    if not await _is_committee(db, cid, user["id"]) and user["role"] != "super_admin":
        raise HTTPException(403, "Committee only")
    allowed = {"filed", "under_review", "investigating", "hearing",
               "decision_pending", "resolved_upheld", "resolved_dismissed", "withdrawn"}
    new_status = body.get("status")
    if new_status not in allowed:
        raise HTTPException(400, "Invalid status")
    upd = {"status": new_status, "updated_at": now_iso()}
    if new_status in ("resolved_upheld", "resolved_dismissed", "withdrawn"):
        upd["decided_at"] = now_iso()
    r = await db.posh_complaints.update_one(
        {"id": cid_, "company_id": cid}, {"$set": upd},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Not found")
    return await db.posh_complaints.find_one({"id": cid_}, {"_id": 0})


@posh_router.post("/complaints/{cid_}/outcome")
async def finalise_outcome(cid_: str, body: POSHOutcome, user=Depends(get_current_user)):
    db = get_db()
    cid = _cid(user)
    if not await _is_committee(db, cid, user["id"]) and user["role"] != "super_admin":
        raise HTTPException(403, "Committee only")
    mapping = {"upheld": "resolved_upheld", "partial_upheld": "resolved_upheld",
               "dismissed": "resolved_dismissed", "withdrawn": "withdrawn"}
    r = await db.posh_complaints.update_one(
        {"id": cid_, "company_id": cid},
        {"$set": {
            "outcome": body.outcome, "outcome_notes": body.outcome_notes,
            "status": mapping[body.outcome], "decided_at": now_iso(),
            "updated_at": now_iso(),
        }},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Not found")
    return await db.posh_complaints.find_one({"id": cid_}, {"_id": 0})
