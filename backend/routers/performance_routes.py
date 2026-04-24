"""Phase 1J — Performance Management routes (cycles / goals / reviews / 9-box / PIPs)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi import Depends as _Depends

from auth import get_current_user, require_roles
from db import get_db
from models import now_iso, uid
from models_performance import (
    ReviewCycle, ReviewCycleCreate, CycleStatus,
    Goal, GoalCreate, KeyResult, KRProgressUpdate,
    Review, ReviewCreate, ReviewSubmit,
    NineBoxPlacement, NineBoxUpsert, nine_box_label,
    PIP, PIPCreate, PIPMilestone, PIPOutcome,
)
from tenant import requires_module

_gate = [_Depends(requires_module("performance"))]

cycles_router = APIRouter(prefix="/api/review-cycles", tags=["performance:cycles"], dependencies=_gate)
goals_router = APIRouter(prefix="/api/goals", tags=["performance:goals"], dependencies=_gate)
reviews_router = APIRouter(prefix="/api/reviews", tags=["performance:reviews"], dependencies=_gate)
ninebox_router = APIRouter(prefix="/api/nine-box", tags=["performance:nine-box"], dependencies=_gate)
pips_router = APIRouter(prefix="/api/pips", tags=["performance:pips"], dependencies=_gate)

HR_ROLES = ("super_admin", "company_admin", "country_head", "region_head")
MANAGER_ROLES = HR_ROLES + ("branch_manager", "sub_manager", "assistant_manager")


def _is_hr(user: dict) -> bool:
    return user.get("role") in HR_ROLES


def _cid(user: dict) -> str:
    cid = user.get("company_id")
    if not cid:
        raise HTTPException(403, "No tenant scope")
    return cid


# ---------------------------------------------------------------------------
# Review Cycles (HR-managed)
# ---------------------------------------------------------------------------
@cycles_router.post("")
async def create_cycle(body: ReviewCycleCreate, user=Depends(require_roles(*HR_ROLES))):
    db = get_db()
    doc_kwargs = body.model_dump()
    if body.competencies is None:
        doc_kwargs.pop("competencies", None)
    doc = ReviewCycle(company_id=_cid(user), **doc_kwargs).model_dump()
    await db.review_cycles.insert_one(doc)
    doc.pop("_id", None)
    return doc


@cycles_router.get("")
async def list_cycles(status: Optional[CycleStatus] = None, user=Depends(get_current_user)):
    db = get_db()
    flt: dict = {"company_id": _cid(user)}
    if status:
        flt["status"] = status
    rows = await db.review_cycles.find(flt, {"_id": 0}).sort("period_start", -1).to_list(200)
    return rows


@cycles_router.get("/{cid}")
async def get_cycle(cid: str, user=Depends(get_current_user)):
    db = get_db()
    doc = await db.review_cycles.find_one({"id": cid, "company_id": _cid(user)}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Cycle not found")
    return doc


@cycles_router.post("/{cid}/status")
async def set_cycle_status(cid: str, body: dict, user=Depends(require_roles(*HR_ROLES))):
    new_status = body.get("status")
    if new_status not in ("draft", "open", "in_review", "calibration", "closed"):
        raise HTTPException(400, "Invalid status")
    db = get_db()
    r = await db.review_cycles.update_one(
        {"id": cid, "company_id": _cid(user)},
        {"$set": {"status": new_status, "updated_at": now_iso()}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Cycle not found")
    return await db.review_cycles.find_one({"id": cid}, {"_id": 0})


@cycles_router.delete("/{cid}")
async def delete_cycle(cid: str, user=Depends(require_roles(*HR_ROLES))):
    db = get_db()
    doc = await db.review_cycles.find_one({"id": cid, "company_id": _cid(user)}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Cycle not found")
    if doc.get("status") not in ("draft", "closed"):
        raise HTTPException(400, "Only draft or closed cycles can be deleted")
    await db.review_cycles.delete_one({"id": cid, "company_id": _cid(user)})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Goals / OKRs
# ---------------------------------------------------------------------------
def _compute_progress(krs: list[dict]) -> float:
    """Weighted average of KR progress (0-100)."""
    if not krs:
        return 0.0
    total_w = 0.0
    sum_prog = 0.0
    for kr in krs:
        w = float(kr.get("weight") or 1.0)
        target = float(kr.get("target") or 0.0)
        current = float(kr.get("current") or 0.0)
        if kr.get("metric_type") == "boolean":
            prog = 100.0 if current >= 1 else 0.0
        elif target > 0:
            prog = max(0.0, min(100.0, (current / target) * 100.0))
        else:
            prog = 0.0
        total_w += w
        sum_prog += w * prog
    return round(sum_prog / total_w, 1) if total_w else 0.0


def _infer_status(progress: float, current_status: str) -> str:
    """Auto-adjust status based on progress — but keep explicit admin overrides."""
    if current_status in ("archived", "missed", "completed", "draft"):
        return current_status
    if progress >= 100:
        return "completed"
    if progress >= 70:
        return "on_track"
    if progress >= 40:
        return "active"
    if progress > 0:
        return "at_risk"
    return current_status or "active"


async def _owner_employee(db, cid: str, emp_id: str) -> dict:
    emp = await db.employees.find_one({"id": emp_id, "company_id": cid}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employee not found")
    return emp


@goals_router.post("")
async def create_goal(body: GoalCreate, user=Depends(get_current_user)):
    db = get_db()
    cid = _cid(user)
    # Employees can only create goals for themselves; HR & managers can create for anyone
    if not _is_hr(user) and user.get("role") not in ("branch_manager", "sub_manager", "assistant_manager"):
        if user.get("employee_id") != body.owner_employee_id:
            raise HTTPException(403, "Employees can only create their own goals")
    emp = await _owner_employee(db, cid, body.owner_employee_id)
    krs = [kr.model_dump() if hasattr(kr, "model_dump") else dict(kr) for kr in (body.key_results or [])]
    for kr in krs:
        kr.setdefault("id", uid())
    progress = _compute_progress(krs)
    doc = Goal(
        company_id=cid, cycle_id=body.cycle_id,
        owner_employee_id=body.owner_employee_id, owner_name=emp["name"],
        manager_id=emp.get("manager_id"),
        kind=body.kind, title=body.title, description=body.description,
        category=body.category, priority=body.priority, weight=body.weight,
        start_date=body.start_date, due_date=body.due_date,
        key_results=krs, progress=progress,
        status=_infer_status(progress, "active"),
        aligned_to_goal_id=body.aligned_to_goal_id, tags=body.tags or [],
    ).model_dump()
    await db.goals.insert_one(doc)
    doc.pop("_id", None)
    return doc


@goals_router.get("")
async def list_goals(
    cycle_id: Optional[str] = None,
    owner_employee_id: Optional[str] = None,
    status: Optional[str] = None,
    user=Depends(get_current_user),
):
    db = get_db()
    cid = _cid(user)
    flt: dict = {"company_id": cid}
    if cycle_id:
        flt["cycle_id"] = cycle_id
    if status:
        flt["status"] = status
    if _is_hr(user):
        if owner_employee_id:
            flt["owner_employee_id"] = owner_employee_id
    elif user.get("role") in ("branch_manager", "sub_manager", "assistant_manager"):
        # Managers: own goals + direct reports
        me = user.get("employee_id")
        reports = await db.employees.find({"company_id": cid, "manager_id": me}, {"_id": 0, "id": 1}).to_list(500)
        ids = {r["id"] for r in reports}
        if me:
            ids.add(me)
        if owner_employee_id and owner_employee_id in ids:
            flt["owner_employee_id"] = owner_employee_id
        else:
            flt["owner_employee_id"] = {"$in": list(ids)}
    else:
        if not user.get("employee_id"):
            raise HTTPException(403, "No employee record for this user")
        flt["owner_employee_id"] = user["employee_id"]
    rows = await db.goals.find(flt, {"_id": 0}).sort("updated_at", -1).to_list(2000)
    return rows


@goals_router.get("/{gid}")
async def get_goal(gid: str, user=Depends(get_current_user)):
    db = get_db()
    doc = await db.goals.find_one({"id": gid, "company_id": _cid(user)}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Goal not found")
    return doc


@goals_router.patch("/{gid}")
async def update_goal(gid: str, body: dict, user=Depends(get_current_user)):
    db = get_db()
    cid = _cid(user)
    doc = await db.goals.find_one({"id": gid, "company_id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Goal not found")
    # Permission: owner, their manager, or HR
    if not _is_hr(user):
        if user.get("employee_id") != doc["owner_employee_id"] and user.get("employee_id") != doc.get("manager_id"):
            raise HTTPException(403, "Not allowed to edit this goal")
    allowed = {"title", "description", "category", "priority", "weight", "status",
               "start_date", "due_date", "key_results", "aligned_to_goal_id", "tags", "cycle_id"}
    updates = {k: v for k, v in body.items() if k in allowed}
    if "key_results" in updates:
        krs = updates["key_results"] or []
        for kr in krs:
            kr.setdefault("id", uid())
        updates["key_results"] = krs
        updates["progress"] = _compute_progress(krs)
        updates["status"] = _infer_status(updates["progress"], updates.get("status") or doc["status"])
    updates["updated_at"] = now_iso()
    await db.goals.update_one({"id": gid, "company_id": cid}, {"$set": updates})
    return await db.goals.find_one({"id": gid}, {"_id": 0})


@goals_router.post("/{gid}/kr-progress")
async def update_kr_progress(gid: str, body: KRProgressUpdate, user=Depends(get_current_user)):
    db = get_db()
    cid = _cid(user)
    doc = await db.goals.find_one({"id": gid, "company_id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Goal not found")
    if not _is_hr(user):
        if user.get("employee_id") != doc["owner_employee_id"]:
            raise HTTPException(403, "Only the owner can update KR progress")
    krs = doc.get("key_results") or []
    found = False
    for kr in krs:
        if kr.get("id") == body.kr_id:
            kr["current"] = float(body.current)
            if body.notes is not None:
                kr["notes"] = body.notes
            found = True
            break
    if not found:
        raise HTTPException(404, "Key result not found")
    progress = _compute_progress(krs)
    new_status = _infer_status(progress, doc.get("status") or "active")
    await db.goals.update_one(
        {"id": gid, "company_id": cid},
        {"$set": {"key_results": krs, "progress": progress, "status": new_status, "updated_at": now_iso()}},
    )
    return await db.goals.find_one({"id": gid}, {"_id": 0})


@goals_router.delete("/{gid}")
async def delete_goal(gid: str, user=Depends(get_current_user)):
    db = get_db()
    cid = _cid(user)
    doc = await db.goals.find_one({"id": gid, "company_id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Goal not found")
    if not _is_hr(user) and user.get("employee_id") != doc["owner_employee_id"]:
        raise HTTPException(403, "Only owner or HR may delete")
    await db.goals.delete_one({"id": gid, "company_id": cid})
    return {"ok": True}


@goals_router.get("/me/summary")
async def my_goal_summary(cycle_id: Optional[str] = None, user=Depends(get_current_user)):
    """Quick personal dashboard payload."""
    db = get_db()
    cid = _cid(user)
    if not user.get("employee_id"):
        raise HTTPException(403, "Not an employee")
    flt = {"company_id": cid, "owner_employee_id": user["employee_id"]}
    if cycle_id:
        flt["cycle_id"] = cycle_id
    rows = await db.goals.find(flt, {"_id": 0}).to_list(500)
    total = len(rows)
    avg_progress = round(sum(g.get("progress", 0) for g in rows) / total, 1) if total else 0.0
    by_status: dict = {}
    for g in rows:
        by_status[g.get("status", "active")] = by_status.get(g.get("status", "active"), 0) + 1
    return {"total": total, "avg_progress": avg_progress, "by_status": by_status, "goals": rows}


# ---------------------------------------------------------------------------
# Reviews (self + manager + peer placeholders)
# ---------------------------------------------------------------------------
async def _cycle_or_404(db, cid: str, cycle_id: str) -> dict:
    c = await db.review_cycles.find_one({"id": cycle_id, "company_id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Cycle not found")
    return c


@reviews_router.post("")
async def create_review(body: ReviewCreate, user=Depends(get_current_user)):
    db = get_db()
    cid = _cid(user)
    cycle = await _cycle_or_404(db, cid, body.cycle_id)
    if cycle["status"] in ("closed",):
        raise HTTPException(400, "Cycle is closed")
    subj = await _owner_employee(db, cid, body.subject_employee_id)
    reviewer = None
    if body.reviewer_employee_id:
        reviewer = await _owner_employee(db, cid, body.reviewer_employee_id)

    # For self reviews, subject must == reviewer
    if body.review_type == "self":
        if user.get("employee_id") != body.subject_employee_id and not _is_hr(user):
            raise HTTPException(403, "Self review can only be created by the subject (or HR)")
        reviewer_emp_id = body.subject_employee_id
        reviewer_name = subj["name"]
    elif body.review_type == "manager":
        reviewer_emp_id = body.reviewer_employee_id or subj.get("manager_id")
        if not reviewer_emp_id:
            raise HTTPException(400, "Subject has no manager — assign one or pass reviewer_employee_id")
        if not reviewer:
            reviewer = await _owner_employee(db, cid, reviewer_emp_id)
        reviewer_name = reviewer["name"]
    else:
        if not body.reviewer_employee_id:
            raise HTTPException(400, "reviewer_employee_id required for this review type")
        reviewer_emp_id = body.reviewer_employee_id
        reviewer_name = reviewer["name"] if reviewer else ""

    # Dedupe — one review per (cycle, subject, reviewer, type)
    existing = await db.reviews.find_one({
        "company_id": cid, "cycle_id": body.cycle_id,
        "subject_employee_id": body.subject_employee_id,
        "reviewer_employee_id": reviewer_emp_id,
        "review_type": body.review_type,
    }, {"_id": 0})
    if existing:
        return existing

    doc = Review(
        company_id=cid, cycle_id=body.cycle_id, cycle_name=cycle["name"],
        subject_employee_id=body.subject_employee_id, subject_name=subj["name"],
        reviewer_employee_id=reviewer_emp_id, reviewer_name=reviewer_name,
        review_type=body.review_type, status="pending",
        competencies=[{"competency": c, "rating": 0} for c in (cycle.get("competencies") or [])],
    ).model_dump()
    await db.reviews.insert_one(doc)
    doc.pop("_id", None)
    return doc


@reviews_router.get("")
async def list_reviews(
    cycle_id: Optional[str] = None,
    subject_employee_id: Optional[str] = None,
    reviewer_employee_id: Optional[str] = None,
    review_type: Optional[str] = None,
    status: Optional[str] = None,
    mine: bool = False,
    user=Depends(get_current_user),
):
    db = get_db()
    cid = _cid(user)
    flt: dict = {"company_id": cid}
    if cycle_id:
        flt["cycle_id"] = cycle_id
    if review_type:
        flt["review_type"] = review_type
    if status:
        flt["status"] = status

    if _is_hr(user):
        if subject_employee_id:
            flt["subject_employee_id"] = subject_employee_id
        if reviewer_employee_id:
            flt["reviewer_employee_id"] = reviewer_employee_id
    else:
        emp = user.get("employee_id")
        if not emp:
            raise HTTPException(403, "No employee record on this user")
        if mine:
            flt["reviewer_employee_id"] = emp
        else:
            # Can see reviews where user is subject (after shared) or reviewer
            flt["$or"] = [
                {"reviewer_employee_id": emp},
                {"subject_employee_id": emp, "status": "shared"},
            ]
    rows = await db.reviews.find(flt, {"_id": 0}).sort("updated_at", -1).to_list(2000)
    return rows


@reviews_router.get("/{rid}")
async def get_review(rid: str, user=Depends(get_current_user)):
    db = get_db()
    cid = _cid(user)
    doc = await db.reviews.find_one({"id": rid, "company_id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Review not found")
    if _is_hr(user):
        return doc
    emp = user.get("employee_id")
    if emp == doc.get("reviewer_employee_id"):
        return doc
    if emp == doc.get("subject_employee_id") and doc.get("status") == "shared":
        return doc
    raise HTTPException(403, "Not allowed to view this review")


@reviews_router.post("/{rid}/submit")
async def submit_review(rid: str, body: ReviewSubmit, user=Depends(get_current_user)):
    db = get_db()
    cid = _cid(user)
    doc = await db.reviews.find_one({"id": rid, "company_id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Review not found")
    if doc.get("status") in ("calibrated", "shared"):
        raise HTTPException(400, "Review is locked")
    # Permission — only reviewer or HR
    if not _is_hr(user) and user.get("employee_id") != doc.get("reviewer_employee_id"):
        raise HTTPException(403, "Only the assigned reviewer can submit")
    if body.overall_rating not in (1, 2, 3, 4, 5):
        raise HTTPException(400, "overall_rating must be 1..5")
    updates = {
        "overall_rating": body.overall_rating,
        "competencies": [c.model_dump() if hasattr(c, "model_dump") else dict(c) for c in body.competencies],
        "strengths": body.strengths, "improvements": body.improvements,
        "comments": body.comments, "goals_comment": body.goals_comment,
        "promotion_recommendation": body.promotion_recommendation,
        "status": "submitted", "submitted_at": now_iso(), "updated_at": now_iso(),
    }
    await db.reviews.update_one({"id": rid, "company_id": cid}, {"$set": updates})
    return await db.reviews.find_one({"id": rid}, {"_id": 0})


@reviews_router.post("/{rid}/share")
async def share_review(rid: str, user=Depends(require_roles(*HR_ROLES))):
    """HR shares the submitted review with the subject (makes it visible)."""
    db = get_db()
    cid = _cid(user)
    r = await db.reviews.update_one(
        {"id": rid, "company_id": cid, "status": "submitted"},
        {"$set": {"status": "shared", "shared_at": now_iso(), "updated_at": now_iso()}},
    )
    if r.matched_count == 0:
        raise HTTPException(400, "Only submitted reviews can be shared")
    return await db.reviews.find_one({"id": rid}, {"_id": 0})


@reviews_router.delete("/{rid}")
async def delete_review(rid: str, user=Depends(require_roles(*HR_ROLES))):
    db = get_db()
    cid = _cid(user)
    doc = await db.reviews.find_one({"id": rid, "company_id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Review not found")
    if doc.get("status") in ("submitted", "shared", "calibrated"):
        raise HTTPException(400, "Cannot delete submitted/shared reviews")
    await db.reviews.delete_one({"id": rid, "company_id": cid})
    return {"ok": True}


# ---------------------------------------------------------------------------
# 9-Box Grid (calibration)
# ---------------------------------------------------------------------------
@ninebox_router.post("")
async def upsert_placement(body: NineBoxUpsert, user=Depends(require_roles(*HR_ROLES))):
    db = get_db()
    cid = _cid(user)
    await _cycle_or_404(db, cid, body.cycle_id)
    emp = await _owner_employee(db, cid, body.employee_id)
    label = nine_box_label(body.performance, body.potential)
    existing = await db.nine_box.find_one({
        "company_id": cid, "cycle_id": body.cycle_id, "employee_id": body.employee_id,
    }, {"_id": 0})
    if existing:
        await db.nine_box.update_one(
            {"id": existing["id"]},
            {"$set": {
                "performance": body.performance, "potential": body.potential,
                "box": label["box"], "box_label": label["label"],
                "notes": body.notes, "placed_by": user.get("id"),
                "updated_at": now_iso(),
            }},
        )
        return await db.nine_box.find_one({"id": existing["id"]}, {"_id": 0})
    doc = NineBoxPlacement(
        company_id=cid, cycle_id=body.cycle_id,
        employee_id=body.employee_id, employee_name=emp["name"],
        performance=body.performance, potential=body.potential,
        box=label["box"], box_label=label["label"],
        notes=body.notes, placed_by=user.get("id"),
    ).model_dump()
    await db.nine_box.insert_one(doc)
    doc.pop("_id", None)
    return doc


@ninebox_router.get("")
async def list_placements(cycle_id: Optional[str] = None, user=Depends(require_roles(*HR_ROLES))):
    db = get_db()
    cid = _cid(user)
    flt = {"company_id": cid}
    if cycle_id:
        flt["cycle_id"] = cycle_id
    rows = await db.nine_box.find(flt, {"_id": 0}).to_list(5000)
    # Aggregate grid counts
    grid: dict = {str(i): [] for i in range(1, 10)}
    for r in rows:
        grid[str(r["box"])].append(r)
    return {"placements": rows, "grid": grid}


@ninebox_router.delete("/{pid}")
async def delete_placement(pid: str, user=Depends(require_roles(*HR_ROLES))):
    db = get_db()
    r = await db.nine_box.delete_one({"id": pid, "company_id": _cid(user)})
    if r.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# PIPs (Performance Improvement Plans)
# ---------------------------------------------------------------------------
@pips_router.post("")
async def create_pip(body: PIPCreate, user=Depends(require_roles(*MANAGER_ROLES))):
    db = get_db()
    cid = _cid(user)
    emp = await _owner_employee(db, cid, body.employee_id)
    milestones = [m.model_dump() if hasattr(m, "model_dump") else dict(m) for m in (body.milestones or [])]
    for m in milestones:
        m.setdefault("id", uid())
        m.setdefault("status", "pending")
    doc = PIP(
        company_id=cid,
        employee_id=body.employee_id, employee_name=emp["name"],
        manager_id=emp.get("manager_id"),
        start_date=body.start_date, end_date=body.end_date,
        concerns_markdown=body.concerns_markdown,
        expectations_markdown=body.expectations_markdown,
        milestones=milestones, status="active",
        hr_owner_user_id=user.get("id") if _is_hr(user) else None,
    ).model_dump()
    await db.pips.insert_one(doc)
    doc.pop("_id", None)
    return doc


@pips_router.get("")
async def list_pips(
    employee_id: Optional[str] = None, status: Optional[str] = None,
    user=Depends(get_current_user),
):
    db = get_db()
    cid = _cid(user)
    flt: dict = {"company_id": cid}
    if status:
        flt["status"] = status
    if _is_hr(user):
        if employee_id:
            flt["employee_id"] = employee_id
    elif user.get("role") in ("branch_manager", "sub_manager", "assistant_manager"):
        me = user.get("employee_id")
        reports = await db.employees.find({"company_id": cid, "manager_id": me}, {"_id": 0, "id": 1}).to_list(500)
        ids = [r["id"] for r in reports]
        flt["employee_id"] = {"$in": ids}
    else:
        # Employees see their own PIPs only
        flt["employee_id"] = user.get("employee_id")
    rows = await db.pips.find(flt, {"_id": 0}).sort("updated_at", -1).to_list(1000)
    return rows


@pips_router.get("/{pid}")
async def get_pip(pid: str, user=Depends(get_current_user)):
    db = get_db()
    cid = _cid(user)
    doc = await db.pips.find_one({"id": pid, "company_id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "PIP not found")
    if _is_hr(user):
        return doc
    emp = user.get("employee_id")
    if emp == doc["employee_id"] or emp == doc.get("manager_id"):
        return doc
    raise HTTPException(403, "Not allowed")


@pips_router.post("/{pid}/milestones/{mid}/status")
async def update_milestone(pid: str, mid: str, body: dict, user=Depends(get_current_user)):
    db = get_db()
    cid = _cid(user)
    doc = await db.pips.find_one({"id": pid, "company_id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "PIP not found")
    if not _is_hr(user) and user.get("employee_id") != doc.get("manager_id"):
        raise HTTPException(403, "Only manager or HR can update milestones")
    new_status = body.get("status")
    if new_status not in ("pending", "met", "missed"):
        raise HTTPException(400, "status must be pending|met|missed")
    milestones = doc.get("milestones") or []
    for m in milestones:
        if m.get("id") == mid:
            m["status"] = new_status
            m["evidence"] = body.get("evidence") or m.get("evidence")
            m["completed_on"] = now_iso() if new_status != "pending" else None
            break
    else:
        raise HTTPException(404, "Milestone not found")
    await db.pips.update_one({"id": pid, "company_id": cid},
                             {"$set": {"milestones": milestones, "updated_at": now_iso()}})
    return await db.pips.find_one({"id": pid}, {"_id": 0})


@pips_router.post("/{pid}/outcome")
async def close_pip(pid: str, body: PIPOutcome, user=Depends(require_roles(*MANAGER_ROLES))):
    db = get_db()
    cid = _cid(user)
    doc = await db.pips.find_one({"id": pid, "company_id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "PIP not found")
    if doc.get("status") in ("passed", "failed", "cancelled"):
        raise HTTPException(400, "PIP already closed")
    new_status = "passed" if body.outcome == "passed" else ("failed" if body.outcome == "failed" else doc["status"])
    await db.pips.update_one(
        {"id": pid, "company_id": cid},
        {"$set": {"outcome": body.outcome, "outcome_notes": body.outcome_notes,
                  "status": new_status, "updated_at": now_iso()}},
    )
    return await db.pips.find_one({"id": pid}, {"_id": 0})
