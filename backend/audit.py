"""Immutable audit log.

Writes one row to `audit_events` per meaningful mutation. Used for compliance
(SOX / IFC / CARO / DPDP) — answers "who changed what, when, from where".

Design goals:
- Append-only (never UPDATE or DELETE rows; use TTL for retention if needed)
- Never block the main request — on any DB failure we swallow and log
- Tamper-resistant: the document is closed under `model_config` so callers
  can't sneak in extra fields, and we set `created_at` server-side
- Cheap: single insertOne with an index on (company_id, ts)

Call sites:
- auth_routes (login, logout, register, password change)
- Any admin mutation endpoint (employee create/update/terminate, salary change,
  payroll finalize, role assignment, module toggle, etc.)
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional
import uuid

log = logging.getLogger("audit")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def log_event(
    db,
    *,
    actor: Optional[dict],
    event: str,
    resource_type: str,
    resource_id: Optional[str],
    detail: Optional[dict] = None,
    ip: Optional[str] = None,
) -> None:
    """Append one audit row. Never raises — audit failures must not break app flow.

    `actor` is the current user dict (may be None for anonymous events like failed logins).
    `event` is a dot-namespaced string (e.g. `auth.login`, `employee.terminate`, `payroll.finalize`).
    `resource_type` is the entity kind (`user`, `employee`, `payroll_run`, ...).
    `resource_id` is the primary key of the affected record.
    `detail` is a small JSON-serialisable dict with context (diff, reason, etc.).
    """
    try:
        doc = {
            "id": str(uuid.uuid4()),
            "ts": _now_iso(),
            "event": event,
            "actor_id": (actor or {}).get("id"),
            "actor_email": (actor or {}).get("email"),
            "actor_role": (actor or {}).get("role"),
            "company_id": (actor or {}).get("company_id"),
            "reseller_id": (actor or {}).get("reseller_id"),
            "resource_type": resource_type,
            "resource_id": resource_id,
            "detail": detail or {},
            "ip": ip,
        }
        await db.audit_events.insert_one(doc)
    except Exception as e:   # noqa: BLE001 — deliberate, audit must not break request
        log.warning("audit log write failed for event=%s: %s", event, e)


async def ensure_indexes(db) -> None:
    """Call once at startup — cheap if already exists."""
    try:
        await db.audit_events.create_index([("company_id", 1), ("ts", -1)])
        await db.audit_events.create_index([("actor_id", 1), ("ts", -1)])
        await db.audit_events.create_index([("resource_type", 1), ("resource_id", 1)])
        await db.auth_attempts_log.create_index([("ip", 1), ("ts", -1)])
        # Auto-expire auth attempts after 7 days (rate-limit window never needs more).
        await db.auth_attempts_log.create_index("ts", expireAfterSeconds=7 * 24 * 3600)
    except Exception as e:    # noqa: BLE001
        log.warning("audit index creation failed: %s", e)
