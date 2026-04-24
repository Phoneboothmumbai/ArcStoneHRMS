"""Phase 2C — Statutory compliance: Investment declarations, bank advice, Form 24Q/3A/6A CSV exports.

Endpoints (all gated behind the `payroll` module):
- GET  /api/declarations/me                 my current FY declaration (auto-creates draft)
- POST /api/declarations/me                 upsert items / rent / regime
- POST /api/declarations/me/submit          mark as submitted
- GET  /api/declarations                    HR: list all company declarations for a FY
- POST /api/declarations/{id}/review        HR: approve/reject item-by-item

Exports (HR only):
- GET  /api/payroll-runs/{rid}/exports/bank-advice        NEFT CSV (employee, IFSC, A/C, amount)
- GET  /api/payroll-runs/{rid}/exports/form-24q           Quarterly TDS salary schedule
- GET  /api/payroll-runs/{rid}/exports/pf-ecr             PF ECR 2.0 (Form 3A equivalent) monthly
- GET  /api/payroll-runs/{rid}/exports/esic-monthly       ESIC monthly contribution CSV
- GET  /api/companies/{cid}/exports/form-16/{emp_id}      FY-end Form 16 data payload (JSON; PDF in 2D)
"""
from __future__ import annotations

import csv
import io
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi import Depends as _Depends
from fastapi.responses import StreamingResponse

from auth import get_current_user, require_roles
from db import get_db
from models import now_iso, uid
from models_statutory import (
    DeclarationItem, InvestmentDeclaration, InvestmentDeclarationCreate,
)
from tenant import requires_module

_gate = [_Depends(requires_module("payroll"))]

decl_router = APIRouter(prefix="/api/declarations", tags=["declarations"], dependencies=_gate)
exp_router = APIRouter(prefix="/api/payroll-runs", tags=["payroll-exports"], dependencies=_gate)

ADMIN = ("super_admin", "company_admin")

# India 80C/80CCD_1B/80D caps for quick sanity
CAPS = {"80C": 150000.0, "80CCD_1B": 50000.0, "80D": 25000.0, "home_loan": 200000.0, "80TTA": 10000.0}


# ---------------------------------------------------------------------------
# Investment declarations
# ---------------------------------------------------------------------------
def _sum_items(items: list[dict]) -> tuple[float, float]:
    decl = sum((it.get("declared_amount") or 0) for it in items)
    app = sum((it.get("approved_amount") if it.get("approved_amount") is not None else 0) for it in items)
    return round(decl, 2), round(app, 2)


@decl_router.get("/me")
async def my_declaration(financial_year: Optional[str] = None, user=Depends(get_current_user)):
    db = get_db()
    if not user.get("employee_id"):
        raise HTTPException(400, "No employee record linked to your user")
    # Determine FY from today (April-March) if not provided
    if not financial_year:
        t = datetime.utcnow()
        y = t.year if t.month >= 4 else t.year - 1
        financial_year = f"{y}-{y+1}"
    doc = await db.investment_declarations.find_one(
        {"company_id": user["company_id"], "employee_id": user["employee_id"], "financial_year": financial_year},
        {"_id": 0},
    )
    if doc:
        return doc
    # Create empty draft
    draft = InvestmentDeclaration(
        company_id=user["company_id"], employee_id=user["employee_id"],
        employee_name=user["name"], financial_year=financial_year,
    ).model_dump()
    await db.investment_declarations.insert_one(draft)
    draft.pop("_id", None)
    return draft


@decl_router.post("/me")
async def upsert_my_declaration(body: InvestmentDeclarationCreate, user=Depends(get_current_user)):
    db = get_db()
    if not user.get("employee_id"):
        raise HTTPException(400, "No employee record linked to your user")
    existing = await db.investment_declarations.find_one(
        {"company_id": user["company_id"], "employee_id": user["employee_id"], "financial_year": body.financial_year},
        {"_id": 0},
    )
    if existing and existing.get("status") == "approved":
        raise HTTPException(400, "Declaration is locked (approved); ask HR to reopen to edit")

    items = [it.model_dump() for it in body.items]
    decl, approved = _sum_items(items)
    if existing:
        await db.investment_declarations.update_one(
            {"id": existing["id"]},
            {"$set": {
                "tax_regime": body.tax_regime, "items": items, "rent_monthly": body.rent_monthly,
                "metro_city": body.metro_city, "notes": body.notes,
                "total_declared": decl, "total_approved": approved,
                "status": "draft", "updated_at": now_iso(),
            }},
        )
        return await db.investment_declarations.find_one({"id": existing["id"]}, {"_id": 0})
    doc = InvestmentDeclaration(
        company_id=user["company_id"], employee_id=user["employee_id"],
        employee_name=user["name"], financial_year=body.financial_year,
        tax_regime=body.tax_regime, items=items, rent_monthly=body.rent_monthly,
        metro_city=body.metro_city, notes=body.notes,
        total_declared=decl, total_approved=approved,
    ).model_dump()
    await db.investment_declarations.insert_one(doc)
    doc.pop("_id", None)
    return doc


@decl_router.post("/me/submit")
async def submit_my_declaration(financial_year: str = Query(...), user=Depends(get_current_user)):
    db = get_db()
    r = await db.investment_declarations.update_one(
        {"company_id": user["company_id"], "employee_id": user["employee_id"],
         "financial_year": financial_year, "status": {"$ne": "approved"}},
        {"$set": {"status": "submitted", "submitted_at": now_iso(), "updated_at": now_iso()}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "No editable declaration for that FY")
    return {"ok": True}


@decl_router.get("")
async def list_declarations(
    financial_year: str = Query(...),
    status: Optional[str] = None,
    user=Depends(require_roles(*ADMIN)),
):
    db = get_db()
    flt = {"company_id": user.get("company_id"), "financial_year": financial_year}
    if status:
        flt["status"] = status
    rows = await db.investment_declarations.find(flt, {"_id": 0}).sort("employee_name", 1).to_list(5000)
    return rows


@decl_router.post("/{did}/review")
async def review_declaration(
    did: str,
    body: dict,  # {decision: "approve"|"reject"|"update_items", items?: [...], notes?: str}
    user=Depends(require_roles(*ADMIN)),
):
    db = get_db()
    d = await db.investment_declarations.find_one({"id": did, "company_id": user.get("company_id")}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Not found")

    decision = body.get("decision")
    patch: dict = {"reviewed_by": user["id"], "reviewed_at": now_iso(), "updated_at": now_iso()}
    if decision == "approve":
        patch["status"] = "approved"
    elif decision == "reject":
        patch["status"] = "rejected"
    if body.get("items") is not None:
        items = body["items"]
        patch["items"] = items
        patch["total_declared"], patch["total_approved"] = _sum_items(items)
    if body.get("notes") is not None:
        patch["notes"] = body["notes"]
    await db.investment_declarations.update_one({"id": did}, {"$set": patch})
    return await db.investment_declarations.find_one({"id": did}, {"_id": 0})


# ---------------------------------------------------------------------------
# Exports — bank advice + statutory CSV
# ---------------------------------------------------------------------------
def _stream_csv(rows: list[list], filename: str) -> StreamingResponse:
    buf = io.StringIO()
    w = csv.writer(buf)
    for r in rows:
        w.writerow(r)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@exp_router.get("/{rid}/exports/bank-advice")
async def bank_advice_csv(rid: str, user=Depends(require_roles(*ADMIN))):
    """NEFT/RTGS bank advice — one row per employee with net salary."""
    db = get_db()
    run = await db.payroll_runs.find_one({"id": rid, "company_id": user.get("company_id")}, {"_id": 0})
    if not run:
        raise HTTPException(404, "Run not found")
    slips = await db.payslips.find({"company_id": user.get("company_id"), "run_id": rid}, {"_id": 0}).to_list(5000)

    rows = [["Sl No", "Employee Code", "Employee Name", "Bank Name", "IFSC", "Account Number", "Account Type", "Amount (INR)", "Narration"]]
    for i, s in enumerate(slips, 1):
        prof = await db.employee_profiles.find_one(
            {"employee_id": s["employee_id"]}, {"_id": 0, "bank": 1},
        )
        bank = (prof or {}).get("bank") or {}
        rows.append([
            i, s["employee_code"], s["employee_name"],
            bank.get("bank_name", ""), bank.get("ifsc", ""),
            bank.get("account_number", ""), bank.get("account_type", "savings"),
            f"{s['actual_net']:.2f}",
            f"Salary {run['period_label']}",
        ])
    return _stream_csv(rows, f"bank_advice_{run['period_month']}.csv")


@exp_router.get("/{rid}/exports/form-24q")
async def form_24q_csv(rid: str, user=Depends(require_roles(*ADMIN))):
    """Form 24Q (quarterly TDS salary schedule) — monthly rows per employee."""
    db = get_db()
    run = await db.payroll_runs.find_one({"id": rid, "company_id": user.get("company_id")}, {"_id": 0})
    if not run:
        raise HTTPException(404, "Run not found")
    slips = await db.payslips.find({"company_id": user.get("company_id"), "run_id": rid}, {"_id": 0}).to_list(5000)

    rows = [["Sl No", "Employee Code", "Employee Name", "PAN", "Gross Salary", "Total Deductions", "Taxable Income", "TDS Deducted", "Net Paid"]]
    for i, s in enumerate(slips, 1):
        prof = await db.employee_profiles.find_one(
            {"employee_id": s["employee_id"]}, {"_id": 0, "kyc": 1},
        )
        pan = ((prof or {}).get("kyc") or {}).get("pan_number", "")
        taxable = s["actual_gross"] - s["total_deductions"] + s["tds_monthly"]
        rows.append([
            i, s["employee_code"], s["employee_name"], pan,
            f"{s['actual_gross']:.2f}", f"{s['total_deductions']:.2f}",
            f"{taxable:.2f}", f"{s['tds_monthly']:.2f}", f"{s['actual_net']:.2f}",
        ])
    return _stream_csv(rows, f"form_24q_{run['period_month']}.csv")


@exp_router.get("/{rid}/exports/pf-ecr")
async def pf_ecr_csv(rid: str, user=Depends(require_roles(*ADMIN))):
    """PF ECR 2.0 (Electronic Challan-Cum-Return) monthly contribution format."""
    db = get_db()
    run = await db.payroll_runs.find_one({"id": rid, "company_id": user.get("company_id")}, {"_id": 0})
    if not run:
        raise HTTPException(404, "Run not found")
    slips = await db.payslips.find({"company_id": user.get("company_id"), "run_id": rid}, {"_id": 0}).to_list(5000)

    rows = [["UAN", "Member Name", "Gross Wages", "EPF Wages", "EPS Wages", "EDLI Wages", "EPF Contribution (Employee)", "EPS Contribution (Employer)", "EPF EPS Diff (Employer)", "NCP Days", "Refund Of Advances"]]
    for s in slips:
        prof = await db.employee_profiles.find_one(
            {"employee_id": s["employee_id"]}, {"_id": 0, "statutory_india": 1},
        )
        uan = ((prof or {}).get("statutory_india") or {}).get("uan", "")
        # PF wages capped at ₹15k; EPS @ 8.33% within the cap, EPF = total - EPS
        basic_line = next((l for l in s.get("lines", []) if l["component_code"] == "BASIC"), None)
        basic = (basic_line or {}).get("amount", 0)
        pf_wage = min(basic, 15000)
        emp_pf = next((l["amount"] for l in s.get("lines", []) if l["component_code"] == "PF"), 0)
        emp_eps = round(pf_wage * 0.0833, 2)
        emp_epf_diff = round(emp_pf - emp_eps, 2)
        ncp_days = int(s["lop_days"])
        rows.append([uan, s["employee_name"], f"{s['actual_gross']:.2f}",
                     f"{pf_wage:.2f}", f"{pf_wage:.2f}", f"{pf_wage:.2f}",
                     f"{emp_pf:.2f}", f"{emp_eps:.2f}", f"{emp_epf_diff:.2f}",
                     ncp_days, 0])
    return _stream_csv(rows, f"pf_ecr_{run['period_month']}.csv")


@exp_router.get("/{rid}/exports/esic-monthly")
async def esic_monthly_csv(rid: str, user=Depends(require_roles(*ADMIN))):
    """ESIC monthly contribution (for portal upload)."""
    db = get_db()
    run = await db.payroll_runs.find_one({"id": rid, "company_id": user.get("company_id")}, {"_id": 0})
    if not run:
        raise HTTPException(404, "Run not found")
    slips = await db.payslips.find({"company_id": user.get("company_id"), "run_id": rid}, {"_id": 0}).to_list(5000)

    rows = [["IP Number", "IP Name", "No. of Days", "Total Monthly Wages", "Reason Code", "Last Working Day"]]
    for s in slips:
        prof = await db.employee_profiles.find_one(
            {"employee_id": s["employee_id"]}, {"_id": 0, "statutory_india": 1},
        )
        ip = ((prof or {}).get("statutory_india") or {}).get("esic_ip_number", "")
        esic_wage = s["actual_gross"]
        # ESIC applies only if gross ≤ ₹21k
        if esic_wage > 21000:
            continue
        rows.append([ip, s["employee_name"], int(s["paid_days"]), f"{esic_wage:.2f}", "", ""])
    return _stream_csv(rows, f"esic_monthly_{run['period_month']}.csv")
