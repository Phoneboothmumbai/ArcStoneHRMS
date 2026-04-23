"""Employee document vault. Base64 storage for MVP; swap to S3/object storage in Phase 1G."""
import base64

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user
from db import get_db
from models import now_iso, uid
from models_profile import EmployeeDocumentUpload

router = APIRouter(prefix="/api/documents", tags=["documents"])

MAX_DOC_BYTES = 2 * 1024 * 1024  # 2 MB per doc
HR_ROLES = {"super_admin", "company_admin", "country_head", "region_head"}


def _can_access(user: dict, emp: dict) -> bool:
    if user["role"] == "super_admin":
        return True
    if user.get("company_id") != emp.get("company_id"):
        return False
    if user["role"] in HR_ROLES:
        return True
    return user.get("employee_id") == emp["id"]


@router.get("/employee/{emp_id}")
async def list_docs(emp_id: str, user=Depends(get_current_user)):
    db = get_db()
    emp = await db.employees.find_one({"id": emp_id}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Not found")
    if not _can_access(user, emp):
        raise HTTPException(403, "Forbidden")
    rows = await db.employee_documents.find(
        {"employee_id": emp_id},
        {"_id": 0, "data_base64": 0},
    ).sort("created_at", -1).to_list(500)
    return rows


@router.post("/employee/{emp_id}")
async def upload_doc(emp_id: str, body: EmployeeDocumentUpload, user=Depends(get_current_user)):
    db = get_db()
    emp = await db.employees.find_one({"id": emp_id}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Not found")
    if not _can_access(user, emp):
        raise HTTPException(403, "Forbidden")

    try:
        decoded = base64.b64decode(body.data_base64, validate=True)
    except Exception:
        raise HTTPException(400, "Invalid base64 data")
    if len(decoded) > MAX_DOC_BYTES:
        raise HTTPException(413, f"File too large (max {MAX_DOC_BYTES // (1024*1024)} MB)")

    doc = {
        "id": uid(), "company_id": emp["company_id"], "employee_id": emp_id,
        "category": body.category, "filename": body.filename,
        "content_type": body.content_type, "size_bytes": len(decoded),
        "data_base64": body.data_base64, "notes": body.notes,
        "uploaded_by_user_id": user["id"],
        "uploaded_by_name": user.get("name") or user.get("email"),
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.employee_documents.insert_one(doc)
    doc.pop("_id", None)
    doc.pop("data_base64", None)
    return doc


@router.get("/{doc_id}/download")
async def download_doc(doc_id: str, user=Depends(get_current_user)):
    db = get_db()
    d = await db.employee_documents.find_one({"id": doc_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Not found")
    emp = await db.employees.find_one({"id": d["employee_id"]}, {"_id": 0})
    if not emp or not _can_access(user, emp):
        raise HTTPException(403, "Forbidden")
    return {
        "filename": d["filename"], "content_type": d["content_type"],
        "data_base64": d["data_base64"],
    }


@router.delete("/{doc_id}")
async def delete_doc(doc_id: str, user=Depends(get_current_user)):
    db = get_db()
    d = await db.employee_documents.find_one({"id": doc_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Not found")
    emp = await db.employees.find_one({"id": d["employee_id"]}, {"_id": 0})
    if not emp or not _can_access(user, emp):
        raise HTTPException(403, "Forbidden")
    await db.employee_documents.delete_one({"id": doc_id})
    return {"ok": True}
