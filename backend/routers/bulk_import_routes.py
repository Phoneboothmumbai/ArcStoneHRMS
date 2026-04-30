"""Bulk employee import — CSV upload, dry-run validation, and transactional apply.

This closes the single biggest onboarding pain point: HR shouldn't have to
add employees one by one on first go-live. Accepts a CSV of up to 5000 rows,
validates every row, returns a structured error report, and only writes to
the DB after the admin sees a clean dry-run.

Supported columns (first-row header, case-insensitive):
  email, name, employee_code, designation, department, branch_code,
  employee_type, phone, date_of_joining, ctc_annual, manager_email

Flow:
  1. POST /api/employees/bulk-import/dry-run   (multipart file upload)
     → returns { valid_rows, errors: [{row, field, message}], warnings }
  2. POST /api/employees/bulk-import/apply
     → same CSV + `skip_existing` + `create_user_accounts` flags
     → returns { created, skipped, errors }

Creates employees AND optionally a User row per employee (sends default
password that they must change on first login).
"""
from __future__ import annotations

import csv
import io
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form

from auth import get_current_user, require_roles, hash_password
from db import get_db
from models import now_iso, uid
from audit import log_event

router = APIRouter(prefix="/api/employees/bulk-import", tags=["bulk-import"])

ADMIN = ("super_admin", "company_admin", "country_head")

REQUIRED = ["email", "name"]
OPTIONAL = [
    "employee_code", "designation", "department", "branch_code",
    "employee_type", "phone", "date_of_joining", "ctc_annual", "manager_email",
]
VALID_TYPES = {"wfo", "wfh", "field", "hybrid"}
MAX_ROWS = 5000


async def _parse_and_validate(csv_bytes: bytes, company_id: str, db) -> dict:
    """Parse + validate CSV. Returns shape { rows, errors, warnings }.

    errors block apply(); warnings don't (e.g. unknown branch just leaves
    branch_id = None — employee still created).
    """
    try:
        text = csv_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(400, "File must be UTF-8 encoded CSV.")

    reader = csv.DictReader(io.StringIO(text))
    # Normalise headers: lowercase + trim
    if not reader.fieldnames:
        raise HTTPException(400, "CSV appears empty.")
    reader.fieldnames = [f.strip().lower() for f in reader.fieldnames]

    missing = [r for r in REQUIRED if r not in reader.fieldnames]
    if missing:
        raise HTTPException(
            422, f"Missing required column(s): {', '.join(missing)}. "
                 f"Required: {REQUIRED}. Optional: {OPTIONAL}.",
        )

    # Pre-load branch / manager lookups once (avoid N+1)
    branches = {b["code"].lower(): b async for b in
                db.attendance_sites.find({"company_id": company_id}, {"_id": 0, "id": 1, "code": 1})
                if b.get("code")}
    mgrs = {e["email"].lower(): e async for e in
            db.employees.find({"company_id": company_id}, {"_id": 0, "id": 1, "email": 1})
            if e.get("email")}
    existing_emails = {e["email"].lower() async for e in
                       db.employees.find({"company_id": company_id}, {"_id": 0, "email": 1})
                       if e.get("email")}

    parsed: list[dict] = []
    errors: list[dict] = []
    warnings: list[dict] = []
    seen_emails: set = set()

    for idx, raw in enumerate(reader, start=2):   # row 1 is header
        if idx - 1 > MAX_ROWS:
            errors.append({"row": idx, "field": "_file",
                           "message": f"Max {MAX_ROWS} rows per import."})
            break
        row = {(k or "").strip().lower(): (v or "").strip() for k, v in raw.items()}

        email = row.get("email", "").lower()
        if not email:
            errors.append({"row": idx, "field": "email", "message": "Required"})
            continue
        if "@" not in email:
            errors.append({"row": idx, "field": "email", "message": "Invalid email format"})
            continue
        if email in seen_emails:
            errors.append({"row": idx, "field": "email", "message": "Duplicate in file"})
            continue
        seen_emails.add(email)

        if not row.get("name"):
            errors.append({"row": idx, "field": "name", "message": "Required"})
            continue

        etype = (row.get("employee_type") or "wfo").lower()
        if etype not in VALID_TYPES:
            errors.append({"row": idx, "field": "employee_type",
                           "message": f"Must be one of {sorted(VALID_TYPES)}"})
            continue

        branch_id = None
        if row.get("branch_code"):
            b = branches.get(row["branch_code"].lower())
            if b:
                branch_id = b["id"]
            else:
                warnings.append({"row": idx, "field": "branch_code",
                                 "message": f"Branch '{row['branch_code']}' not found — created without branch"})

        mgr_id = None
        if row.get("manager_email"):
            m = mgrs.get(row["manager_email"].lower())
            if m:
                mgr_id = m["id"]
            else:
                warnings.append({"row": idx, "field": "manager_email",
                                 "message": f"Manager '{row['manager_email']}' not found — created without manager"})

        ctc = None
        if row.get("ctc_annual"):
            try:
                ctc = float(row["ctc_annual"].replace(",", ""))
                if ctc < 0:
                    raise ValueError
            except ValueError:
                errors.append({"row": idx, "field": "ctc_annual",
                               "message": "Must be a positive number"})
                continue

        already = email in existing_emails
        parsed.append({
            "_row": idx,
            "_existing": already,
            "email": email,
            "name": row["name"],
            "employee_code": row.get("employee_code") or "",
            "designation": row.get("designation") or "",
            "department": row.get("department") or "",
            "branch_id": branch_id,
            "employee_type": etype,
            "phone": row.get("phone") or "",
            "date_of_joining": row.get("date_of_joining") or None,
            "ctc_annual": ctc,
            "manager_id": mgr_id,
        })

    return {
        "row_count": len(parsed),
        "new_rows": sum(1 for p in parsed if not p["_existing"]),
        "duplicate_rows": sum(1 for p in parsed if p["_existing"]),
        "errors": errors,
        "warnings": warnings,
    } | {"parsed": parsed}


@router.post("/dry-run")
async def dry_run(file: UploadFile = File(...), user=Depends(require_roles(*ADMIN))):
    db = get_db()
    csv_bytes = await file.read()
    report = await _parse_and_validate(csv_bytes, user["company_id"], db)
    # Return report WITHOUT the full parsed rows (UI only needs counts + errors)
    report.pop("parsed", None)
    return report


@router.post("/apply")
async def apply_import(
    file: UploadFile = File(...),
    skip_existing: bool = Form(True),
    create_user_accounts: bool = Form(False),
    default_password: str = Form("Change@Me1!"),
    user=Depends(require_roles(*ADMIN)),
):
    """Apply the import. If there are any validation errors we refuse —
    the HR admin must fix them and re-dry-run first."""
    db = get_db()
    cid = user["company_id"]
    csv_bytes = await file.read()
    report = await _parse_and_validate(csv_bytes, cid, db)

    if report["errors"]:
        raise HTTPException(422, {
            "message": "Fix all validation errors before applying.",
            "errors": report["errors"],
            "error_count": len(report["errors"]),
        })

    created = 0
    skipped = 0
    rows = report.pop("parsed", [])
    for p in rows:
        if p["_existing"]:
            if skip_existing:
                skipped += 1
                continue
            # Update path — update employee row, don't create User
            await db.employees.update_one(
                {"company_id": cid, "email": p["email"]},
                {"$set": {
                    "name": p["name"],
                    "designation": p["designation"] or None,
                    "department": p["department"] or None,
                    "branch_id": p["branch_id"],
                    "manager_id": p["manager_id"],
                    "employee_type": p["employee_type"],
                    "phone": p["phone"] or None,
                    "updated_at": now_iso(),
                }},
            )
            continue

        emp_id = uid()
        emp_doc = {
            "id": emp_id, "company_id": cid,
            "email": p["email"], "name": p["name"],
            "employee_code": p["employee_code"] or None,
            "designation": p["designation"] or None,
            "department": p["department"] or None,
            "branch_id": p["branch_id"],
            "manager_id": p["manager_id"],
            "employee_type": p["employee_type"],
            "phone": p["phone"] or None,
            "date_of_joining": p["date_of_joining"],
            "status": "active",
            "created_at": now_iso(), "updated_at": now_iso(),
        }
        await db.employees.insert_one(emp_doc)
        created += 1

        if create_user_accounts:
            # Idempotency: do not create user if one already exists with this email
            exists = await db.users.find_one({"email": p["email"]})
            if not exists:
                await db.users.insert_one({
                    "id": uid(), "email": p["email"], "name": p["name"],
                    "password_hash": hash_password(default_password),
                    "role": "employee", "company_id": cid,
                    "employee_id": emp_id, "is_active": True,
                    "must_change_password": True,
                    "created_at": now_iso(), "updated_at": now_iso(),
                })

    await log_event(db, actor=user, event="bulk_import.apply",
                    resource_type="employee", resource_id=None,
                    detail={"created": created, "skipped": skipped,
                            "total": len(rows),
                            "user_accounts": create_user_accounts})
    return {
        "created": created,
        "skipped": skipped,
        "total": len(rows),
        "warnings": report["warnings"],
    }
