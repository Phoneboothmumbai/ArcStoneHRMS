"""Procurement & Vendor Marketplace: vendors, RFQ sealed-bid, quotes,
purchase orders with approvals, vendor ratings, and a public vendor portal."""
from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi import Depends as _Depends

from auth import get_current_user, require_roles
from db import get_db
from models import now_iso, uid
from models_procurement import (
    Vendor, VendorCreate, VendorStatus,
    VendorRating, VendorRatingCreate,
    RFQ, RFQCreate, RFQInvite, RFQInviteVendors, RFQAward, RFQStatus,
    Quote, QuoteCreate, QuoteStatus,
    PurchaseOrder, POCreate, POLine, POStatus,
    POReceipt, POReceiptCreate, POInvoice,
)
from tenant import requires_module

_gate = [_Depends(requires_module("procurement"))]

vendors_router = APIRouter(prefix="/api/procurement/vendors", tags=["procurement:vendors"], dependencies=_gate)
rfq_router = APIRouter(prefix="/api/rfqs", tags=["procurement:rfqs"], dependencies=_gate)
po_router = APIRouter(prefix="/api/purchase-orders", tags=["procurement:po"], dependencies=_gate)

# Vendor-portal routes — NOT gated by requires_module (vendors authenticate via token)
portal_router = APIRouter(prefix="/api/vendor-portal", tags=["procurement:vendor-portal"])

HR = ("super_admin", "company_admin", "country_head", "region_head")
PROCURE = HR + ("branch_manager",)


def _cid(user):
    cid = user.get("company_id")
    if not cid:
        raise HTTPException(403, "No tenant scope")
    return cid


async def _seq(db, cid: str, coll: str, prefix: str) -> str:
    year = datetime.now(timezone.utc).year
    count = await db[coll].count_documents({"company_id": cid}) + 1
    return f"{prefix}-{year}-{count:04d}"


# ---------------------------------------------------------------------------
# Vendor CRUD (internal HR/admin side)
# ---------------------------------------------------------------------------
@vendors_router.post("")
async def create_vendor(body: VendorCreate, user=Depends(require_roles(*PROCURE))):
    db = get_db()
    cid = _cid(user)
    code = f"V-{await db.vendors.count_documents({'company_id': cid}) + 1:04d}"
    doc = Vendor(
        company_id=cid, code=code,
        portal_token=secrets.token_urlsafe(32),
        **body.model_dump(),
    ).model_dump()
    await db.vendors.insert_one(doc)
    doc.pop("_id", None)
    return doc


@vendors_router.get("")
async def list_vendors(
    status: Optional[VendorStatus] = None, category: Optional[str] = None,
    user=Depends(get_current_user),
):
    db = get_db()
    flt: dict = {"company_id": _cid(user)}
    if status:
        flt["status"] = status
    if category:
        flt["category"] = category
    # Strip portal_token from list responses (only HR can see via detail)
    rows = await db.vendors.find(
        flt, {"_id": 0, "portal_token": 0, "documents": 0},
    ).sort("name", 1).to_list(1000)
    return rows


@vendors_router.get("/{vid}")
async def get_vendor(vid: str, user=Depends(get_current_user)):
    db = get_db()
    doc = await db.vendors.find_one({"id": vid, "company_id": _cid(user)}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Vendor not found")
    # Portal token only exposed to HR
    if user["role"] not in HR:
        doc.pop("portal_token", None)
    return doc


@vendors_router.patch("/{vid}")
async def update_vendor(vid: str, body: dict, user=Depends(require_roles(*PROCURE))):
    db = get_db()
    allowed = {"name", "kind", "category", "contact_name", "contact_email", "phone",
               "country_id", "address", "gstin", "pan", "msme_number", "bank",
               "status", "tags", "notes"}
    upd = {k: v for k, v in body.items() if k in allowed}
    upd["updated_at"] = now_iso()
    r = await db.vendors.update_one(
        {"id": vid, "company_id": _cid(user)}, {"$set": upd},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Vendor not found")
    return await db.vendors.find_one({"id": vid}, {"_id": 0})


@vendors_router.post("/{vid}/rotate-token")
async def rotate_portal_token(vid: str, user=Depends(require_roles(*HR))):
    db = get_db()
    new_token = secrets.token_urlsafe(32)
    r = await db.vendors.update_one(
        {"id": vid, "company_id": _cid(user)},
        {"$set": {"portal_token": new_token, "updated_at": now_iso()}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Vendor not found")
    return {"portal_token": new_token,
            "portal_url_hint": "Share this with the vendor. They paste it into the portal login or use ?token=XYZ."}


# ---------------------------------------------------------------------------
# Vendor ratings
# ---------------------------------------------------------------------------
@vendors_router.post("/rate")
async def rate_vendor(body: VendorRatingCreate, user=Depends(require_roles(*PROCURE))):
    db = get_db()
    cid = _cid(user)
    vendor = await db.vendors.find_one({"id": body.vendor_id, "company_id": cid}, {"_id": 0, "rating": 1, "ratings_count": 1})
    if not vendor:
        raise HTTPException(404, "Vendor not found")
    rating_doc = VendorRating(
        company_id=cid, vendor_id=body.vendor_id, po_id=body.po_id,
        rating=body.rating, comment=body.comment,
        rated_by_user_id=user["id"], rated_by_name=user["name"],
    ).model_dump()
    await db.vendor_ratings.insert_one(rating_doc)
    # Roll up avg
    total = (vendor.get("rating", 0.0) * vendor.get("ratings_count", 0) + body.rating)
    new_count = vendor.get("ratings_count", 0) + 1
    new_avg = round(total / new_count, 2) if new_count else 0
    await db.vendors.update_one(
        {"id": body.vendor_id},
        {"$set": {"rating": new_avg, "ratings_count": new_count, "updated_at": now_iso()}},
    )
    rating_doc.pop("_id", None)
    return rating_doc


@vendors_router.get("/{vid}/ratings")
async def list_vendor_ratings(vid: str, user=Depends(get_current_user)):
    db = get_db()
    rows = await db.vendor_ratings.find(
        {"company_id": _cid(user), "vendor_id": vid}, {"_id": 0},
    ).sort("created_at", -1).to_list(200)
    return rows


# ---------------------------------------------------------------------------
# RFQ — sealed-bid
# ---------------------------------------------------------------------------
@rfq_router.post("")
async def create_rfq(body: RFQCreate, user=Depends(require_roles(*PROCURE))):
    db = get_db()
    cid = _cid(user)
    code = await _seq(db, cid, "rfqs", "RFQ")
    items = [i.model_dump() if hasattr(i, "model_dump") else dict(i) for i in body.items]
    for it in items:
        it.setdefault("id", uid())
    doc = RFQ(
        company_id=cid, code=code,
        title=body.title, category=body.category, description=body.description,
        deadline=body.deadline, delivery_required_by=body.delivery_required_by,
        delivery_location=body.delivery_location, terms_markdown=body.terms_markdown,
        currency=body.currency, items=items, status="draft",
        created_by_user_id=user["id"], created_by_name=user["name"],
    ).model_dump()
    await db.rfqs.insert_one(doc)
    doc.pop("_id", None)
    return doc


@rfq_router.get("")
async def list_rfqs(status: Optional[RFQStatus] = None, user=Depends(get_current_user)):
    db = get_db()
    flt: dict = {"company_id": _cid(user)}
    if status:
        flt["status"] = status
    rows = await db.rfqs.find(flt, {"_id": 0}).sort("created_at", -1).to_list(500)
    return rows


@rfq_router.get("/{rid}")
async def get_rfq(rid: str, user=Depends(get_current_user)):
    db = get_db()
    rfq = await db.rfqs.find_one({"id": rid, "company_id": _cid(user)}, {"_id": 0})
    if not rfq:
        raise HTTPException(404, "RFQ not found")
    return rfq


@rfq_router.post("/{rid}/invite")
async def invite_vendors(rid: str, body: RFQInviteVendors, user=Depends(require_roles(*PROCURE))):
    db = get_db()
    cid = _cid(user)
    rfq = await db.rfqs.find_one({"id": rid, "company_id": cid}, {"_id": 0})
    if not rfq:
        raise HTTPException(404, "RFQ not found")
    invited_ids = {v["vendor_id"] for v in (rfq.get("invited_vendors") or [])}
    new_invites = []
    for vid in body.vendor_ids:
        if vid in invited_ids:
            continue
        v = await db.vendors.find_one({"id": vid, "company_id": cid}, {"_id": 0, "name": 1})
        if not v:
            continue
        new_invites.append({"vendor_id": vid, "vendor_name": v["name"],
                            "invited_at": now_iso(), "viewed_at": None, "quote_id": None})
    if not new_invites:
        return rfq
    await db.rfqs.update_one(
        {"id": rid, "company_id": cid},
        {"$push": {"invited_vendors": {"$each": new_invites}},
         "$set": {"updated_at": now_iso()}},
    )
    return await db.rfqs.find_one({"id": rid}, {"_id": 0})


@rfq_router.post("/{rid}/status")
async def set_rfq_status(rid: str, body: dict, user=Depends(require_roles(*PROCURE))):
    new_status = body.get("status")
    if new_status not in ("draft", "open", "closed", "cancelled"):
        raise HTTPException(400, "Invalid status (only draft/open/closed/cancelled here; award via /award)")
    db = get_db()
    cid = _cid(user)
    rfq = await db.rfqs.find_one({"id": rid, "company_id": cid}, {"_id": 0})
    if not rfq:
        raise HTTPException(404, "RFQ not found")
    upd = {"status": new_status, "updated_at": now_iso()}
    await db.rfqs.update_one({"id": rid, "company_id": cid}, {"$set": upd})
    # If closed, unseal all quotes for this RFQ
    if new_status == "closed":
        await db.quotes.update_many(
            {"rfq_id": rid, "company_id": cid},
            {"$set": {"sealed": False, "updated_at": now_iso()}},
        )
    return await db.rfqs.find_one({"id": rid}, {"_id": 0})


@rfq_router.get("/{rid}/quotes")
async def list_rfq_quotes(rid: str, user=Depends(require_roles(*PROCURE))):
    """After RFQ deadline (or status=closed), quotes are unsealed and visible."""
    db = get_db()
    cid = _cid(user)
    rfq = await db.rfqs.find_one({"id": rid, "company_id": cid}, {"_id": 0})
    if not rfq:
        raise HTTPException(404, "RFQ not found")
    # Auto-unseal if deadline has passed
    now = datetime.now(timezone.utc).isoformat()
    if rfq.get("deadline") and rfq["deadline"] < now:
        await db.quotes.update_many(
            {"rfq_id": rid, "company_id": cid, "sealed": True},
            {"$set": {"sealed": False, "updated_at": now_iso()}},
        )
    quotes = await db.quotes.find(
        {"rfq_id": rid, "company_id": cid, "sealed": False},
        {"_id": 0},
    ).sort("total_amount", 1).to_list(500)
    sealed_count = await db.quotes.count_documents(
        {"rfq_id": rid, "company_id": cid, "sealed": True},
    )
    return {"rfq_id": rid, "quotes": quotes, "sealed_count": sealed_count}


@rfq_router.get("/{rid}/compare")
async def compare_rfq_quotes(rid: str, user=Depends(require_roles(*PROCURE))):
    """Side-by-side comparison matrix: vendor × line-item with totals and deltas."""
    db = get_db()
    cid = _cid(user)
    rfq = await db.rfqs.find_one({"id": rid, "company_id": cid}, {"_id": 0})
    if not rfq:
        raise HTTPException(404, "RFQ not found")
    quotes = await db.quotes.find(
        {"rfq_id": rid, "company_id": cid, "sealed": False,
         "status": {"$nin": ["withdrawn", "rejected"]}},
        {"_id": 0},
    ).sort("total_amount", 1).to_list(500)
    # Build matrix
    items = rfq.get("items") or []
    matrix = []
    for it in items:
        row = {"item_id": it["id"], "description": it["description"],
               "quantity": it.get("quantity"), "unit": it.get("unit"),
               "target_unit_price": it.get("target_unit_price"),
               "vendor_prices": {}}
        for q in quotes:
            line = next((ln for ln in (q.get("lines") or []) if ln.get("rfq_item_id") == it["id"]), None)
            if line:
                row["vendor_prices"][q["vendor_id"]] = {
                    "unit_price": line.get("unit_price"),
                    "quantity_offered": line.get("quantity_offered"),
                    "notes": line.get("notes"),
                }
        matrix.append(row)
    lowest_total = min((q["total_amount"] for q in quotes), default=None)
    return {
        "rfq": {"id": rid, "code": rfq.get("code"), "title": rfq.get("title"),
                "deadline": rfq.get("deadline"), "status": rfq.get("status")},
        "vendors": [{"id": q["vendor_id"], "name": q["vendor_name"],
                     "total_amount": q["total_amount"], "quote_id": q["id"],
                     "delivery_days": q.get("delivery_days"),
                     "status": q.get("status"),
                     "savings_pct": round((lowest_total and q["total_amount"]) and
                                           (1 - lowest_total / q["total_amount"]) * 100, 2) if lowest_total else 0}
                    for q in quotes],
        "matrix": matrix,
        "lowest_total": lowest_total,
    }


@rfq_router.post("/{rid}/award")
async def award_rfq(rid: str, body: RFQAward, user=Depends(require_roles(*HR))):
    """Pick the winning quote. Optionally auto-drafts a PO from it."""
    db = get_db()
    cid = _cid(user)
    rfq = await db.rfqs.find_one({"id": rid, "company_id": cid}, {"_id": 0})
    if not rfq:
        raise HTTPException(404, "RFQ not found")
    quote = await db.quotes.find_one({"id": body.quote_id, "rfq_id": rid, "company_id": cid}, {"_id": 0})
    if not quote:
        raise HTTPException(404, "Quote not found for this RFQ")
    # Mark winners / losers
    await db.quotes.update_one({"id": body.quote_id}, {"$set": {"status": "awarded", "updated_at": now_iso()}})
    await db.quotes.update_many(
        {"rfq_id": rid, "id": {"$ne": body.quote_id}, "status": {"$nin": ["withdrawn", "rejected"]}},
        {"$set": {"status": "lost", "updated_at": now_iso()}},
    )
    await db.rfqs.update_one(
        {"id": rid, "company_id": cid},
        {"$set": {"status": "awarded", "awarded_quote_id": body.quote_id,
                  "awarded_vendor_id": quote["vendor_id"], "awarded_at": now_iso(),
                  "updated_at": now_iso()}},
    )
    # Auto-draft PO
    items = rfq.get("items") or []
    po_lines = []
    for it in items:
        line = next((ln for ln in (quote.get("lines") or []) if ln.get("rfq_item_id") == it["id"]), None)
        if not line:
            continue
        up = float(line.get("unit_price") or 0)
        qty = float(it.get("quantity") or line.get("quantity_offered") or 0)
        amt = round(up * qty, 2)
        po_lines.append({
            "id": uid(), "description": it["description"], "sku": it.get("sku"),
            "quantity": qty, "unit": it.get("unit", "piece"),
            "unit_price": up, "tax_pct": 0, "amount": amt,
            "tax_amount": 0.0, "total": amt, "received_qty": 0.0,
        })
    subtotal = round(sum(ln["amount"] for ln in po_lines), 2)
    po = PurchaseOrder(
        company_id=cid, code=await _seq(db, cid, "purchase_orders", "PO"),
        title=f"PO from {rfq.get('code')}",
        vendor_id=quote["vendor_id"], vendor_name=quote["vendor_name"],
        rfq_id=rid, quote_id=body.quote_id, status="draft",
        currency=quote.get("currency") or "INR", lines=po_lines,
        subtotal=subtotal, tax_total=0.0, grand_total=subtotal,
        delivery_location=rfq.get("delivery_location"),
        expected_delivery_date=rfq.get("delivery_required_by"),
        payment_terms=quote.get("payment_terms"),
        created_by_user_id=user["id"], created_by_name=user["name"],
    ).model_dump()
    await db.purchase_orders.insert_one(po)
    await db.rfqs.update_one({"id": rid}, {"$set": {"po_id": po["id"]}})
    po.pop("_id", None)
    return {"rfq": await db.rfqs.find_one({"id": rid}, {"_id": 0}), "po": po}


# ---------------------------------------------------------------------------
# Purchase Orders — with approval chain
# ---------------------------------------------------------------------------
def _recalc_po_totals(lines: list[dict], currency: str = "INR") -> tuple[float, float, float]:
    subtotal = 0.0
    tax_total = 0.0
    for ln in lines:
        qty = float(ln.get("quantity") or 0)
        up = float(ln.get("unit_price") or 0)
        tax_pct = float(ln.get("tax_pct") or 0)
        amt = round(qty * up, 2)
        tax_amt = round(amt * tax_pct / 100.0, 2)
        ln["amount"] = amt
        ln["tax_amount"] = tax_amt
        ln["total"] = round(amt + tax_amt, 2)
        subtotal += amt
        tax_total += tax_amt
    return round(subtotal, 2), round(tax_total, 2), round(subtotal + tax_total, 2)


@po_router.post("")
async def create_po(body: POCreate, user=Depends(require_roles(*PROCURE))):
    db = get_db()
    cid = _cid(user)
    vendor = await db.vendors.find_one({"id": body.vendor_id, "company_id": cid}, {"_id": 0})
    if not vendor:
        raise HTTPException(404, "Vendor not found")
    lines = [ln.model_dump() if hasattr(ln, "model_dump") else dict(ln) for ln in body.lines]
    for ln in lines:
        ln.setdefault("id", uid())
    subtotal, tax_total, grand = _recalc_po_totals(lines, body.currency)
    po = PurchaseOrder(
        company_id=cid, code=await _seq(db, cid, "purchase_orders", "PO"),
        title=body.title, vendor_id=body.vendor_id, vendor_name=vendor["name"],
        rfq_id=body.rfq_id, quote_id=body.quote_id,
        currency=body.currency, lines=lines,
        subtotal=subtotal, tax_total=tax_total, grand_total=grand,
        delivery_location=body.delivery_location,
        expected_delivery_date=body.expected_delivery_date,
        payment_terms=body.payment_terms, terms_markdown=body.terms_markdown,
        created_by_user_id=user["id"], created_by_name=user["name"],
        status="draft",
    ).model_dump()
    await db.purchase_orders.insert_one(po)
    po.pop("_id", None)
    return po


@po_router.get("")
async def list_pos(
    status: Optional[POStatus] = None, vendor_id: Optional[str] = None,
    user=Depends(get_current_user),
):
    db = get_db()
    flt: dict = {"company_id": _cid(user)}
    if status:
        flt["status"] = status
    if vendor_id:
        flt["vendor_id"] = vendor_id
    rows = await db.purchase_orders.find(
        flt, {"_id": 0, "receipts": 0, "invoice_base64": 0},
    ).sort("created_at", -1).to_list(500)
    return rows


@po_router.get("/{pid}")
async def get_po(pid: str, user=Depends(get_current_user)):
    db = get_db()
    doc = await db.purchase_orders.find_one({"id": pid, "company_id": _cid(user)}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "PO not found")
    return doc


@po_router.post("/{pid}/submit-for-approval")
async def submit_po(pid: str, user=Depends(require_roles(*PROCURE))):
    """Fire into the approval chain engine."""
    from routers.approvals_routes import create_approval_request
    db = get_db()
    cid = _cid(user)
    po = await db.purchase_orders.find_one({"id": pid, "company_id": cid}, {"_id": 0})
    if not po:
        raise HTTPException(404, "PO not found")
    if po["status"] not in ("draft",):
        raise HTTPException(400, "Only draft POs can be submitted")
    ap = await create_approval_request(
        db, company_id=cid, request_type="purchase_order",
        requester_user_id=user["id"], requester_name=user["name"],
        title=f"PO {po['code']} — {po['vendor_name']} — {po['currency']} {po['grand_total']:,.2f}",
        details={"po_id": pid, "vendor_name": po["vendor_name"],
                 "grand_total": po["grand_total"], "currency": po["currency"]},
        linked_id=pid,
        context={"cost": po["grand_total"]},
    )
    await db.purchase_orders.update_one(
        {"id": pid, "company_id": cid},
        {"$set": {"status": "awaiting_approval", "approval_request_id": ap["id"],
                  "updated_at": now_iso()}},
    )
    return await db.purchase_orders.find_one({"id": pid}, {"_id": 0})


@po_router.post("/{pid}/approve-decision")
async def po_approve_decision(pid: str, body: dict, user=Depends(require_roles(*HR))):
    """HR convenience endpoint for quick approve/reject without going through approvals UI.

    body: {decision: 'approved' | 'rejected', notes?: str}
    """
    db = get_db()
    cid = _cid(user)
    decision = body.get("decision")
    if decision not in ("approved", "rejected"):
        raise HTTPException(400, "decision must be 'approved' or 'rejected'")
    po = await db.purchase_orders.find_one({"id": pid, "company_id": cid}, {"_id": 0})
    if not po:
        raise HTTPException(404, "PO not found")
    if po["status"] != "awaiting_approval":
        raise HTTPException(400, "PO is not awaiting approval")
    await db.purchase_orders.update_one(
        {"id": pid, "company_id": cid},
        {"$set": {"status": decision, "updated_at": now_iso()}},
    )
    return await db.purchase_orders.find_one({"id": pid}, {"_id": 0})


@po_router.post("/{pid}/send")
async def send_po(pid: str, user=Depends(require_roles(*PROCURE))):
    """Mark PO as sent to vendor (e.g., emailed; here we flip status)."""
    db = get_db()
    cid = _cid(user)
    po = await db.purchase_orders.find_one({"id": pid, "company_id": cid}, {"_id": 0})
    if not po:
        raise HTTPException(404, "PO not found")
    if po["status"] not in ("approved", "draft"):
        raise HTTPException(400, "Only approved (or draft for low-value) POs can be sent")
    await db.purchase_orders.update_one(
        {"id": pid}, {"$set": {"status": "sent", "sent_at": now_iso(), "updated_at": now_iso()}},
    )
    return await db.purchase_orders.find_one({"id": pid}, {"_id": 0})


@po_router.post("/{pid}/receive")
async def receive_po(pid: str, body: POReceiptCreate, user=Depends(require_roles(*PROCURE))):
    """Record a goods receipt. Supports partial receipt."""
    db = get_db()
    cid = _cid(user)
    po = await db.purchase_orders.find_one({"id": pid, "company_id": cid}, {"_id": 0})
    if not po:
        raise HTTPException(404, "PO not found")
    if po["status"] not in ("sent", "acknowledged", "in_transit", "partially_received"):
        raise HTTPException(400, f"Cannot receive PO in status {po['status']}")
    # Update received_qty on each line
    lines = po.get("lines") or []
    for rl in body.lines:
        line_id = rl.po_line_id if hasattr(rl, "po_line_id") else rl["po_line_id"]
        qty = float(rl.quantity if hasattr(rl, "quantity") else rl["quantity"])
        for ln in lines:
            if ln["id"] == line_id:
                ln["received_qty"] = round(float(ln.get("received_qty", 0)) + qty, 3)
                break
    # Check if fully received
    all_received = all(float(ln.get("received_qty", 0)) >= float(ln.get("quantity", 0)) for ln in lines)
    new_status = "received" if all_received else "partially_received"
    receipt = POReceipt(
        id=uid(), received_at=now_iso(),
        received_by_user_id=user["id"], received_by_name=user["name"],
        lines=[rl if isinstance(rl, dict) else rl.model_dump() for rl in body.lines],
        notes=body.notes, attachments=body.attachments,
    ).model_dump()
    upd = {
        "lines": lines, "status": new_status, "updated_at": now_iso(),
    }
    if new_status == "received":
        upd["received_at"] = now_iso()
    await db.purchase_orders.update_one(
        {"id": pid, "company_id": cid},
        {"$set": upd, "$push": {"receipts": receipt}},
    )
    return await db.purchase_orders.find_one({"id": pid}, {"_id": 0})


@po_router.post("/{pid}/invoice")
async def invoice_po(pid: str, body: POInvoice, user=Depends(require_roles(*HR))):
    db = get_db()
    cid = _cid(user)
    po = await db.purchase_orders.find_one({"id": pid, "company_id": cid}, {"_id": 0})
    if not po:
        raise HTTPException(404, "PO not found")
    if po["status"] not in ("received", "partially_received"):
        raise HTTPException(400, "Receive goods first")
    await db.purchase_orders.update_one(
        {"id": pid, "company_id": cid},
        {"$set": {"status": "invoiced", "invoiced_at": now_iso(),
                  "invoice_number": body.invoice_number,
                  "invoice_amount": body.invoice_amount,
                  "invoice_base64": body.invoice_base64,
                  "updated_at": now_iso()}},
    )
    return await db.purchase_orders.find_one({"id": pid}, {"_id": 0, "invoice_base64": 0})


@po_router.post("/{pid}/pay")
async def mark_po_paid(pid: str, user=Depends(require_roles(*HR))):
    db = get_db()
    cid = _cid(user)
    r = await db.purchase_orders.update_one(
        {"id": pid, "company_id": cid, "status": "invoiced"},
        {"$set": {"status": "paid", "paid_at": now_iso(), "updated_at": now_iso()}},
    )
    if r.matched_count == 0:
        raise HTTPException(400, "PO must be invoiced before marking paid")
    return await db.purchase_orders.find_one({"id": pid}, {"_id": 0})


# ---------------------------------------------------------------------------
# VENDOR PORTAL — public-facing, token-based auth
# Vendor gets portal_url?token=XYZ via email; pastes token or uses link.
# Token is passed in `X-Vendor-Token` header OR `?token=` query param.
# ---------------------------------------------------------------------------
async def _vendor_from_token(
    db, token: Optional[str] = None,
    query_token: Optional[str] = None,
) -> dict:
    t = token or query_token
    if not t:
        raise HTTPException(401, "Missing vendor token")
    v = await db.vendors.find_one({"portal_token": t}, {"_id": 0})
    if not v:
        raise HTTPException(401, "Invalid vendor token")
    if v.get("status") in ("blacklisted", "suspended"):
        raise HTTPException(403, f"Vendor is {v['status']}")
    return v


async def _vendor_auth(
    x_vendor_token: Optional[str] = Header(None, alias="X-Vendor-Token"),
    token: Optional[str] = Query(None),
):
    db = get_db()
    return await _vendor_from_token(db, x_vendor_token, token)


@portal_router.get("/me")
async def portal_me(vendor=Depends(_vendor_auth)):
    # Strip portal_token from response
    v = dict(vendor)
    v.pop("portal_token", None)
    return v


@portal_router.get("/rfqs")
async def portal_list_rfqs(vendor=Depends(_vendor_auth)):
    """List RFQs this vendor has been invited to."""
    db = get_db()
    rfqs = await db.rfqs.find(
        {"company_id": vendor["company_id"],
         "invited_vendors.vendor_id": vendor["id"],
         "status": {"$in": ["open", "closed", "awarded"]}},
        {"_id": 0, "items.target_unit_price": 0},          # hide target prices from vendors
    ).sort("deadline", 1).to_list(200)
    # Mark which ones the vendor has already quoted
    vendor_quotes = await db.quotes.find(
        {"vendor_id": vendor["id"], "company_id": vendor["company_id"]},
        {"_id": 0, "rfq_id": 1, "id": 1, "status": 1, "total_amount": 1},
    ).to_list(500)
    qmap = {q["rfq_id"]: q for q in vendor_quotes}
    for r in rfqs:
        q = qmap.get(r["id"])
        r["my_quote"] = q
        # Mark viewed timestamp on first load
        invited = next((iv for iv in r.get("invited_vendors") or [] if iv["vendor_id"] == vendor["id"]), None)
        if invited and not invited.get("viewed_at"):
            await db.rfqs.update_one(
                {"id": r["id"], "invited_vendors.vendor_id": vendor["id"]},
                {"$set": {"invited_vendors.$.viewed_at": now_iso()}},
            )
    return rfqs


@portal_router.get("/rfqs/{rid}")
async def portal_get_rfq(rid: str, vendor=Depends(_vendor_auth)):
    db = get_db()
    rfq = await db.rfqs.find_one(
        {"id": rid, "company_id": vendor["company_id"],
         "invited_vendors.vendor_id": vendor["id"]},
        {"_id": 0, "items.target_unit_price": 0},
    )
    if not rfq:
        raise HTTPException(404, "RFQ not found or you were not invited")
    # Show only MY quote
    my_quote = await db.quotes.find_one(
        {"rfq_id": rid, "vendor_id": vendor["id"]}, {"_id": 0},
    )
    rfq["my_quote"] = my_quote
    return rfq


@portal_router.post("/quotes")
async def portal_submit_quote(body: QuoteCreate, vendor=Depends(_vendor_auth)):
    db = get_db()
    rfq = await db.rfqs.find_one(
        {"id": body.rfq_id, "company_id": vendor["company_id"],
         "invited_vendors.vendor_id": vendor["id"]},
        {"_id": 0},
    )
    if not rfq:
        raise HTTPException(404, "RFQ not found or not invited")
    if rfq["status"] != "open":
        raise HTTPException(400, f"RFQ is {rfq['status']}, not accepting quotes")
    now = datetime.now(timezone.utc).isoformat()
    if rfq.get("deadline") and rfq["deadline"] < now:
        raise HTTPException(400, "RFQ deadline has passed")
    # Upsert — one quote per (rfq, vendor)
    existing = await db.quotes.find_one(
        {"rfq_id": body.rfq_id, "vendor_id": vendor["id"]}, {"_id": 0, "id": 1, "status": 1},
    )
    lines = [ln.model_dump() if hasattr(ln, "model_dump") else dict(ln) for ln in body.lines]
    if existing:
        if existing.get("status") in ("awarded", "lost"):
            raise HTTPException(400, "Cannot revise after award")
        await db.quotes.update_one(
            {"id": existing["id"]},
            {"$set": {
                "total_amount": body.total_amount, "currency": body.currency,
                "delivery_days": body.delivery_days, "validity_days": body.validity_days,
                "payment_terms": body.payment_terms, "lines": lines,
                "attachments": body.attachments, "notes": body.notes,
                "status": "revised", "submitted_at": now_iso(), "updated_at": now_iso(),
            }},
        )
        return await db.quotes.find_one({"id": existing["id"]}, {"_id": 0})
    q = Quote(
        company_id=vendor["company_id"], rfq_id=body.rfq_id, rfq_code=rfq["code"],
        vendor_id=vendor["id"], vendor_name=vendor["name"],
        total_amount=body.total_amount, currency=body.currency,
        delivery_days=body.delivery_days, validity_days=body.validity_days,
        payment_terms=body.payment_terms, lines=lines,
        attachments=body.attachments, notes=body.notes,
        status="submitted", sealed=True, submitted_at=now_iso(),
    ).model_dump()
    await db.quotes.insert_one(q)
    # Link to invite
    await db.rfqs.update_one(
        {"id": body.rfq_id, "invited_vendors.vendor_id": vendor["id"]},
        {"$set": {"invited_vendors.$.quote_id": q["id"], "updated_at": now_iso()}},
    )
    q.pop("_id", None)
    return q


@portal_router.post("/quotes/{qid}/withdraw")
async def portal_withdraw_quote(qid: str, vendor=Depends(_vendor_auth)):
    db = get_db()
    r = await db.quotes.update_one(
        {"id": qid, "vendor_id": vendor["id"], "status": {"$in": ["submitted", "revised"]}},
        {"$set": {"status": "withdrawn", "updated_at": now_iso()}},
    )
    if r.matched_count == 0:
        raise HTTPException(400, "Cannot withdraw — quote not found or already decided")
    return {"ok": True}


@portal_router.get("/purchase-orders")
async def portal_list_pos(vendor=Depends(_vendor_auth)):
    db = get_db()
    rows = await db.purchase_orders.find(
        {"vendor_id": vendor["id"], "company_id": vendor["company_id"],
         "status": {"$in": ["sent", "acknowledged", "in_transit", "partially_received",
                             "received", "invoiced", "paid", "closed"]}},
        {"_id": 0, "receipts": 0, "invoice_base64": 0},
    ).sort("created_at", -1).to_list(200)
    return rows


@portal_router.post("/purchase-orders/{pid}/acknowledge")
async def portal_ack_po(pid: str, vendor=Depends(_vendor_auth)):
    db = get_db()
    r = await db.purchase_orders.update_one(
        {"id": pid, "vendor_id": vendor["id"], "status": "sent"},
        {"$set": {"status": "acknowledged", "acknowledged_at": now_iso(),
                  "updated_at": now_iso()}},
    )
    if r.matched_count == 0:
        raise HTTPException(400, "PO not found, not yours, or not in sent status")
    return await db.purchase_orders.find_one(
        {"id": pid}, {"_id": 0, "receipts": 0, "invoice_base64": 0},
    )
