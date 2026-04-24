"""Phase 1F — Letters CRUD + generation + click-wrap signature."""
from __future__ import annotations

import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from auth import get_current_user, require_roles
from db import get_db
from models import now_iso
from models_letters import (
    GeneratedLetter, LetterGenerate, LetterSignature, LetterTemplate, LetterTemplateCreate,
)

tmpl_router = APIRouter(prefix="/api/letter-templates", tags=["letter-templates"])
letters_router = APIRouter(prefix="/api/letters", tags=["letters"])

ADMIN = ("super_admin", "company_admin")

_MERGE_RE = re.compile(r"\{\{\s*([a-zA-Z0-9_\.]+)\s*\}\}")


def _render(template_md: str, values: dict) -> str:
    def repl(m):
        key = m.group(1)
        return str(values.get(key, f"{{{{{key}}}}}"))
    return _MERGE_RE.sub(repl, template_md)


def _extract_merge_fields(md: str) -> list[str]:
    return sorted(set(_MERGE_RE.findall(md)))


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------
@tmpl_router.get("")
async def list_templates(user=Depends(require_roles(*ADMIN))):
    db = get_db()
    rows = await db.letter_templates.find(
        {"company_id": user.get("company_id"), "is_active": True}, {"_id": 0},
    ).sort("name", 1).to_list(200)
    return rows


@tmpl_router.post("")
async def create_template(body: LetterTemplateCreate, user=Depends(require_roles(*ADMIN))):
    db = get_db()
    cid = user.get("company_id")
    if await db.letter_templates.find_one({"company_id": cid, "slug": body.slug, "is_active": True}):
        raise HTTPException(400, "Template with this slug already exists")
    payload = body.model_dump()
    # Auto-derive merge fields if the caller didn't specify
    if not payload.get("merge_fields"):
        payload["merge_fields"] = _extract_merge_fields(body.body_markdown)
    doc = LetterTemplate(company_id=cid, **payload).model_dump()
    await db.letter_templates.insert_one(doc)
    doc.pop("_id", None)
    return doc


@tmpl_router.put("/{tid}")
async def update_template(tid: str, body: LetterTemplateCreate, user=Depends(require_roles(*ADMIN))):
    db = get_db()
    upd = body.model_dump()
    if not upd.get("merge_fields"):
        upd["merge_fields"] = _extract_merge_fields(body.body_markdown)
    upd["updated_at"] = now_iso()
    r = await db.letter_templates.update_one(
        {"id": tid, "company_id": user.get("company_id")}, {"$set": upd},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Not found")
    return await db.letter_templates.find_one({"id": tid}, {"_id": 0})


@tmpl_router.delete("/{tid}")
async def delete_template(tid: str, user=Depends(require_roles(*ADMIN))):
    db = get_db()
    await db.letter_templates.update_one(
        {"id": tid, "company_id": user.get("company_id")},
        {"$set": {"is_active": False, "updated_at": now_iso()}},
    )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Generate + sign
# ---------------------------------------------------------------------------
@letters_router.post("/generate")
async def generate_letter(body: LetterGenerate, user=Depends(require_roles(*ADMIN))):
    db = get_db()
    cid = user.get("company_id")
    tpl = await db.letter_templates.find_one(
        {"id": body.template_id, "company_id": cid, "is_active": True}, {"_id": 0},
    )
    if not tpl:
        raise HTTPException(404, "Template not found")

    # Auto-fill from employee profile (if employee selected)
    merge_values = dict(body.merge_values)
    emp_name = None
    if body.employee_id:
        emp = await db.employees.find_one({"id": body.employee_id, "company_id": cid}, {"_id": 0})
        if not emp:
            raise HTTPException(404, "Employee not found")
        emp_name = emp["name"]
        prof = await db.employee_profiles.find_one({"employee_id": body.employee_id}, {"_id": 0}) or {}
        sal = await db.employee_salaries.find_one(
            {"company_id": cid, "employee_id": body.employee_id, "is_current": True}, {"_id": 0},
        ) or {}
        auto = {
            "employee_name": emp["name"],
            "employee_code": emp.get("employee_code", ""),
            "designation": emp.get("job_title", ""),
            "department": emp.get("department_name", ""),
            "branch": emp.get("branch_name", ""),
            "doj": emp.get("date_of_joining", ""),
            "ctc_annual": f"{sal.get('ctc_annual', 0):.0f}",
            "gross_monthly": f"{sal.get('gross_monthly', 0):.2f}",
            "today": now_iso()[:10],
        }
        # Employee wins only for fields the caller didn't explicitly provide
        for k, v in auto.items():
            merge_values.setdefault(k, v)

    rendered = _render(tpl["body_markdown"], merge_values)
    doc = GeneratedLetter(
        company_id=cid, template_id=tpl["id"], template_name=tpl["name"],
        category=tpl["category"], employee_id=body.employee_id, employee_name=emp_name,
        rendered_markdown=rendered, merge_values=merge_values,
        issued_by=user["id"], issued_at=now_iso(),
    ).model_dump()
    await db.generated_letters.insert_one(doc)
    doc.pop("_id", None)
    return doc


@letters_router.get("")
async def list_letters(
    employee_id: Optional[str] = None,
    category: Optional[str] = None,
    user=Depends(get_current_user),
):
    db = get_db()
    cid = user.get("company_id")
    flt: dict = {"company_id": cid}
    if category:
        flt["category"] = category
    if user["role"] not in ("super_admin", "company_admin", "country_head", "region_head"):
        flt["employee_id"] = user.get("employee_id")
    elif employee_id:
        flt["employee_id"] = employee_id
    rows = await db.generated_letters.find(
        flt, {"_id": 0, "rendered_markdown": 0, "pdf_base64": 0},
    ).sort("created_at", -1).to_list(1000)
    return rows


@letters_router.get("/{lid}")
async def get_letter(lid: str, user=Depends(get_current_user)):
    db = get_db()
    doc = await db.generated_letters.find_one({"id": lid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    if user["role"] == "super_admin":
        return doc
    if user.get("company_id") != doc["company_id"]:
        raise HTTPException(403, "Forbidden")
    if user["role"] not in ("company_admin", "country_head", "region_head") and user.get("employee_id") != doc["employee_id"]:
        raise HTTPException(403, "Forbidden")
    return doc


@letters_router.post("/{lid}/sign")
async def sign_letter(lid: str, body: dict, request: Request, user=Depends(get_current_user)):
    """Click-wrap e-sign. body: {method, signature_image_base64?}"""
    db = get_db()
    doc = await db.generated_letters.find_one({"id": lid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    if user.get("company_id") != doc["company_id"]:
        raise HTTPException(403, "Forbidden")
    sig = LetterSignature(
        signer_role="employee" if user.get("employee_id") == doc.get("employee_id") else "hr",
        signer_user_id=user["id"], signer_name=user["name"],
        signed_at=now_iso(), method=body.get("method", "click_wrap"),
        ip_address=request.client.host if request.client else None,
        signature_image_base64=body.get("signature_image_base64"),
    ).model_dump()
    await db.generated_letters.update_one(
        {"id": lid},
        {"$push": {"signatures": sig},
         "$set": {"status": "signed", "updated_at": now_iso()}},
    )
    return await db.generated_letters.find_one({"id": lid}, {"_id": 0})
