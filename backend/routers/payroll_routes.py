"""Phase 2A routes — salary components, structures, employee CTC."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from fastapi import Depends as _Depends

from auth import get_current_user, require_roles
from db import get_db
from models import now_iso, uid
from models_payroll import (
    EmployeeSalary, EmployeeSalaryAssign, EmployeeSalaryLine,
    SalaryComponent, SalaryComponentCreate,
    SalaryStructure, SalaryStructureCreate, StructureLine,
)
from tenant import requires_module

# All payroll endpoints are gated behind the "payroll" module (402 Payment Required if not entitled).
_payroll_gate = [_Depends(requires_module("payroll"))]

components_router = APIRouter(prefix="/api/salary-components", tags=["salary-components"], dependencies=_payroll_gate)
structures_router = APIRouter(prefix="/api/salary-structures", tags=["salary-structures"], dependencies=_payroll_gate)
comp_router = APIRouter(prefix="/api/compensation", tags=["compensation"], dependencies=_payroll_gate)

ADMIN = ("super_admin", "company_admin")
# Payroll data is sensitive — restrict view
COMP_VIEWERS = ("super_admin", "company_admin", "country_head", "region_head")


# ---------- Salary Components ----------
@components_router.get("")
async def list_components(user=Depends(require_roles(*COMP_VIEWERS))):
    db = get_db()
    cid = user.get("company_id")
    rows = await db.salary_components.find(
        {"company_id": cid, "is_active": True}, {"_id": 0}
    ).sort("sort_order", 1).to_list(200)
    return rows


@components_router.post("")
async def create_component(body: SalaryComponentCreate, user=Depends(require_roles(*ADMIN))):
    db = get_db()
    cid = user.get("company_id")
    if not cid: raise HTTPException(400, "Company scope required")
    if await db.salary_components.find_one({"company_id": cid, "code": body.code.upper()}):
        raise HTTPException(400, "Component with this code already exists")
    doc = SalaryComponent(company_id=cid, **{**body.model_dump(), "code": body.code.upper()}).model_dump()
    await db.salary_components.insert_one(doc)
    doc.pop("_id", None)
    return doc


@components_router.put("/{cid_}")
async def update_component(cid_: str, body: SalaryComponentCreate, user=Depends(require_roles(*ADMIN))):
    db = get_db()
    existing = await db.salary_components.find_one(
        {"id": cid_, "company_id": user.get("company_id")}, {"_id": 0}
    )
    if not existing: raise HTTPException(404, "Not found")
    if existing.get("is_locked"):
        raise HTTPException(400, "Locked statutory component cannot be edited")
    upd = {**body.model_dump(), "code": body.code.upper(), "updated_at": now_iso()}
    await db.salary_components.update_one({"id": cid_}, {"$set": upd})
    return await db.salary_components.find_one({"id": cid_}, {"_id": 0})


@components_router.delete("/{cid_}")
async def delete_component(cid_: str, user=Depends(require_roles(*ADMIN))):
    db = get_db()
    existing = await db.salary_components.find_one({"id": cid_, "company_id": user.get("company_id")}, {"_id": 0})
    if not existing: raise HTTPException(404, "Not found")
    if existing.get("is_locked"):
        raise HTTPException(400, "Locked statutory component cannot be deleted")
    await db.salary_components.update_one({"id": cid_}, {"$set": {"is_active": False}})
    return {"ok": True}


# ---------- Structures ----------
@structures_router.get("")
async def list_structures(user=Depends(require_roles(*COMP_VIEWERS))):
    db = get_db()
    rows = await db.salary_structures.find(
        {"company_id": user.get("company_id"), "is_active": True}, {"_id": 0}
    ).sort("name", 1).to_list(100)
    return rows


@structures_router.post("")
async def create_structure(body: SalaryStructureCreate, user=Depends(require_roles(*ADMIN))):
    db = get_db()
    cid = user.get("company_id")
    if not cid: raise HTTPException(400, "Company scope required")
    doc = SalaryStructure(company_id=cid, **body.model_dump()).model_dump()
    await db.salary_structures.insert_one(doc)
    doc.pop("_id", None)
    return doc


@structures_router.put("/{sid}")
async def update_structure(sid: str, body: SalaryStructureCreate, user=Depends(require_roles(*ADMIN))):
    db = get_db()
    upd = {**body.model_dump(), "updated_at": now_iso()}
    r = await db.salary_structures.update_one({"id": sid, "company_id": user.get("company_id")}, {"$set": upd})
    if r.matched_count == 0: raise HTTPException(404, "Not found")
    return await db.salary_structures.find_one({"id": sid}, {"_id": 0})


@structures_router.delete("/{sid}")
async def delete_structure(sid: str, user=Depends(require_roles(*ADMIN))):
    db = get_db()
    await db.salary_structures.update_one(
        {"id": sid, "company_id": user.get("company_id")}, {"$set": {"is_active": False}}
    )
    return {"ok": True}


# ---------- Employee Compensation ----------
def _compute_lines(annual: float, components: list, structure_lines: list, overrides: dict) -> list:
    """Build per-employee salary lines from structure % / fixed amounts."""
    monthly = annual / 12.0
    comp_by_code = {c["code"]: c for c in components}
    out_lines = []
    # Pass 1: compute earnings first (Basic → HRA → others)
    earning_codes = [c["code"] for c in components if c["kind"] == "earning"]
    other_codes = [c["code"] for c in components if c["kind"] != "earning"]
    ordered = [sl for sl in structure_lines if sl["component_code"] in earning_codes] + \
              [sl for sl in structure_lines if sl["component_code"] in other_codes]

    def _line_of(code): return next((l for l in out_lines if l["component_code"] == code), None)
    def _basic(): return (_line_of("BASIC") or {}).get("monthly_amount", 0)
    def _gross_so_far():
        return sum(l["monthly_amount"] for l in out_lines if l["kind"] == "earning")

    # India statutory caps
    PF_WAGE_CEILING = 15000         # PF capped at ₹15k per EPFO rule
    ESIC_CEILING = 21000            # ESIC only if gross ≤ ₹21k

    for sl in ordered:
        code = sl["component_code"]
        comp = comp_by_code.get(code)
        if not comp: continue
        if code in overrides:
            m_amt = float(overrides[code])
        elif sl["calculation_type"] == "pct_of_ctc":
            m_amt = round((monthly * sl["value"] / 100.0), 2)
        elif sl["calculation_type"] == "pct_of_basic":
            m_amt = round((_basic() * sl["value"] / 100.0), 2)
        elif sl["calculation_type"] == "statutory":
            if code in ("PF", "EMPF"):
                # 12% of Basic, capped at ₹15k ceiling
                pf_wage = min(_basic(), PF_WAGE_CEILING)
                m_amt = round(pf_wage * 0.12, 2)
            elif code == "ESIC":
                gross = _gross_so_far()
                m_amt = round(gross * 0.0075, 2) if gross <= ESIC_CEILING else 0.0
            elif code == "EESIC":
                gross = _gross_so_far()
                m_amt = round(gross * 0.0325, 2) if gross <= ESIC_CEILING else 0.0
            elif code == "PT":
                # Default ₹200/month; TODO state-slab in Phase 2C
                m_amt = 200.0
            elif code == "GRAT":
                # 4.81% of basic (15 days per year / 26 working days)
                m_amt = round(_basic() * 0.0481, 2)
            elif code == "TDS":
                m_amt = 0.0  # Computed during payroll run (Phase 2B)
            else:
                m_amt = float(sl["value"])
        else:  # fixed
            m_amt = round(float(sl["value"]), 2)
        out_lines.append(EmployeeSalaryLine(
            component_id=comp["id"], component_code=code, component_name=comp["name"],
            kind=comp["kind"], category=comp["category"],
            monthly_amount=m_amt, annual_amount=round(m_amt * 12, 2),
            is_taxable=comp.get("is_taxable", True),
            is_pf_applicable=comp.get("is_pf_applicable", False),
            is_esic_applicable=comp.get("is_esic_applicable", False),
        ).model_dump())
    return out_lines


def _compute_totals(lines: list) -> tuple[float, float]:
    gross_monthly = sum(l["monthly_amount"] for l in lines if l["kind"] == "earning")
    total_ded = sum(l["monthly_amount"] for l in lines if l["kind"] == "deduction")
    net_est = gross_monthly - total_ded
    return gross_monthly, net_est


@comp_router.post("/assign")
async def assign_compensation(body: EmployeeSalaryAssign, user=Depends(require_roles(*ADMIN))):
    db = get_db()
    cid = user.get("company_id")
    emp = await db.employees.find_one({"id": body.employee_id, "company_id": cid}, {"_id": 0})
    if not emp: raise HTTPException(404, "Employee not found")

    # Load components (active)
    components = await db.salary_components.find(
        {"company_id": cid, "is_active": True}, {"_id": 0}
    ).to_list(200)
    if not components: raise HTTPException(400, "No salary components configured yet")

    structure = None
    structure_lines = []
    if body.structure_id:
        structure = await db.salary_structures.find_one(
            {"id": body.structure_id, "company_id": cid}, {"_id": 0}
        )
        if not structure: raise HTTPException(404, "Structure not found")
        structure_lines = structure["lines"]
    else:
        # Build default structure lines from components (percentage-based)
        DEFAULTS = {
            "BASIC": ("pct_of_ctc", 50.0), "HRA": ("pct_of_basic", 40.0),
            "SPECIAL": ("pct_of_ctc", 20.0), "CONV": ("fixed", 1600.0),
            "MEDICAL": ("fixed", 1250.0), "LTA": ("pct_of_ctc", 5.0),
            "PF": ("statutory", 0), "ESIC": ("statutory", 0),
            "PT": ("statutory", 0), "EMPF": ("statutory", 0),
        }
        structure_lines = []
        for c in components:
            if c["code"] in DEFAULTS:
                ct, val = DEFAULTS[c["code"]]
                structure_lines.append({
                    "component_id": c["id"], "component_code": c["code"], "component_name": c["name"],
                    "calculation_type": ct, "value": val,
                })

    lines = _compute_lines(body.ctc_annual, components, structure_lines, body.line_overrides)
    gross, net = _compute_totals(lines)

    # Archive existing current
    await db.employee_salaries.update_many(
        {"company_id": cid, "employee_id": emp["id"], "is_current": True},
        {"$set": {"is_current": False, "effective_to": body.effective_from, "updated_at": now_iso()}},
    )

    doc = EmployeeSalary(
        company_id=cid, employee_id=emp["id"], employee_name=emp["name"],
        employee_code=emp.get("employee_code", ""),
        structure_id=structure["id"] if structure else None,
        structure_name=structure["name"] if structure else None,
        effective_from=body.effective_from, ctc_annual=body.ctc_annual,
        gross_monthly=gross, net_monthly_estimate=net,
        lines=lines, tax_regime=body.tax_regime, revised_reason=body.revised_reason,
    ).model_dump()
    await db.employee_salaries.insert_one(doc)
    doc.pop("_id", None)
    return doc


@comp_router.get("/employee/{emp_id}")
async def get_compensation(emp_id: str, user=Depends(get_current_user)):
    """Self, HR, super_admin. Managers blocked to protect pay privacy."""
    db = get_db()
    emp = await db.employees.find_one({"id": emp_id}, {"_id": 0})
    if not emp: raise HTTPException(404, "Employee not found")
    if user["role"] == "super_admin":
        pass
    elif user.get("company_id") != emp.get("company_id"):
        raise HTTPException(403, "Forbidden")
    elif user["role"] not in COMP_VIEWERS and user.get("employee_id") != emp_id:
        raise HTTPException(403, "Forbidden")
    current = await db.employee_salaries.find_one(
        {"employee_id": emp_id, "is_current": True}, {"_id": 0}
    )
    history = await db.employee_salaries.find(
        {"employee_id": emp_id}, {"_id": 0, "lines": 0}
    ).sort("effective_from", -1).to_list(50)
    return {"current": current, "history": history}


@comp_router.get("/all")
async def list_all_compensations(user=Depends(require_roles(*COMP_VIEWERS))):
    db = get_db()
    rows = await db.employee_salaries.find(
        {"company_id": user.get("company_id"), "is_current": True},
        {"_id": 0, "lines": 0},
    ).sort("employee_name", 1).to_list(1000)
    return rows


@comp_router.put("/tax-regime")
async def update_own_regime(body: dict, user=Depends(get_current_user)):
    """Employee can switch their tax regime (old/new)."""
    db = get_db()
    new_regime = body.get("tax_regime")
    if new_regime not in ("old", "new"):
        raise HTTPException(400, "Invalid regime")
    if not user.get("employee_id"): raise HTTPException(400, "Not an employee")
    r = await db.employee_salaries.update_one(
        {"employee_id": user["employee_id"], "is_current": True},
        {"$set": {"tax_regime": new_regime, "updated_at": now_iso()}},
    )
    if r.matched_count == 0: raise HTTPException(404, "No active salary")
    return {"tax_regime": new_regime}
