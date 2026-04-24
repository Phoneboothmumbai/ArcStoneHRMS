"""Phase 1K — Recruitment / ATS routes: requisitions, candidates, interviews, offers."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi import Depends as _Depends

from auth import get_current_user, require_roles
from db import get_db
from models import now_iso, uid
from models_ats import (
    JobRequisition, JobRequisitionCreate, ReqStatus,
    Candidate, CandidateCreate, CandidateStageChange, CandidateStage, CandidateNote,
    Interview, InterviewCreate, InterviewScorecard,
    Offer, OfferCreate, OfferDecision,
)
from tenant import requires_module

_gate = [_Depends(requires_module("ats"))]

reqs_router = APIRouter(prefix="/api/requisitions", tags=["ats:requisitions"], dependencies=_gate)
cand_router = APIRouter(prefix="/api/candidates", tags=["ats:candidates"], dependencies=_gate)
iv_router = APIRouter(prefix="/api/interviews", tags=["ats:interviews"], dependencies=_gate)
offers_router = APIRouter(prefix="/api/offers", tags=["ats:offers"], dependencies=_gate)

# Public careers endpoint (unauthenticated) for job board
careers_router = APIRouter(prefix="/api/careers", tags=["ats:public"])

HR = ("super_admin", "company_admin", "country_head", "region_head")
RECRUIT = HR + ("branch_manager",)


def _cid(user):
    cid = user.get("company_id")
    if not cid:
        raise HTTPException(403, "No tenant scope")
    return cid


async def _next_code(db, cid: str, coll_name: str, prefix: str) -> str:
    year = datetime.now(timezone.utc).year
    count = await db[coll_name].count_documents({"company_id": cid}) + 1
    return f"{prefix}-{year}-{count:04d}"


# ---------------------------------------------------------------------------
# Requisitions
# ---------------------------------------------------------------------------
@reqs_router.post("")
async def create_req(body: JobRequisitionCreate, user=Depends(require_roles(*RECRUIT))):
    db = get_db()
    cid = _cid(user)
    code = await _next_code(db, cid, "job_requisitions", "JR")
    # Lookup hiring manager / recruiter names
    hm_name = None
    if body.hiring_manager_id:
        hm = await db.employees.find_one({"id": body.hiring_manager_id, "company_id": cid}, {"_id": 0})
        hm_name = hm.get("name") if hm else None
    rc_name = None
    if body.recruiter_id:
        rc = await db.employees.find_one({"id": body.recruiter_id, "company_id": cid}, {"_id": 0})
        rc_name = rc.get("name") if rc else None
    doc = JobRequisition(
        company_id=cid, code=code,
        hiring_manager_name=hm_name, recruiter_name=rc_name,
        **body.model_dump(),
    ).model_dump()
    await db.job_requisitions.insert_one(doc)
    doc.pop("_id", None)
    return doc


@reqs_router.get("")
async def list_reqs(status: Optional[ReqStatus] = None, user=Depends(get_current_user)):
    db = get_db()
    flt: dict = {"company_id": _cid(user)}
    if status:
        flt["status"] = status
    rows = await db.job_requisitions.find(flt, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return rows


@reqs_router.get("/{rid}")
async def get_req(rid: str, user=Depends(get_current_user)):
    db = get_db()
    doc = await db.job_requisitions.find_one({"id": rid, "company_id": _cid(user)}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Requisition not found")
    return doc


@reqs_router.patch("/{rid}")
async def update_req(rid: str, body: dict, user=Depends(require_roles(*RECRUIT))):
    db = get_db()
    allowed = {"title", "department", "location", "employment_type", "work_mode", "openings",
               "priority", "experience_min", "experience_max", "salary_min", "salary_max",
               "description_markdown", "responsibilities", "requirements", "skills",
               "benefits", "is_public", "target_close_date"}
    upd = {k: v for k, v in body.items() if k in allowed}
    upd["updated_at"] = now_iso()
    r = await db.job_requisitions.update_one(
        {"id": rid, "company_id": _cid(user)}, {"$set": upd},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Requisition not found")
    return await db.job_requisitions.find_one({"id": rid}, {"_id": 0})


@reqs_router.post("/{rid}/status")
async def set_req_status(rid: str, body: dict, user=Depends(require_roles(*RECRUIT))):
    new_status = body.get("status")
    if new_status not in ("draft", "open", "on_hold", "closed", "cancelled"):
        raise HTTPException(400, "Invalid status")
    db = get_db()
    upd = {"status": new_status, "updated_at": now_iso()}
    if new_status == "open":
        upd["opened_at"] = now_iso()
    if new_status == "closed":
        upd["closed_at"] = now_iso()
    r = await db.job_requisitions.update_one(
        {"id": rid, "company_id": _cid(user)}, {"$set": upd},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Requisition not found")
    return await db.job_requisitions.find_one({"id": rid}, {"_id": 0})


# ---------------------------------------------------------------------------
# Careers page (public — no auth, reads only)
# ---------------------------------------------------------------------------
@careers_router.get("/{company_id}")
async def list_public_jobs(company_id: str):
    db = get_db()
    rows = await db.job_requisitions.find(
        {"company_id": company_id, "status": "open", "is_public": True},
        {"_id": 0, "salary_min": 0, "salary_max": 0, "recruiter_id": 0, "recruiter_name": 0},
    ).to_list(200)
    return rows


@careers_router.post("/{company_id}/apply")
async def public_apply(company_id: str, body: CandidateCreate):
    db = get_db()
    req = await db.job_requisitions.find_one(
        {"id": body.requisition_id, "company_id": company_id, "status": "open"}, {"_id": 0},
    )
    if not req:
        raise HTTPException(404, "Requisition not found or not open")
    # Dedupe: same email + same req = return existing
    existing = await db.candidates.find_one(
        {"company_id": company_id, "requisition_id": body.requisition_id, "email": body.email},
        {"_id": 0, "resume_base64": 0},
    )
    if existing:
        return existing
    doc = Candidate(
        company_id=company_id, requisition_title=req["title"],
        **body.model_dump(),
    ).model_dump()
    await db.candidates.insert_one(doc)
    doc.pop("_id", None)
    doc.pop("resume_base64", None)
    return doc


# ---------------------------------------------------------------------------
# Candidates (internal)
# ---------------------------------------------------------------------------
@cand_router.post("")
async def create_candidate(body: CandidateCreate, user=Depends(require_roles(*RECRUIT))):
    db = get_db()
    cid = _cid(user)
    req = await db.job_requisitions.find_one({"id": body.requisition_id, "company_id": cid}, {"_id": 0})
    if not req:
        raise HTTPException(404, "Requisition not found")
    doc = Candidate(
        company_id=cid, requisition_title=req["title"],
        **body.model_dump(),
    ).model_dump()
    await db.candidates.insert_one(doc)
    doc.pop("_id", None)
    return doc


@cand_router.get("")
async def list_candidates(
    requisition_id: Optional[str] = None, stage: Optional[CandidateStage] = None,
    user=Depends(require_roles(*RECRUIT)),
):
    db = get_db()
    flt: dict = {"company_id": _cid(user)}
    if requisition_id:
        flt["requisition_id"] = requisition_id
    if stage:
        flt["stage"] = stage
    rows = await db.candidates.find(flt, {"_id": 0, "resume_base64": 0}).sort("created_at", -1).to_list(2000)
    return rows


@cand_router.get("/{cid}")
async def get_candidate(cid: str, user=Depends(require_roles(*RECRUIT))):
    db = get_db()
    doc = await db.candidates.find_one({"id": cid, "company_id": _cid(user)}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Candidate not found")
    return doc


@cand_router.post("/{cid}/stage")
async def change_stage(cid: str, body: CandidateStageChange, user=Depends(require_roles(*RECRUIT))):
    db = get_db()
    doc = await db.candidates.find_one({"id": cid, "company_id": _cid(user)}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Candidate not found")
    upd: dict = {"stage": body.stage, "updated_at": now_iso()}
    if body.stage == "rejected":
        upd["rejected_reason"] = body.reason
    if body.stage == "withdrawn":
        upd["withdrawn_reason"] = body.reason
    await db.candidates.update_one({"id": cid, "company_id": _cid(user)}, {"$set": upd})
    return await db.candidates.find_one({"id": cid}, {"_id": 0, "resume_base64": 0})


@cand_router.post("/{cid}/note")
async def add_note(cid: str, body: dict, user=Depends(require_roles(*RECRUIT))):
    db = get_db()
    note = CandidateNote(
        id=uid(), author_user_id=user["id"], author_name=user["name"],
        author_role=user["role"], created_at=now_iso(),
        body=body.get("body", ""),
    ).model_dump()
    r = await db.candidates.update_one(
        {"id": cid, "company_id": _cid(user)},
        {"$push": {"notes": note}, "$set": {"updated_at": now_iso()}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Candidate not found")
    return note


@cand_router.post("/{cid}/convert-to-employee")
async def convert_to_employee(cid: str, body: dict, user=Depends(require_roles(*HR))):
    """Create an Employee record + onboarding task-list after offer acceptance."""
    db = get_db()
    cand = await db.candidates.find_one({"id": cid, "company_id": _cid(user)}, {"_id": 0})
    if not cand:
        raise HTTPException(404, "Candidate not found")
    if cand["stage"] not in ("offer_accepted", "hired"):
        raise HTTPException(400, "Candidate must be in offer_accepted or hired stage")

    # Find their accepted offer
    offer = await db.offers.find_one(
        {"company_id": _cid(user), "candidate_id": cid, "status": "accepted"}, {"_id": 0},
    )

    # Build employee doc
    from models import Employee
    emp_count = await db.employees.count_documents({"company_id": _cid(user)}) + 1
    emp_code = body.get("employee_code") or f"EMP{emp_count:04d}"
    emp = Employee(
        company_id=_cid(user), employee_code=emp_code,
        name=cand["name"], email=cand["email"], phone=cand.get("phone"),
        job_title=(offer or {}).get("job_title") or cand["requisition_title"],
        joined_on=(offer or {}).get("doj") or now_iso(),
        status="onboarding",
    ).model_dump()
    await db.employees.insert_one(emp)
    # Update candidate to hired + link to employee
    await db.candidates.update_one(
        {"id": cid}, {"$set": {"stage": "hired", "updated_at": now_iso()}},
    )
    # Optional: auto-create onboarding
    if body.get("auto_start_onboarding", True):
        from models_profile import Onboarding
        tpl = await db.onboarding_templates.find_one(
            {"company_id": _cid(user), "is_default": True}, {"_id": 0},
        )
        if not tpl:
            tpl = await db.onboarding_templates.find_one(
                {"company_id": _cid(user)}, {"_id": 0},
            )
        if tpl:
            tasks = []
            for t in tpl.get("tasks", []):
                tasks.append({
                    "task_id": uid(), "stage": t.get("stage", "week_1"),
                    "title": t["title"], "assignee": t.get("assignee", "hr"),
                    "due_date": None, "status": "pending",
                })
            ob = Onboarding(
                company_id=_cid(user), employee_id=emp["id"],
                employee_name=emp["name"], template_id=tpl["id"],
                template_name=tpl.get("name", ""),
                date_of_joining=emp["joined_on"][:10], tasks=tasks, status="active",
            ).model_dump()
            await db.onboardings.insert_one(ob)
    emp.pop("_id", None)
    return emp


# ---------------------------------------------------------------------------
# Interviews
# ---------------------------------------------------------------------------
@iv_router.post("")
async def schedule_interview(body: InterviewCreate, user=Depends(require_roles(*RECRUIT))):
    db = get_db()
    cid = _cid(user)
    cand = await db.candidates.find_one({"id": body.candidate_id, "company_id": cid}, {"_id": 0})
    if not cand:
        raise HTTPException(404, "Candidate not found")
    names = []
    for iid in body.interviewer_ids:
        e = await db.employees.find_one({"id": iid, "company_id": cid}, {"_id": 0})
        if e:
            names.append(e["name"])
    doc = Interview(
        company_id=cid, candidate_id=body.candidate_id, candidate_name=cand["name"],
        requisition_id=cand["requisition_id"], requisition_title=cand["requisition_title"],
        round=body.round, scheduled_at=body.scheduled_at, duration_mins=body.duration_mins,
        meeting_link=body.meeting_link, location=body.location,
        interviewer_ids=body.interviewer_ids, interviewer_names=names, agenda=body.agenda,
    ).model_dump()
    await db.interviews.insert_one(doc)
    # Auto-advance candidate to interview if still in screening/applied
    if cand["stage"] in ("applied", "screening", "shortlisted"):
        await db.candidates.update_one(
            {"id": body.candidate_id}, {"$set": {"stage": "interview", "updated_at": now_iso()}},
        )
    doc.pop("_id", None)
    return doc


@iv_router.get("")
async def list_interviews(
    candidate_id: Optional[str] = None, mine: bool = False,
    user=Depends(get_current_user),
):
    db = get_db()
    cid = _cid(user)
    flt: dict = {"company_id": cid}
    if candidate_id:
        flt["candidate_id"] = candidate_id
    if mine and user.get("employee_id"):
        flt["interviewer_ids"] = user["employee_id"]
    rows = await db.interviews.find(flt, {"_id": 0}).sort("scheduled_at", -1).to_list(1000)
    return rows


@iv_router.post("/{iid}/scorecard")
async def submit_scorecard(iid: str, body: InterviewScorecard, user=Depends(get_current_user)):
    db = get_db()
    cid = _cid(user)
    iv = await db.interviews.find_one({"id": iid, "company_id": cid}, {"_id": 0})
    if not iv:
        raise HTTPException(404, "Interview not found")
    # Interviewer or HR
    is_hr = user["role"] in HR
    if not is_hr and user.get("employee_id") not in (iv.get("interviewer_ids") or []):
        raise HTTPException(403, "Only interviewers or HR can submit scorecards")
    entry = {
        "interviewer_id": body.interviewer_id,
        "outcome": body.outcome,
        "technical_rating": body.technical_rating,
        "communication_rating": body.communication_rating,
        "culture_rating": body.culture_rating,
        "strengths": body.strengths, "concerns": body.concerns, "notes": body.notes,
        "submitted_at": now_iso(),
    }
    # Replace existing scorecard from same interviewer, or append
    scorecards = [s for s in (iv.get("scorecards") or []) if s.get("interviewer_id") != body.interviewer_id]
    scorecards.append(entry)
    # Roll up overall outcome (most common)
    outcomes = [s["outcome"] for s in scorecards]
    overall = None
    if outcomes:
        from collections import Counter
        overall = Counter(outcomes).most_common(1)[0][0]
    await db.interviews.update_one(
        {"id": iid, "company_id": cid},
        {"$set": {"scorecards": scorecards, "overall_outcome": overall,
                  "status": "completed", "updated_at": now_iso()}},
    )
    return await db.interviews.find_one({"id": iid}, {"_id": 0})


@iv_router.post("/{iid}/cancel")
async def cancel_interview(iid: str, user=Depends(require_roles(*RECRUIT))):
    db = get_db()
    r = await db.interviews.update_one(
        {"id": iid, "company_id": _cid(user)},
        {"$set": {"status": "cancelled", "updated_at": now_iso()}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Interview not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Offers
# ---------------------------------------------------------------------------
@offers_router.post("")
async def create_offer(body: OfferCreate, user=Depends(require_roles(*HR))):
    db = get_db()
    cid = _cid(user)
    cand = await db.candidates.find_one({"id": body.candidate_id, "company_id": cid}, {"_id": 0})
    if not cand:
        raise HTTPException(404, "Candidate not found")
    doc = Offer(
        company_id=cid, candidate_id=body.candidate_id, candidate_name=cand["name"],
        requisition_id=cand["requisition_id"], requisition_title=cand["requisition_title"],
        job_title=body.job_title, doj=body.doj, annual_ctc=body.annual_ctc,
        currency=body.currency, location=body.location, work_mode=body.work_mode,
        employment_type=body.employment_type, valid_until=body.valid_until,
        terms_markdown=body.terms_markdown, status="draft",
    ).model_dump()
    # Optionally auto-generate offer letter from template
    if body.letter_template_id:
        tpl = await db.letter_templates.find_one(
            {"id": body.letter_template_id, "company_id": cid, "is_active": True}, {"_id": 0},
        )
        if tpl:
            from routers.letters_routes import _render
            merge_values = {
                "candidate_name": cand["name"], "job_title": body.job_title,
                "annual_ctc": f"{body.annual_ctc:,.0f}", "currency": body.currency,
                "doj": body.doj, "location": body.location or "",
                "company_name": (await db.companies.find_one({"id": cid}, {"_id": 0, "name": 1}) or {}).get("name", ""),
                "today": now_iso()[:10],
                "valid_until": body.valid_until or "",
            }
            rendered = _render(tpl["body_markdown"], merge_values)
            letter = {
                "id": uid(), "company_id": cid, "template_id": tpl["id"],
                "template_name": tpl["name"], "category": "offer",
                "employee_id": None, "employee_name": cand["name"],
                "rendered_markdown": rendered, "merge_values": merge_values,
                "issued_by": user["id"], "issued_at": now_iso(),
                "status": "issued", "signatures": [],
                "created_at": now_iso(), "updated_at": now_iso(),
            }
            await db.generated_letters.insert_one(letter)
            doc["letter_id"] = letter["id"]
    await db.offers.insert_one(doc)
    doc.pop("_id", None)
    return doc


@offers_router.get("")
async def list_offers(candidate_id: Optional[str] = None, status: Optional[str] = None,
                     user=Depends(require_roles(*RECRUIT))):
    db = get_db()
    flt: dict = {"company_id": _cid(user)}
    if candidate_id:
        flt["candidate_id"] = candidate_id
    if status:
        flt["status"] = status
    rows = await db.offers.find(flt, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return rows


@offers_router.post("/{oid}/send")
async def send_offer(oid: str, user=Depends(require_roles(*HR))):
    db = get_db()
    doc = await db.offers.find_one({"id": oid, "company_id": _cid(user)}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Offer not found")
    if doc["status"] != "draft":
        raise HTTPException(400, "Only draft offers can be sent")
    await db.offers.update_one(
        {"id": oid}, {"$set": {"status": "sent", "sent_at": now_iso(), "updated_at": now_iso()}},
    )
    # Move candidate to offer_sent
    await db.candidates.update_one(
        {"id": doc["candidate_id"]}, {"$set": {"stage": "offer_sent", "updated_at": now_iso()}},
    )
    return await db.offers.find_one({"id": oid}, {"_id": 0})


@offers_router.post("/{oid}/decision")
async def decide_offer(oid: str, body: OfferDecision, user=Depends(require_roles(*HR))):
    """HR records candidate's decision. In v2: candidate portal link signs directly."""
    db = get_db()
    doc = await db.offers.find_one({"id": oid, "company_id": _cid(user)}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Offer not found")
    if doc["status"] != "sent":
        raise HTTPException(400, "Only sent offers can be decided")
    new_status = "accepted" if body.decision == "accept" else "declined"
    new_cand_stage = "offer_accepted" if body.decision == "accept" else "offer_declined"
    await db.offers.update_one(
        {"id": oid},
        {"$set": {"status": new_status, "decided_at": now_iso(),
                  "decline_reason": body.reason if body.decision == "decline" else None,
                  "updated_at": now_iso()}},
    )
    await db.candidates.update_one(
        {"id": doc["candidate_id"]}, {"$set": {"stage": new_cand_stage, "updated_at": now_iso()}},
    )
    return await db.offers.find_one({"id": oid}, {"_id": 0})
