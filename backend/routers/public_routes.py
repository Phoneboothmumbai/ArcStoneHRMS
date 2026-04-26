"""Public (no-auth) endpoints — primarily for the marketing/landing page.

Currently:
  GET  /api/public/mobile-app           — version + download URL metadata
  GET  /api/public/mobile-app/android   — streams the latest APK if present
  GET  /api/public/mobile-app/ios       — redirects to TestFlight / App Store
"""
from __future__ import annotations

import os
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, RedirectResponse

router = APIRouter(prefix="/api/public", tags=["public"])

# Where APK gets dropped at deploy/release time (fallback only).
APK_PATHS = [
    "/app/static/mobile/arcstone-hrms.apk",
    "/opt/arcstone/static/mobile/arcstone-hrms.apk",
]
DEFAULT_VERSION = os.environ.get("MOBILE_APP_VERSION", "0.2.0-beta")

# Remote APK (preferred — points at EAS-hosted artifact). When set, we
# redirect /android to this URL instead of streaming a local file. This is
# how production builds are served once `eas build` finishes.
APK_REMOTE_URL  = os.environ.get("MOBILE_APK_REMOTE_URL",  "").strip()

# These can be overridden in the .env once Apple/Google approvals come through.
PLAY_STORE_URL  = os.environ.get("MOBILE_PLAY_STORE_URL",  "")
APP_STORE_URL   = os.environ.get("MOBILE_APP_STORE_URL",   "")
TESTFLIGHT_URL  = os.environ.get("MOBILE_TESTFLIGHT_URL",  "")
SUPPORT_EMAIL   = os.environ.get("MOBILE_SUPPORT_EMAIL",   "support@arcstone.io")

# Cache the remote APK size so we don't HEAD on every landing-page hit.
_remote_size_cache: dict = {"url": None, "size_mb": None}


def _apk_path():
    for p in APK_PATHS:
        if Path(p).exists():
            return p
    return None


async def _remote_apk_size_mb() -> float | None:
    """Best-effort HEAD against the EAS artifact to display size on the landing page.
    Falls back silently to None — the UI just hides the size in that case.
    """
    if not APK_REMOTE_URL:
        return None
    if _remote_size_cache["url"] == APK_REMOTE_URL and _remote_size_cache["size_mb"] is not None:
        return _remote_size_cache["size_mb"]
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=8.0) as client:
            # Try HEAD first (cheap), then fall back to GET with Range — EAS's
            # signed S3 URLs allow only GET, so HEAD ends up 403 on the final hop.
            r = await client.head(APK_REMOTE_URL)
            cl = r.headers.get("content-length")
            if not cl or r.status_code >= 400:
                r = await client.get(APK_REMOTE_URL, headers={"Range": "bytes=0-0"})
                cl = r.headers.get("content-range", "").split("/")[-1] or r.headers.get("content-length")
            if cl and cl.isdigit():
                size_mb = round(int(cl) / (1024 * 1024), 1)
                _remote_size_cache.update(url=APK_REMOTE_URL, size_mb=size_mb)
                return size_mb
    except Exception:
        pass
    return None


@router.get("/mobile-app")
async def mobile_app_meta():
    """Returns publicly visible metadata used by the landing page."""
    apk = _apk_path()
    if APK_REMOTE_URL:
        apk_available = True
        apk_size_mb = await _remote_apk_size_mb()
    elif apk:
        apk_available = True
        apk_size_mb = round(Path(apk).stat().st_size / (1024 * 1024), 1)
    else:
        apk_available = False
        apk_size_mb = None
    return {
        "version": DEFAULT_VERSION,
        "android": {
            "play_store_url": PLAY_STORE_URL,                # may be empty until approved
            "direct_apk_url": "/api/public/mobile-app/android",
            "apk_available": apk_available,
            "apk_size_mb": apk_size_mb,
            "min_android": "8.0 (Oreo)",
        },
        "ios": {
            "app_store_url": APP_STORE_URL,                  # may be empty
            "testflight_url": TESTFLIGHT_URL,                # primary while in beta
            "min_ios": "14.0",
        },
        "support_email": SUPPORT_EMAIL,
        "release_notes": [
            "Daily attendance with selfie + geofence check-in",
            "Apply for leave / view payslips on the go",
            "Push notifications for approvals + lifecycle alerts",
            "Offline-first inbox (last 7 days cached)",
        ],
    }


@router.get("/mobile-app/android")
async def download_android_apk():
    # Prefer the remote (EAS-hosted) artifact when configured.
    if APK_REMOTE_URL:
        return RedirectResponse(url=APK_REMOTE_URL, status_code=302)
    apk = _apk_path()
    if not apk:
        raise HTTPException(
            404,
            "Android build is being prepared. Please email "
            f"{SUPPORT_EMAIL} or use the TestFlight link to get early access.",
        )
    return FileResponse(
        apk, media_type="application/vnd.android.package-archive",
        filename=f"arcstone-hrms-{DEFAULT_VERSION}.apk",
    )


@router.get("/mobile-app/ios")
async def redirect_ios():
    target = APP_STORE_URL or TESTFLIGHT_URL
    if target:
        return RedirectResponse(url=target, status_code=302)
    raise HTTPException(
        404,
        "iOS build is in private beta. Please email "
        f"{SUPPORT_EMAIL} with your Apple ID to get a TestFlight invite.",
    )
