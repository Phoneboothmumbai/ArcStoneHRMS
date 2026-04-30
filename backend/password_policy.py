"""Centralised password policy — import and call `validate_password(pw)` wherever
a user sets or changes a password. Raises HTTPException(422) with a clear message
on the first rule violation so the UI can surface it.

Rules (BFSI / ISO 27001 baseline):
- Min 10 chars (mobile UX tradeoff — longer nudges to password managers)
- ≥1 uppercase letter
- ≥1 lowercase letter
- ≥1 digit
- ≥1 symbol
- Not a trivial sequence (123456, password, qwerty, admin, etc.)

Call sites: /api/auth/register, /api/auth/change-password, admin seed,
reseller bootstrap, employee self-service profile password change.
"""
from __future__ import annotations
import re
from fastapi import HTTPException

_MIN_LENGTH = 10
_BLOCK_LIST = {
    "password", "password1", "password123", "passw0rd", "123456",
    "12345678", "123456789", "qwerty", "qwerty123", "admin", "admin123",
    "letmein", "welcome", "welcome1", "arcstone", "arcstone123",
}


def validate_password(pw: str) -> None:
    """Raise HTTPException(422) on weak password — returns None if OK."""
    if not pw or not isinstance(pw, str):
        raise HTTPException(422, "Password is required.")
    if len(pw) < _MIN_LENGTH:
        raise HTTPException(422, f"Password must be at least {_MIN_LENGTH} characters.")
    if not re.search(r"[A-Z]", pw):
        raise HTTPException(422, "Password must contain at least one uppercase letter.")
    if not re.search(r"[a-z]", pw):
        raise HTTPException(422, "Password must contain at least one lowercase letter.")
    if not re.search(r"\d", pw):
        raise HTTPException(422, "Password must contain at least one digit.")
    if not re.search(r"[^A-Za-z0-9]", pw):
        raise HTTPException(422, "Password must contain at least one symbol (e.g. !@#$%).")
    if pw.lower() in _BLOCK_LIST:
        raise HTTPException(422, "This password is too common. Please choose a stronger one.")
