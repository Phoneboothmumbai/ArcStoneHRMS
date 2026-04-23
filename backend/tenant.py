"""Tenant isolation primitives — middleware + query wrapper + module entitlement guard.
All tenant-scoped reads/writes MUST go through these helpers.
"""
from __future__ import annotations
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request

from auth import get_current_user
from db import get_db
from modules_catalog import MODULES, get_module


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Tenant query wrapper — auto-scopes every query to the user's company.
# Any DB call that doesn't go through this helper is a code-review flag.
# ---------------------------------------------------------------------------
class TenantDB:
    """Wraps a Mongo collection to auto-inject company_id on every query."""

    def __init__(self, coll, company_id: str):
        self._coll = coll
        self._cid = company_id

    def _scoped(self, f):
        f = dict(f or {})
        f["company_id"] = self._cid
        return f

    async def find_one(self, f=None, projection=None):
        return await self._coll.find_one(self._scoped(f), projection or {"_id": 0})

    def find(self, f=None, projection=None):
        return self._coll.find(self._scoped(f), projection or {"_id": 0})

    async def insert_one(self, doc: dict):
        doc = {**doc, "company_id": self._cid}
        return await self._coll.insert_one(doc)

    async def update_one(self, f, update):
        return await self._coll.update_one(self._scoped(f), update)

    async def update_many(self, f, update):
        return await self._coll.update_many(self._scoped(f), update)

    async def delete_one(self, f):
        return await self._coll.delete_one(self._scoped(f))

    async def delete_many(self, f):
        return await self._coll.delete_many(self._scoped(f))

    async def count_documents(self, f=None):
        return await self._coll.count_documents(self._scoped(f))

    def aggregate(self, pipeline):
        # prepend $match on company_id for safety
        return self._coll.aggregate([{"$match": {"company_id": self._cid}}] + list(pipeline))


def tenant(collection_name: str, user: dict) -> TenantDB:
    """Return a TenantDB wrapper bound to the user's company.
    Usage in routers:
        vendors = tenant("vendors", user)
        rows = await vendors.find().to_list(1000)
    """
    cid = user.get("company_id")
    if not cid:
        raise HTTPException(403, "No tenant scope on current user")
    db = get_db()
    return TenantDB(db[collection_name], cid)


# ---------------------------------------------------------------------------
# Module entitlement guard
# ---------------------------------------------------------------------------
async def _company_has_module(db, company_id: str, module_id: str) -> bool:
    """True if module is active for the company AND not past trial expiry."""
    if module_id == "base_hrms":
        # base is always on (included_by_default) — implicit entitlement
        return True
    rec = await db.company_modules.find_one(
        {"company_id": company_id, "module_id": module_id, "status": {"$in": ["active", "trial"]}},
        {"_id": 0},
    )
    if not rec:
        return False
    if rec.get("status") == "trial" and rec.get("trial_until"):
        if rec["trial_until"] < now_iso():
            return False
    return True


def requires_module(module_id: str):
    """FastAPI dependency that rejects with 402 Payment Required if the company doesn't have the module."""
    if module_id not in MODULES:
        raise ValueError(f"Unknown module: {module_id}")

    async def _guard(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] == "super_admin":
            return user  # super admin bypasses module checks (audited)
        cid = user.get("company_id")
        if not cid:
            raise HTTPException(403, "No tenant scope")
        db = get_db()
        if not await _company_has_module(db, cid, module_id):
            mod = get_module(module_id)
            raise HTTPException(
                status_code=402,
                detail={
                    "error": "module_not_entitled",
                    "module_id": module_id,
                    "module_name": mod["name"] if mod else module_id,
                    "message": f"Your company does not have the '{mod['name'] if mod else module_id}' module enabled. Please contact your administrator.",
                },
            )
        return user

    return _guard


# ---------------------------------------------------------------------------
# Currency / Price helpers (multi-currency from day one)
# ---------------------------------------------------------------------------
def price(amount: float, currency: str = "INR") -> dict:
    return {"amount": float(amount), "currency": currency}


def is_price(v) -> bool:
    return isinstance(v, dict) and "amount" in v and "currency" in v
