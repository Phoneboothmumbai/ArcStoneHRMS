"""Phase 1D — Notifications engine.
Event-based, multi-channel (in-app now, email scaffolded). Idempotent dispatch.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

from db import get_db
from models import BaseDoc, now_iso, uid

log = logging.getLogger("hrms.notify")

# ------------ Event registry (source-of-truth for human text) ------------
EVENTS = {
    "leave.submitted":         ("Leave requested", "{actor} applied for {leave_type} on {dates}"),
    "leave.approved":          ("Leave approved", "Your {leave_type} on {dates} was approved"),
    "leave.rejected":          ("Leave rejected", "Your {leave_type} on {dates} was rejected"),
    "leave.cancelled":         ("Leave cancelled", "{actor} cancelled {leave_type} on {dates}"),
    "approval.pending":        ("Approval pending", "{actor} needs your approval: {title}"),
    "approval.approved":       ("Approval approved", "{approver} approved: {title}"),
    "approval.rejected":       ("Approval rejected", "{approver} rejected: {title}"),
    "regularization.submitted":("Regularization requested", "{actor} submitted regularization for {date}"),
    "regularization.decided":  ("Regularization {status}", "Your regularization for {date} was {status}"),
    "overtime.submitted":      ("Overtime requested", "{actor} requested {hours}h OT on {date}"),
    "overtime.decided":        ("Overtime {status}", "Your overtime ({hours}h on {date}) was {status}"),
    "timesheet.submitted":     ("Timesheet submitted", "{actor} submitted timesheet for week of {week}"),
    "timesheet.decided":       ("Timesheet {status}", "Your timesheet for week of {week} was {status}"),
    "onboarding.task_assigned":("Onboarding task", "{title} — due {due_date}"),
    "offboarding.initiated":   ("Exit initiated", "{employee} has initiated exit — LWD {lwd}"),
    "profile.incomplete":      ("Profile incomplete", "Your profile is only {pct}% complete"),
    "probation.due":           ("Probation review due", "{employee}'s probation ends on {date}"),
    "birthday.today":          ("🎂 Birthday today", "Wish {employee} a happy birthday"),
    "work_anniversary.today":  ("🎉 Work anniversary", "{employee} completes {years} year(s) at the company"),
    "module.activated":        ("Module activated", "{module} is now available for your company"),
    "kb.article":              ("New help article", "{title}"),
}

Channel = Literal["in_app", "email", "push"]


class Notification(BaseDoc):
    company_id: str
    recipient_user_id: str
    event: str                       # from EVENTS
    title: str
    body: str
    link: Optional[str] = None       # front-end route to open on click
    data: dict = Field(default_factory=dict)
    read: bool = False
    read_at: Optional[str] = None
    dedup_key: Optional[str] = None  # idempotency


class NotificationPreference(BaseDoc):
    user_id: str
    channels: dict = Field(default_factory=lambda: {"in_app": True, "email": True, "push": False})
    mute_events: List[str] = Field(default_factory=list)
    digest_frequency: Literal["realtime", "daily", "weekly", "off"] = "realtime"


# ------------ Channel senders ------------
async def _send_email(to_email: str, subject: str, html: str) -> bool:
    """Scaffold for Resend. Real send happens only if RESEND_API_KEY present."""
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        log.debug("Email queued (RESEND_API_KEY not set) → %s", to_email)
        return False
    try:
        import requests  # already in requirements
        r = requests.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "from": os.environ.get("RESEND_FROM", "Arcstone <no-reply@arcstone.app>"),
                "to": [to_email], "subject": subject, "html": html,
            },
            timeout=10,
        )
        if r.status_code >= 300:
            log.warning("Resend error %s: %s", r.status_code, r.text[:200])
            return False
        return True
    except Exception as e:
        log.warning("Resend exception: %s", e)
        return False


# ------------ Core dispatch ------------
async def notify(
    *, company_id: str, recipient_user_id: str, event: str, link: Optional[str] = None,
    data: Optional[dict] = None, dedup_key: Optional[str] = None,
    custom_title: Optional[str] = None, custom_body: Optional[str] = None,
):
    """Create notification row (+ maybe email). Silent if user prefs mute it."""
    db = get_db()
    data = data or {}
    title_tpl, body_tpl = EVENTS.get(event, (event, "{}"))
    try:
        title = custom_title or title_tpl.format(**data)
        body = custom_body or body_tpl.format(**data)
    except KeyError:
        title = custom_title or title_tpl
        body = custom_body or body_tpl

    # Idempotency
    if dedup_key:
        existing = await db.notifications.find_one(
            {"recipient_user_id": recipient_user_id, "dedup_key": dedup_key}, {"_id": 0, "id": 1}
        )
        if existing:
            return existing

    # Prefs
    pref = await db.notification_prefs.find_one({"user_id": recipient_user_id}, {"_id": 0})
    channels = (pref or {}).get("channels", {"in_app": True, "email": True})
    if event in (pref or {}).get("mute_events", []):
        return None

    doc = Notification(
        company_id=company_id, recipient_user_id=recipient_user_id, event=event,
        title=title, body=body, link=link, data=data, dedup_key=dedup_key,
    ).model_dump()

    if channels.get("in_app", True):
        await db.notifications.insert_one(doc)
        doc.pop("_id", None)

    # Email (best-effort; failure doesn't affect in-app)
    if channels.get("email", True):
        user = await db.users.find_one(
            {"id": recipient_user_id}, {"_id": 0, "email": 1, "name": 1}
        )
        if user and user.get("email"):
            html = (f"<div style='font-family:-apple-system,sans-serif;padding:24px;max-width:560px;"
                    f"margin:0 auto;'>"
                    f"<h2 style='margin:0 0 12px'>{title}</h2>"
                    f"<p style='color:#555'>{body}</p>"
                    + (f"<p><a href='{link}' style='background:#000;color:#fff;padding:10px 16px;"
                       f"border-radius:6px;text-decoration:none'>Open in Arcstone</a></p>" if link else "")
                    + "<p style='color:#aaa;font-size:12px;margin-top:24px'>"
                      "You received this because of your notification preferences. "
                      "Change them in Arcstone → Settings.</p></div>")
            await _send_email(user["email"], f"[Arcstone] {title}", html)

    return doc


async def notify_many(
    *, company_id: str, recipient_user_ids: List[str], event: str,
    link: Optional[str] = None, data: Optional[dict] = None,
    dedup_key_prefix: Optional[str] = None,
):
    for uid_ in set(recipient_user_ids):
        if not uid_:
            continue
        dk = f"{dedup_key_prefix}:{uid_}" if dedup_key_prefix else None
        await notify(
            company_id=company_id, recipient_user_id=uid_, event=event,
            link=link, data=data, dedup_key=dk,
        )


# ------------ Helpers ------------
async def company_admins(db, company_id: str) -> List[str]:
    rows = await db.users.find(
        {"company_id": company_id, "role": {"$in": ["company_admin", "country_head", "region_head"]},
         "is_active": True}, {"_id": 0, "id": 1}
    ).to_list(50)
    return [r["id"] for r in rows]
