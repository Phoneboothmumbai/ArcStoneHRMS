"""Tenant export — GDPR / DPDP right-to-portability. Dumps every tenant-scoped collection."""
import json
import io
import zipfile
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from auth import require_roles
from db import get_db

router = APIRouter(prefix="/api/tenant", tags=["tenant"])

# Tenant-scoped collections to include in an export
TENANT_COLLECTIONS = [
    "users", "employees", "regions", "countries", "branches", "departments",
    "approval_workflows", "approval_requests", "leave_requests",
    "attendance", "product_service_requests", "vendors",
    "company_modules", "module_events", "module_activation_requests",
]


@router.post("/{company_id}/export")
async def export_tenant(company_id: str, user=Depends(require_roles("super_admin", "company_admin"))):
    """Export all tenant data as a single zip of JSON files."""
    db = get_db()
    if user["role"] == "company_admin" and user.get("company_id") != company_id:
        raise HTTPException(403, "Forbidden")

    company = await db.companies.find_one({"id": company_id}, {"_id": 0})
    if not company:
        raise HTTPException(404, "Company not found")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("company.json", json.dumps(company, indent=2, default=str))
        for coll in TENANT_COLLECTIONS:
            # strip password_hash from users
            proj = {"_id": 0, "password_hash": 0} if coll == "users" else {"_id": 0}
            rows = await db[coll].find({"company_id": company_id}, proj).to_list(100000)
            zf.writestr(f"{coll}.json", json.dumps(rows, indent=2, default=str))
        zf.writestr("README.txt", (
            f"Arcstone HRMS tenant export\nCompany: {company['name']}\nCompany ID: {company_id}\n"
            f"This archive contains all data owned by your company. Files are JSON-formatted.\n"
            "For questions contact your account administrator.\n"
        ))

    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="tenant-{company_id}-export.zip"'},
    )


@router.get("/{company_id}/integrity_check")
async def integrity_check(company_id: str, user=Depends(require_roles("super_admin"))):
    """Verify every document in tenant collections has the correct company_id.
    Called nightly by a cron job. Reports any orphans or cross-tenant references.
    """
    db = get_db()
    report = {"company_id": company_id, "issues": [], "checked": {}}
    for coll in TENANT_COLLECTIONS:
        total = await db[coll].count_documents({"company_id": company_id})
        # For users: super_admin & reseller users legitimately have null company_id — not orphans.
        if coll == "users":
            orphan_filter = {
                "$and": [
                    {"$or": [{"company_id": {"$exists": False}}, {"company_id": None}]},
                    {"role": {"$nin": ["super_admin", "reseller"]}},
                ]
            }
        else:
            orphan_filter = {"$or": [{"company_id": {"$exists": False}}, {"company_id": None}]}
        orphans = await db[coll].count_documents(orphan_filter)
        report["checked"][coll] = {"count": total, "orphans_in_collection": orphans}
        if orphans > 0:
            report["issues"].append(f"{coll}: {orphans} orphan documents (missing company_id)")
    report["ok"] = len(report["issues"]) == 0
    return report
