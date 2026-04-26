"""Public (no-auth) endpoints — primarily for the marketing/landing page.

Currently:
  GET  /api/public/mobile-app           — version + download URL metadata
  GET  /api/public/mobile-app/android   — streams the latest APK if present
  GET  /api/public/mobile-app/ios       — redirects to TestFlight / App Store
"""
from __future__ import annotations

import os
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, RedirectResponse

router = APIRouter(prefix="/api/public", tags=["public"])

# Where APK gets dropped at deploy/release time.
APK_PATHS = [
    "/app/static/mobile/arcstone-hrms.apk",
    "/opt/arcstone/static/mobile/arcstone-hrms.apk",
]
DEFAULT_VERSION = os.environ.get("MOBILE_APP_VERSION", "0.2.0-beta")

# These can be overridden in the .env once Apple/Google approvals come through.
PLAY_STORE_URL  = os.environ.get("MOBILE_PLAY_STORE_URL",  "")
APP_STORE_URL   = os.environ.get("MOBILE_APP_STORE_URL",   "")
TESTFLIGHT_URL  = os.environ.get("MOBILE_TESTFLIGHT_URL",  "")
SUPPORT_EMAIL   = os.environ.get("MOBILE_SUPPORT_EMAIL",   "support@arcstone.io")


def _apk_path():
    for p in APK_PATHS:
        if Path(p).exists():
            return p
    return None


@router.get("/mobile-app")
async def mobile_app_meta():
    """Returns publicly visible metadata used by the landing page."""
    apk = _apk_path()
    apk_size_mb = round(Path(apk).stat().st_size / (1024 * 1024), 1) if apk else None
    return {
        "version": DEFAULT_VERSION,
        "android": {
            "play_store_url": PLAY_STORE_URL,                # may be empty until approved
            "direct_apk_url": "/api/public/mobile-app/android",
            "apk_available": apk is not None,
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
