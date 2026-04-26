"""HR lifecycle alerts API.

POST /api/lifecycle/scan                  — recompute alerts for the company (idempotent).
GET  /api/lifecycle/alerts                — list alerts (HR sees company; employee sees their own birthday/festival).
POST /api/lifecycle/alerts/{id}/decide    — yes/no/later/dismiss action.
GET  /api/lifecycle/settings              — read settings (HR).
PUT  /api/lifecycle/settings              — update settings (HR).
POST /api/lifecycle/announce-new-joiner   — manual broadcast email when adding a hire.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from auth import get_current_user, require_roles
from db import get_db
from models import now_iso, uid
from models_lifecycle import (
    AlertDecision, DEFAULT_FESTIVALS_IN, LifecycleAlert, LifecycleSettings,
    NewJoinerAnnounceBody,
)

router = APIRouter(prefix="/api/lifecycle", tags=["lifecycle"])

HR = ("super_admin", "company_admin", "country_head", "region_head")


# --------------------------- helpers ---------------------------
async def _create_notification(db, *, recipient_user_id: str, title: str, body: str,
                               event: str = "lifecycle.alert", link: Optional[str] = None,
                               company_id: Optional[str] = None):
    """Insert a notification document; matches the shape used elsewhere."""
    doc = {
        "id": uid(),
        "company_id": company_id,
        "recipient_user_id": recipient_user_id,
        "title": title,
        "body": body,
        "event": event,
        "link": link,
        "read": False,
        "read_at": None,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.notifications.insert_one(doc)


async def _get_settings(db, cid: str) -> dict:
    s = await db.lifecycle_settings.find_one({"company_id": cid}, {"_id": 0})
    if s:
        return s
    s = LifecycleSettings(company_id=cid).model_dump()
    s["festivals"] = [
        {"name": f["name"], "date_pattern": f["date_pattern"], "message": f["message"], "active": True}
        for f in DEFAULT_FESTIVALS_IN
    ]
    await db.lifecycle_settings.insert_one(s)
    s.pop("_id", None)
    return s


def _today_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _md_dd(d: str) -> Optional[str]:
    """Extract MM-DD from a YYYY-MM-DD string (or None if invalid)."""
    if not d or len(d) < 10:
        return None
    try:
        date.fromisoformat(d[:10])
        return d[5:10]
    except Exception:
        return None


def _years_diff(start: str, today: date) -> int:
    try:
        s = date.fromisoformat(start[:10])
    except Exception:
        return 0
    return today.year - s.year - (1 if (today.month, today.day) < (s.month, s.day) else 0)


# --------------------------- endpoints ---------------------------
@router.post("/scan")
async def scan(user=Depends(require_roles(*HR))):
    """Recompute lifecycle alerts for the current company.

    Idempotent — never duplicates alerts of the same kind+employee+due_date.
    Also fires birthday + festival notifications to recipients (once per day).
    """
    db = get_db()
    cid = user.get("company_id")
    if not cid:
        raise HTTPException(400, "No company context")
    today = date.fromisoformat(_today_str())
    settings = await _get_settings(db, cid)
    p_months = int(settings.get("probation_months", 6))
    rev_months = int(settings.get("salary_review_months", 12))

    employees = await db.employees.find(
        {"company_id": cid, "status": {"$ne": "terminated"}}, {"_id": 0},
    ).to_list(5000)

    created = {"probation": 0, "salary_review": 0, "birthday": 0, "festival": 0}

    for emp in employees:
        joined = (emp.get("joined_on") or "")[:10]
        if not joined:
            continue
        try:
            dj = date.fromisoformat(joined)
        except Exception:
            continue

        # ----- Probation completion -----
        prob_end_str = emp.get("probation_end_date") or _add_months(dj, p_months).isoformat()
        try:
            prob_end = date.fromisoformat(prob_end_str)
        except Exception:
            prob_end = None
        if prob_end and prob_end <= today:
            existing = await db.lifecycle_alerts.find_one({
                "company_id": cid, "kind": "probation_completion",
                "employee_id": emp["id"], "due_date": prob_end.isoformat(),
            }, {"_id": 0})
            if not existing:
                alert = LifecycleAlert(
                    company_id=cid, kind="probation_completion",
                    employee_id=emp["id"], employee_name=emp["name"],
                    title=f"Probation complete — {emp['name']}",
                    body=f"{emp['name']} has completed {p_months} months. Generate the appointment / employment letter?",
                    options=["yes", "no", "later"],
                    due_date=prob_end.isoformat(),
                    payload={"probation_months": p_months, "joined_on": joined,
                             "job_title": emp.get("job_title")},
                ).model_dump()
                await db.lifecycle_alerts.insert_one(alert)
                created["probation"] += 1

        # ----- Salary review (annual) -----
        next_rev_str = emp.get("next_salary_review_on")
        if not next_rev_str:
            # Default to first anniversary
            next_rev_str = _add_months(dj, rev_months).isoformat()
        try:
            next_rev = date.fromisoformat(next_rev_str)
        except Exception:
            next_rev = None
        if next_rev and next_rev <= today:
            existing = await db.lifecycle_alerts.find_one({
                "company_id": cid, "kind": "salary_review_due",
                "employee_id": emp["id"], "due_date": next_rev.isoformat(),
            }, {"_id": 0})
            if not existing:
                # Pull current CTC for context
                sal = await db.employee_salaries.find_one(
                    {"company_id": cid, "employee_id": emp["id"], "is_current": True}, {"_id": 0},
                ) or {}
                cur_ctc = sal.get("ctc_annual", 0)
                alert = LifecycleAlert(
                    company_id=cid, kind="salary_review_due",
                    employee_id=emp["id"], employee_name=emp["name"],
                    title=f"Salary review due — {emp['name']}",
                    body=f"{emp['name']} completed another year. Current CTC ₹{cur_ctc:,.0f}. Approve increment?",
                    options=["yes", "no", "later"],
                    due_date=next_rev.isoformat(),
                    payload={"current_ctc": cur_ctc, "joined_on": joined,
                             "years_completed": _years_diff(joined, today)},
                ).model_dump()
                await db.lifecycle_alerts.insert_one(alert)
                created["salary_review"] += 1

        # ----- Birthday (today) -----
        if settings.get("send_birthday_wishes", True):
            dob = emp.get("date_of_birth")
            if dob and _md_dd(dob) == today.strftime("%m-%d"):
                already = await db.lifecycle_alerts.find_one({
                    "company_id": cid, "kind": "employee_birthday",
                    "employee_id": emp["id"], "due_date": today.isoformat(),
                }, {"_id": 0})
                if not already:
                    msg = settings.get("birthday_message_template", "🎂 Happy birthday {{name}}!").replace("{{name}}", emp["name"])
                    alert = LifecycleAlert(
                        company_id=cid, kind="employee_birthday",
                        employee_id=emp["id"], employee_name=emp["name"],
                        title=f"🎂 {emp['name']}'s birthday today!",
                        body=msg, options=["sent"],
                        due_date=today.isoformat(),
                        payload={"message": msg},
                        status="done", result="sent",
                    ).model_dump()
                    await db.lifecycle_alerts.insert_one(alert)
                    # Fire notification to the employee + their manager
                    if emp.get("user_id"):
                        await _create_notification(db, recipient_user_id=emp["user_id"],
                            title="🎂 Happy birthday!", body=msg,
                            event="lifecycle.birthday", company_id=cid)
                    if emp.get("manager_id"):
                        mgr = await db.employees.find_one({"id": emp["manager_id"]}, {"_id": 0})
                        if mgr and mgr.get("user_id"):
                            await _create_notification(db, recipient_user_id=mgr["user_id"],
                                title=f"🎂 {emp['name']}'s birthday today",
                                body=f"Drop {emp['name']} a wish today!",
                                event="lifecycle.birthday", company_id=cid)
                    created["birthday"] += 1

    # ----- Festivals (today matches) -----
    today_md = today.strftime("%m-%d")
    for fest in (settings.get("festivals") or []):
        if not fest.get("active", True):
            continue
        if fest.get("date_pattern") != today_md:
            continue
        existing = await db.lifecycle_alerts.find_one({
            "company_id": cid, "kind": "festival_greeting",
            "due_date": today.isoformat(), "payload.festival_name": fest["name"],
        }, {"_id": 0})
        if existing:
            continue
        alert = LifecycleAlert(
            company_id=cid, kind="festival_greeting",
            title=f"🎉 {fest['name']}", body=fest.get("message", ""),
            options=["sent"], due_date=today.isoformat(),
            payload={"festival_name": fest["name"], "message": fest.get("message", "")},
            status="done", result="sent",
        ).model_dump()
        await db.lifecycle_alerts.insert_one(alert)
        # Broadcast to every active employee user
        active_users = await db.users.find(
            {"company_id": cid, "is_active": True}, {"_id": 0, "id": 1, "name": 1},
        ).to_list(5000)
        for u in active_users:
            await _create_notification(db, recipient_user_id=u["id"],
                title=f"🎉 {fest['name']}", body=fest.get("message", ""),
                event="lifecycle.festival", company_id=cid)
        created["festival"] += 1

    # Stamp last_scan_at
    await db.lifecycle_settings.update_one(
        {"company_id": cid}, {"$set": {"last_scan_at": now_iso()}}, upsert=True,
    )
    return {"ok": True, "created": created, "scanned_employees": len(employees)}


def _add_months(d: date, months: int) -> date:
    """Add months to a date safely (handles month-end clamping)."""
    y = d.year + (d.month - 1 + months) // 12
    m = (d.month - 1 + months) % 12 + 1
    # Clamp day to last day of target month
    from calendar import monthrange
    last = monthrange(y, m)[1]
    return d.replace(year=y, month=m, day=min(d.day, last))


@router.get("/alerts")
async def list_alerts(
    user=Depends(get_current_user),
    status: Optional[str] = Query(None, description="open | snoozed | done | dismissed"),
    kind: Optional[str] = Query(None),
    limit: int = 200,
):
    db = get_db()
    cid = user.get("company_id")
    flt = {"company_id": cid}
    if status:
        flt["status"] = status
    if kind:
        flt["kind"] = kind
    if user["role"] == "employee" and user.get("employee_id"):
        # Employees only see their own birthday/festival cards
        flt["$or"] = [
            {"employee_id": user["employee_id"]},
            {"kind": {"$in": ["festival_greeting"]}},
        ]
    rows = await db.lifecycle_alerts.find(flt, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return rows


@router.post("/alerts/{aid}/decide")
async def decide(aid: str, body: AlertDecision, user=Depends(require_roles(*HR))):
    db = get_db()
    cid = user.get("company_id")
    alert = await db.lifecycle_alerts.find_one({"id": aid, "company_id": cid}, {"_id": 0})
    if not alert:
        raise HTTPException(404, "Alert not found")
    if alert["status"] not in ("open", "snoozed"):
        raise HTTPException(400, "Alert already actioned")

    patch = {"updated_at": now_iso(), "decided_by": user["id"], "decided_at": now_iso(),
             "result": body.decision}
    extras = {}

    if body.decision == "later":
        if not body.remind_on:
            raise HTTPException(400, "remind_on (YYYY-MM-DD) is required when deciding 'later'")
        patch["status"] = "snoozed"
        patch["snoozed_until"] = body.remind_on
    elif body.decision == "dismiss":
        patch["status"] = "dismissed"
    elif body.decision == "no":
        patch["status"] = "done"
        # If salary review and no — schedule the next anniversary +12mo
        if alert["kind"] == "salary_review_due" and alert.get("employee_id"):
            try:
                nxt = _add_months(date.fromisoformat(alert["due_date"]), 12).isoformat()
                await db.employees.update_one(
                    {"id": alert["employee_id"]}, {"$set": {"next_salary_review_on": nxt}},
                )
                extras["next_review_on"] = nxt
            except Exception:
                pass
    elif body.decision == "yes":
        patch["status"] = "done"
        # ----- Probation YES → auto-generate employment / appointment letter -----
        if alert["kind"] == "probation_completion" and alert.get("employee_id"):
            tpl = await db.letter_templates.find_one(
                {"company_id": cid, "category": "appointment", "is_active": True}, {"_id": 0},
            )
            if not tpl:
                # Auto-create a default appointment template if missing
                tpl = {
                    "id": uid(), "company_id": cid,
                    "name": "Appointment / Employment Confirmation",
                    "slug": "appointment-confirmation",
                    "category": "appointment",
                    "body_markdown": (
                        "**Date:** {{today}}\n\n"
                        "**To:** {{employee_name}} ({{employee_code}})\n\n"
                        "Dear {{employee_name}},\n\n"
                        "We are pleased to confirm your appointment as **{{designation}}** with us. "
                        "Following the successful completion of your probation period, your services are now "
                        "regularised effective from {{today}}. Your current annual cost-to-company is "
                        "₹{{ctc_annual}}.\n\n"
                        "We look forward to your continued contribution.\n\n"
                        "Best regards,\nHuman Resources"
                    ),
                    "merge_fields": ["employee_name", "employee_code", "designation", "today", "ctc_annual"],
                    "is_active": True,
                    "created_at": now_iso(), "updated_at": now_iso(),
                }
                await db.letter_templates.insert_one(tpl)
            # Emp + comp lookups
            emp = await db.employees.find_one({"id": alert["employee_id"]}, {"_id": 0}) or {}
            sal = await db.employee_salaries.find_one(
                {"company_id": cid, "employee_id": alert["employee_id"], "is_current": True}, {"_id": 0},
            ) or {}
            merge = {
                "today": _today_str(),
                "employee_name": emp.get("name", ""),
                "employee_code": emp.get("employee_code", ""),
                "designation": emp.get("job_title", ""),
                "ctc_annual": f"{sal.get('ctc_annual', 0):.0f}",
                "doj": (emp.get("joined_on") or "")[:10],
            }
            from routers.letters_routes import _render
            rendered = _render(tpl["body_markdown"], merge)
            letter = {
                "id": uid(), "company_id": cid, "template_id": tpl["id"],
                "template_name": tpl["name"], "category": "appointment",
                "employee_id": alert["employee_id"], "employee_name": emp.get("name"),
                "rendered_markdown": rendered, "merge_values": merge,
                "status": "generated", "signatures": [],
                "issued_by": user["id"], "issued_at": now_iso(),
                "created_at": now_iso(), "updated_at": now_iso(),
            }
            await db.generated_letters.insert_one(letter)
            extras["letter_id"] = letter["id"]
            # Notify employee
            if emp.get("user_id"):
                await _create_notification(db, recipient_user_id=emp["user_id"],
                    title="Your appointment letter is ready",
                    body="Following your probation completion, please review and acknowledge your appointment letter.",
                    event="letter.issued",
                    link=f"/app/my-letters/{letter['id']}", company_id=cid)
        # ----- Salary review YES → update compensation -----
        if alert["kind"] == "salary_review_due" and alert.get("employee_id"):
            if not body.new_ctc_annual or body.new_ctc_annual <= 0:
                raise HTTPException(400, "new_ctc_annual is required when approving a salary review")
            from routers.payroll_routes import _compute_lines, _compute_totals
            from models_payroll import EmployeeSalary
            components = await db.salary_components.find(
                {"company_id": cid, "is_active": True}, {"_id": 0},
            ).to_list(200)
            DEFAULTS = {
                "BASIC": ("pct_of_ctc", 50.0), "HRA": ("pct_of_basic", 40.0),
                "SPECIAL": ("pct_of_ctc", 20.0), "CONV": ("fixed", 1600.0),
                "MEDICAL": ("fixed", 1250.0), "LTA": ("pct_of_ctc", 5.0),
                "PF": ("statutory", 0), "ESIC": ("statutory", 0),
                "PT": ("statutory", 0), "EMPF": ("statutory", 0),
            }
            structure_lines = [
                {"component_id": c["id"], "component_code": c["code"], "component_name": c["name"],
                 "calculation_type": DEFAULTS[c["code"]][0], "value": DEFAULTS[c["code"]][1]}
                for c in components if c["code"] in DEFAULTS
            ]
            lines = _compute_lines(body.new_ctc_annual, components, structure_lines, {})
            gross, net = _compute_totals(lines)
            # Archive existing current
            await db.employee_salaries.update_many(
                {"company_id": cid, "employee_id": alert["employee_id"], "is_current": True},
                {"$set": {"is_current": False, "effective_to": _today_str(), "updated_at": now_iso()}},
            )
            emp = await db.employees.find_one({"id": alert["employee_id"]}, {"_id": 0}) or {}
            new_sal = EmployeeSalary(
                company_id=cid, employee_id=alert["employee_id"],
                employee_name=emp.get("name", ""), employee_code=emp.get("employee_code", ""),
                effective_from=_today_str(), ctc_annual=body.new_ctc_annual,
                gross_monthly=gross, net_monthly_estimate=net, lines=lines, tax_regime="new",
                revised_reason=body.revised_reason or "Annual salary review",
            ).model_dump()
            await db.employee_salaries.insert_one(new_sal)
            extras["new_salary_id"] = new_sal["id"]
            # Push next review date a year out
            try:
                nxt = _add_months(date.fromisoformat(alert["due_date"]), 12).isoformat()
                await db.employees.update_one(
                    {"id": alert["employee_id"]}, {"$set": {"next_salary_review_on": nxt}},
                )
                extras["next_review_on"] = nxt
            except Exception:
                pass
            # Notify employee
            if emp.get("user_id"):
                await _create_notification(db, recipient_user_id=emp["user_id"],
                    title="Your annual salary has been revised 🎉",
                    body=f"Effective {_today_str()}, your new annual CTC is ₹{body.new_ctc_annual:,.0f}. "
                         f"You'll see the updated amount in your next payslip.",
                    event="compensation.revised", company_id=cid,
                    link="/app/my-compensation")

    if body.note:
        patch["payload"] = {**(alert.get("payload") or {}), "decision_note": body.note}

    await db.lifecycle_alerts.update_one({"id": aid}, {"$set": patch})
    out = await db.lifecycle_alerts.find_one({"id": aid}, {"_id": 0})
    out["__extras"] = extras
    return out


@router.get("/settings")
async def get_settings(user=Depends(require_roles(*HR))):
    db = get_db()
    return await _get_settings(db, user.get("company_id"))


@router.put("/settings")
async def update_settings(payload: dict, user=Depends(require_roles(*HR))):
    db = get_db()
    cid = user.get("company_id")
    allowed = {"probation_months", "salary_review_months", "send_birthday_wishes",
               "birthday_message_template", "festivals", "new_joiner_default_scope"}
    patch = {k: v for k, v in payload.items() if k in allowed}
    if not patch:
        raise HTTPException(400, "Nothing to update")
    patch["updated_at"] = now_iso()
    await db.lifecycle_settings.update_one(
        {"company_id": cid}, {"$set": patch}, upsert=True,
    )
    return await _get_settings(db, cid)


@router.post("/announce-new-joiner")
async def announce_new_joiner(body: NewJoinerAnnounceBody, user=Depends(require_roles(*HR))):
    db = get_db()
    cid = user.get("company_id")
    emp = await db.employees.find_one({"id": body.employee_id, "company_id": cid}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employee not found")
    # Build recipient pool
    flt: dict = {"company_id": cid, "is_active": True}
    if body.scope == "department":
        emp_ids = [e["id"] for e in await db.employees.find(
            {"company_id": cid, "department_id": emp.get("department_id")}, {"_id": 0, "id": 1}
        ).to_list(5000)]
        flt["employee_id"] = {"$in": emp_ids}
    elif body.scope == "branch":
        emp_ids = [e["id"] for e in await db.employees.find(
            {"company_id": cid, "branch_id": emp.get("branch_id")}, {"_id": 0, "id": 1}
        ).to_list(5000)]
        flt["employee_id"] = {"$in": emp_ids}
    elif body.scope == "team":
        emp_ids = [e["id"] for e in await db.employees.find(
            {"company_id": cid, "manager_id": emp.get("manager_id")}, {"_id": 0, "id": 1}
        ).to_list(5000)]
        flt["employee_id"] = {"$in": emp_ids}

    recipients = await db.users.find(flt, {"_id": 0, "id": 1, "name": 1}).to_list(5000)
    title = f"👋 Please welcome {emp['name']} to the team"
    body_msg = body.custom_message or (
        f"{emp['name']} has joined as **{emp.get('job_title')}** in "
        f"{emp.get('department_name') or 'our team'}. Say hello and help them settle in!"
    )
    for u in recipients:
        await _create_notification(db, recipient_user_id=u["id"],
            title=title, body=body_msg, event="lifecycle.new_joiner", company_id=cid)

    # Log an alert card so HR has a record
    rec_alert = LifecycleAlert(
        company_id=cid, kind="new_joiner_announcement",
        employee_id=emp["id"], employee_name=emp["name"],
        title=f"Welcome announcement sent — {emp['name']}",
        body=f"Sent to {len(recipients)} {body.scope} colleague(s).",
        options=["sent"], status="done", result="sent",
        due_date=_today_str(),
        payload={"scope": body.scope, "recipient_count": len(recipients), "message": body_msg},
    ).model_dump()
    await db.lifecycle_alerts.insert_one(rec_alert)

    return {"ok": True, "recipient_count": len(recipients), "scope": body.scope}
