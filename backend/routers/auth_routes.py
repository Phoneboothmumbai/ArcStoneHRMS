"""Auth routes: register, login, logout, me, refresh."""
from __future__ import annotations

import os
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from auth import (
    hash_password, verify_password, create_access_token, create_refresh_token,
    decode_token, set_auth_cookies, clear_auth_cookies, get_current_user,
)
from db import get_db
from models import LoginBody, RegisterBody, now_iso, uid
from password_policy import validate_password
from audit import log_event

router = APIRouter(prefix="/api/auth", tags=["auth"])

LOCKOUT_ATTEMPTS = 5
LOCKOUT_MINUTES = 15

# Pure IP-based rate limit — protects against a botnet hammering many
# different emails from the same IP (per-email lockout alone would miss this).
IP_WINDOW_SECONDS = 60
IP_MAX_ATTEMPTS = 20


async def _check_ip_rate_limit(db, ip: str) -> None:
    """Throttle ANY auth POST on the same IP to 20 / 60s."""
    since = (datetime.now(timezone.utc) - timedelta(seconds=IP_WINDOW_SECONDS)).isoformat()
    count = await db.auth_attempts_log.count_documents({
        "ip": ip, "ts": {"$gte": since},
    })
    if count >= IP_MAX_ATTEMPTS:
        raise HTTPException(429, "Too many auth requests from this network. Please wait a minute.")


async def _record_attempt(db, ip: str, email: str, ok: bool) -> None:
    await db.auth_attempts_log.insert_one({
        "ip": ip, "email": email, "ok": ok, "ts": datetime.now(timezone.utc).isoformat(),
    })


async def _check_lockout(db, identifier: str) -> None:
    rec = await db.login_attempts.find_one({"identifier": identifier})
    if not rec:
        return
    if rec.get("count", 0) >= LOCKOUT_ATTEMPTS:
        locked_until = rec.get("locked_until")
        if locked_until and datetime.fromisoformat(locked_until) > datetime.now(timezone.utc):
            raise HTTPException(status_code=429, detail="Too many failed attempts. Try again later.")


async def _register_failure(db, identifier: str) -> None:
    rec = await db.login_attempts.find_one({"identifier": identifier}) or {"identifier": identifier, "count": 0}
    rec["count"] = rec.get("count", 0) + 1
    if rec["count"] >= LOCKOUT_ATTEMPTS:
        rec["locked_until"] = (datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_MINUTES)).isoformat()
    await db.login_attempts.update_one({"identifier": identifier}, {"$set": rec}, upsert=True)


async def _clear_attempts(db, identifier: str) -> None:
    await db.login_attempts.delete_one({"identifier": identifier})


@router.post("/login")
async def login(body: LoginBody, request: Request, response: Response):
    db = get_db()
    email = body.email.lower()
    ip = request.client.host if request.client else "unknown"
    identifier = f"{ip}:{email}"
    await _check_ip_rate_limit(db, ip)
    await _check_lockout(db, identifier)

    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        await _register_failure(db, identifier)
        await _record_attempt(db, ip, email, ok=False)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.get("is_active", True):
        await log_event(db, actor=None, event="auth.login.denied",
                        resource_type="user", resource_id=user.get("id"),
                        detail={"email": email, "reason": "inactive", "ip": ip})
        raise HTTPException(status_code=403, detail="Account is disabled")

    await _clear_attempts(db, identifier)
    await _record_attempt(db, ip, email, ok=True)
    access = create_access_token(user["id"], user["email"], user["role"], user.get("company_id"), user.get("reseller_id"))
    refresh = create_refresh_token(user["id"])
    set_auth_cookies(response, access, refresh)
    await log_event(db, actor=user, event="auth.login", resource_type="user",
                    resource_id=user["id"], detail={"ip": ip})
    user.pop("password_hash", None)
    user.pop("_id", None)
    return {"user": user, "access_token": access}


@router.post("/register")
async def register(body: RegisterBody, request: Request, response: Response):
    db = get_db()
    email = body.email.lower()
    ip = request.client.host if request.client else "unknown"
    await _check_ip_rate_limit(db, ip)
    # Enforce policy BEFORE we do anything persistent.
    validate_password(body.password)
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = {
        "id": uid(),
        "email": email,
        "password_hash": hash_password(body.password),
        "name": body.name,
        "role": body.role,
        "company_id": body.company_id,
        "reseller_id": body.reseller_id,
        "employee_id": None,
        "is_active": True,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.users.insert_one(doc)
    access = create_access_token(doc["id"], doc["email"], doc["role"], doc.get("company_id"), doc.get("reseller_id"))
    refresh = create_refresh_token(doc["id"])
    set_auth_cookies(response, access, refresh)
    await log_event(db, actor=doc, event="auth.register", resource_type="user",
                    resource_id=doc["id"], detail={"role": doc["role"], "ip": ip})
    doc.pop("password_hash", None)
    doc.pop("_id", None)
    return {"user": doc, "access_token": access}


@router.post("/logout")
async def logout(response: Response, user=Depends(get_current_user)):
    clear_auth_cookies(response)
    return {"ok": True}


@router.get("/me")
async def me(user=Depends(get_current_user)):
    return user


@router.post("/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = decode_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid token type")
    db = get_db()
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    access = create_access_token(user["id"], user["email"], user["role"], user.get("company_id"), user.get("reseller_id"))
    refresh_tok = create_refresh_token(user["id"])
    set_auth_cookies(response, access, refresh_tok)
    return {"user": user, "access_token": access}
