"""Background cleanup tasks.

A simple asyncio loop that runs periodically and:
  • Purges location_pings older than each company's `location_retention_days`
    (default 60). Pings are PII and we honour the retention promise displayed
    on the live-tracking page.

Started from FastAPI's lifespan in `server.py`. Failures are swallowed so a
bad iteration never crashes the server — they're logged for ops to inspect.
"""
from __future__ import annotations
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from db import get_db

log = logging.getLogger("arcstone.cleanup")

DEFAULT_RETENTION_DAYS = 60
SLEEP_SECONDS = 6 * 60 * 60     # every 6 hours
INITIAL_DELAY_SECONDS = 60      # don't run immediately on boot


async def _purge_location_pings_once() -> dict:
    """Iterate companies, derive each one's retention, delete old pings.

    Returns a small summary so the call site (or a manual trigger) can log it.
    """
    db = get_db()
    summary = {"companies": 0, "deleted": 0}
    try:
        # Pull every company's retention setting in one go
        settings_cursor = db.company_settings.find(
            {}, {"_id": 0, "company_id": 1, "location_retention_days": 1},
        )
        async for s in settings_cursor:
            cid = s.get("company_id")
            days = int(s.get("location_retention_days") or DEFAULT_RETENTION_DAYS)
            cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
            res = await db.location_pings.delete_many({
                "company_id": cid,
                "captured_at": {"$lt": cutoff},
            })
            summary["companies"] += 1
            summary["deleted"] += res.deleted_count
        # Catch-all: companies that haven't created settings yet
        cutoff_default = (datetime.now(timezone.utc) - timedelta(days=DEFAULT_RETENTION_DAYS)).isoformat()
        res2 = await db.location_pings.delete_many({
            "company_id": {"$exists": False},
            "captured_at": {"$lt": cutoff_default},
        })
        summary["deleted"] += res2.deleted_count
    except Exception as e:
        log.exception("location_pings purge failed: %s", e)
    return summary


async def _fire_due_recurring_expenses_once() -> dict:
    """Iterate active recurring expense templates whose next_run_at has passed.
    Auto-create draft/submitted expense claims, idempotent on (template_id, period_month).
    """
    from routers.branch_ops_routes import _create_expense_from_template
    db = get_db()
    summary = {"fired": 0, "errors": 0}
    try:
        now_iso_str = datetime.now(timezone.utc).isoformat()
        period = datetime.now(timezone.utc).strftime("%Y-%m")
        cursor = db.recurring_expense_templates.find(
            {"active": True, "next_run_at": {"$lte": now_iso_str},
             "mode": {"$in": ["AUTO_SUBMIT", "AUTO_DRAFT"]}},
            {"_id": 0},
        )
        async for tpl in cursor:
            try:
                await _create_expense_from_template(
                    db, tpl, period, triggered_by="cron", mode=tpl.get("mode", "AUTO_DRAFT"),
                )
                summary["fired"] += 1
            except Exception:
                log.exception("recurring expense fire failed for %s", tpl.get("id"))
                summary["errors"] += 1
    except Exception as e:
        log.exception("recurring expense sweep failed: %s", e)
    return summary


async def cleanup_loop():
    """Long-running asyncio task. Cancellable on shutdown."""
    await asyncio.sleep(INITIAL_DELAY_SECONDS)
    while True:
        try:
            s = await _purge_location_pings_once()
            if s["deleted"]:
                log.info("location pings purged: %s", s)
            r = await _fire_due_recurring_expenses_once()
            if r["fired"] or r["errors"]:
                log.info("recurring expenses sweep: %s", r)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("cleanup iteration failed")
        try:
            await asyncio.sleep(SLEEP_SECONDS)
        except asyncio.CancelledError:
            raise
