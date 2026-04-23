"""Product/Service requests + vendor management."""
from fastapi import APIRouter, Depends, HTTPException
from auth import get_current_user, require_roles
from db import get_db
from models import PSRCreate, VendorCreate, now_iso, uid
from routers.approvals_routes import create_approval_request

router = APIRouter(prefix="/api/requests", tags=["requests"])


@router.post("")
async def create_request(body: PSRCreate, user=Depends(get_current_user)):
    db = get_db()
    if not user.get("employee_id"):
        raise HTTPException(400, "Only employees can create requests")
    emp = await db.employees.find_one({"id": user["employee_id"]}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employee missing")
    psr_id = uid()
    doc = {
        "id": psr_id, "company_id": emp["company_id"], "employee_id": emp["id"],
        "employee_name": emp["name"], "category": body.category, "title": body.title,
        "description": body.description, "quantity": body.quantity,
        "estimated_cost": body.estimated_cost, "route_to": body.route_to,
        "vendor_id": body.vendor_id, "urgency": body.urgency, "status": "pending",
        "approval_request_id": None, "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.product_service_requests.insert_one(doc)
    doc.pop("_id", None)
    ap = await create_approval_request(
        db, company_id=emp["company_id"], request_type="product_service",
        requester_user_id=user["id"], requester_name=emp["name"],
        title=f"{body.category.capitalize()}: {body.title}",
        details=body.model_dump(),
        linked_id=psr_id, requester_employee_id=emp["id"],
    )
    await db.product_service_requests.update_one({"id": psr_id}, {"$set": {"approval_request_id": ap["id"]}})
    doc["approval_request_id"] = ap["id"]
    return doc


@router.get("")
async def list_requests(user=Depends(get_current_user)):
    db = get_db()
    if user["role"] == "super_admin":
        rows = await db.product_service_requests.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    elif user["role"] == "employee" and user.get("employee_id"):
        rows = await db.product_service_requests.find({"employee_id": user["employee_id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    else:
        rows = await db.product_service_requests.find({"company_id": user.get("company_id")}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return rows


# ----- Vendors sub-resource -----
vendors_router = APIRouter(prefix="/api/vendors", tags=["vendors"])


@vendors_router.get("")
async def list_vendors(user=Depends(get_current_user)):
    db = get_db()
    return await db.vendors.find({"company_id": user.get("company_id")}, {"_id": 0}).to_list(500)


@vendors_router.post("")
async def create_vendor(body: VendorCreate, user=Depends(require_roles("super_admin", "company_admin", "branch_manager"))):
    db = get_db()
    doc = {
        "id": uid(), "company_id": user.get("company_id"), "name": body.name,
        "category": body.category, "contact_email": body.contact_email,
        "phone": body.phone, "country_id": body.country_id, "status": "active",
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.vendors.insert_one(doc)
    doc.pop("_id", None)
    return doc
