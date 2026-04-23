"""Module entitlements + bundles + pricing overrides. Super admin + reseller + company admin views."""
from fastapi import APIRouter, Depends, HTTPException
from auth import require_roles, get_current_user
from db import get_db
from models import now_iso, uid
from modules_catalog import MODULES, BUNDLES, module_exists, get_module, get_bundle
from tenant import _company_has_module

router = APIRouter(prefix="/api/modules", tags=["modules"])


# ---------- Public catalog ----------
@router.get("/catalog")
async def catalog(user=Depends(get_current_user)):
    """Return all available modules + bundles. Prices are role-gated."""
    show_retail = user["role"] in ("super_admin",)
    show_wholesale = user["role"] in ("super_admin", "reseller")

    modules_out = []
    for m in MODULES.values():
        row = {
            "id": m["id"], "name": m["name"], "category": m["category"],
            "description": m["description"], "trial_days": m.get("trial_days", 0),
            "included_by_default": m.get("included_by_default", False),
            "provides": m["provides"], "depends_on": m["depends_on"],
        }
        if show_retail:
            row["retail_price"] = m["retail_price"]
        if show_wholesale:
            row["wholesale_price"] = m["wholesale_price"]
        modules_out.append(row)

    bundles_out = []
    for b in BUNDLES.values():
        row = {
            "id": b["id"], "name": b["name"], "description": b["description"],
            "modules": b["modules"],
        }
        if show_retail:
            row["retail_price"] = b["retail_price"]
        if show_wholesale:
            row["wholesale_price"] = b["wholesale_price"]
        bundles_out.append(row)

    return {"modules": modules_out, "bundles": bundles_out}


# ---------- Company's active modules ----------
@router.get("/company/{company_id}")
async def company_modules(company_id: str, user=Depends(get_current_user)):
    db = get_db()
    # Access control
    if user["role"] == "super_admin":
        pass
    elif user["role"] == "reseller":
        c = await db.companies.find_one({"id": company_id}, {"_id": 0})
        if not c or c.get("reseller_id") != user.get("reseller_id"):
            raise HTTPException(403, "Forbidden")
    elif user.get("company_id") != company_id:
        raise HTTPException(403, "Forbidden")

    rows = await db.company_modules.find({"company_id": company_id}, {"_id": 0}).to_list(200)
    # ensure base_hrms always shown as active
    has_base = any(r["module_id"] == "base_hrms" for r in rows)
    if not has_base:
        rows.insert(0, {
            "module_id": "base_hrms", "company_id": company_id,
            "status": "active", "activated_at": now_iso(), "trial_until": None,
            "effective_amount": MODULES["base_hrms"]["retail_price"], "effective_currency": "INR",
            "price_source": "included",
        })
    return rows


@router.get("/mine")
async def my_modules(user=Depends(get_current_user)):
    """Current user's company active modules — used by frontend Gate."""
    db = get_db()
    cid = user.get("company_id")
    if not cid:
        # platform/reseller users have full visibility — return all modules as a helper
        return {"active_modules": list(MODULES.keys()), "role": user["role"]}
    rows = await db.company_modules.find(
        {"company_id": cid, "status": {"$in": ["active", "trial"]}}, {"_id": 0},
    ).to_list(200)
    active = [r["module_id"] for r in rows]
    if "base_hrms" not in active:
        active.append("base_hrms")
    return {"active_modules": active, "role": user["role"], "company_id": cid}


# ---------- Enable / disable ----------
@router.post("/company/{company_id}/enable")
async def enable_module(company_id: str, body: dict, user=Depends(get_current_user)):
    """Enable a module. body = { module_id, mode: 'active'|'trial', custom_amount?, currency? }"""
    db = get_db()
    module_id = body.get("module_id")
    mode = body.get("mode", "active")

    if not module_exists(module_id):
        raise HTTPException(400, "Unknown module")

    # Access: super_admin or reseller-owning-company only
    if user["role"] == "super_admin":
        pass
    elif user["role"] == "reseller":
        c = await db.companies.find_one({"id": company_id}, {"_id": 0})
        if not c or c.get("reseller_id") != user.get("reseller_id"):
            raise HTTPException(403, "Only the reseller who owns this company can enable modules")
    else:
        raise HTTPException(403, "Only platform or reseller can enable modules")

    mod = get_module(module_id)
    # resolve effective price
    if user["role"] == "super_admin" and body.get("custom_amount") is not None:
        eff_amount = float(body["custom_amount"])
        price_source = "override"
    elif user["role"] == "reseller":
        # reseller pays wholesale — allow them to set end-customer price via custom_amount
        eff_amount = float(body.get("custom_amount", mod["retail_price"]))
        price_source = "reseller_set"
    else:
        eff_amount = mod["retail_price"]
        price_source = "retail"

    currency = body.get("currency", "INR")
    now = now_iso()
    trial_until = None
    if mode == "trial":
        days = int(body.get("trial_days", mod.get("trial_days", 14)))
        from datetime import datetime, timezone, timedelta
        trial_until = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()

    existing = await db.company_modules.find_one({"company_id": company_id, "module_id": module_id})
    doc = {
        "company_id": company_id,
        "module_id": module_id,
        "status": mode,
        "activated_at": now,
        "activated_by": user["id"],
        "trial_until": trial_until,
        "effective_amount": eff_amount,
        "effective_currency": currency,
        "price_source": price_source,
        "updated_at": now,
    }
    if existing:
        await db.company_modules.update_one({"id": existing["id"]}, {"$set": doc})
        doc["id"] = existing["id"]
    else:
        doc["id"] = uid()
        doc["created_at"] = now
        await db.company_modules.insert_one(doc)

    await _audit(db, user, company_id, module_id, "enabled", {"mode": mode, "price": eff_amount, "currency": currency})
    doc.pop("_id", None)
    return doc


@router.post("/company/{company_id}/disable")
async def disable_module(company_id: str, body: dict, user=Depends(require_roles("super_admin"))):
    """Only super_admin can disable — resellers cannot (per locked policy)."""
    db = get_db()
    module_id = body.get("module_id")
    if module_id == "base_hrms":
        raise HTTPException(400, "base_hrms cannot be disabled — it's included")
    res = await db.company_modules.update_one(
        {"company_id": company_id, "module_id": module_id},
        {"$set": {"status": "disabled", "disabled_at": now_iso(), "disabled_by": user["id"], "updated_at": now_iso()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Module not enabled for this company")
    await _audit(db, user, company_id, module_id, "disabled", {})
    return {"ok": True}


@router.post("/company/{company_id}/activate_bundle")
async def activate_bundle(company_id: str, body: dict, user=Depends(get_current_user)):
    """Activate all modules in a bundle at bundle price. body = { bundle_id, mode?: 'trial'|'active' }"""
    db = get_db()
    bundle_id = body.get("bundle_id")
    b = get_bundle(bundle_id)
    if not b:
        raise HTTPException(404, "Unknown bundle")
    if user["role"] not in ("super_admin", "reseller"):
        raise HTTPException(403, "Forbidden")
    if user["role"] == "reseller":
        c = await db.companies.find_one({"id": company_id}, {"_id": 0})
        if not c or c.get("reseller_id") != user.get("reseller_id"):
            raise HTTPException(403, "Forbidden")

    mode = body.get("mode", "active")
    # distribute bundle price proportionally across modules
    total_retail = sum(MODULES[mid]["retail_price"] for mid in b["modules"])
    discount_ratio = b["retail_price"] / max(total_retail, 1)
    now = now_iso()
    trial_until = None
    if mode == "trial":
        from datetime import datetime, timezone, timedelta
        trial_until = (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()

    activated = []
    for mid in b["modules"]:
        mod = MODULES[mid]
        eff = round(mod["retail_price"] * discount_ratio, 2)
        doc = {
            "company_id": company_id, "module_id": mid, "status": mode,
            "activated_at": now, "activated_by": user["id"], "trial_until": trial_until,
            "effective_amount": eff, "effective_currency": "INR",
            "price_source": "bundle", "bundle_id": bundle_id,
            "updated_at": now,
        }
        existing = await db.company_modules.find_one({"company_id": company_id, "module_id": mid})
        if existing:
            await db.company_modules.update_one({"id": existing["id"]}, {"$set": doc})
        else:
            doc["id"] = uid()
            doc["created_at"] = now
            await db.company_modules.insert_one(doc)
        activated.append(mid)
    await _audit(db, user, company_id, None, "bundle_activated", {"bundle_id": bundle_id, "modules": activated})
    return {"bundle": bundle_id, "activated": activated}


# ---------- Request activation (company admin side) ----------
@router.post("/company/{company_id}/request_activation")
async def request_activation(company_id: str, body: dict, user=Depends(get_current_user)):
    """Company admin requests a module — routed to reseller / platform. No prices visible."""
    db = get_db()
    if user.get("company_id") != company_id:
        raise HTTPException(403, "Forbidden")
    module_id = body.get("module_id")
    if not module_exists(module_id):
        raise HTTPException(400, "Unknown module")
    doc = {
        "id": uid(), "company_id": company_id, "module_id": module_id,
        "requested_by": user["id"], "requested_by_name": user["name"],
        "message": body.get("message", ""), "status": "pending",
        "created_at": now_iso(),
    }
    await db.module_activation_requests.insert_one(doc)
    await _audit(db, user, company_id, module_id, "activation_requested", {})
    doc.pop("_id", None)
    return doc


@router.get("/activation_requests")
async def list_activation_requests(user=Depends(get_current_user)):
    db = get_db()
    if user["role"] == "super_admin":
        flt = {}
    elif user["role"] == "reseller":
        companies = await db.companies.find(
            {"reseller_id": user.get("reseller_id")}, {"_id": 0, "id": 1},
        ).to_list(1000)
        flt = {"company_id": {"$in": [c["id"] for c in companies]}}
    else:
        flt = {"company_id": user.get("company_id")}
    rows = await db.module_activation_requests.find(flt, {"_id": 0}).sort("created_at", -1).to_list(500)
    return rows


# ---------- Audit log ----------
async def _audit(db, user, company_id, module_id, action, meta):
    await db.module_events.insert_one({
        "id": uid(), "company_id": company_id, "module_id": module_id,
        "action": action, "actor_user_id": user["id"], "actor_role": user["role"],
        "actor_name": user.get("name"), "meta": meta, "at": now_iso(),
    })


@router.get("/audit/{company_id}")
async def module_audit(company_id: str, user=Depends(get_current_user)):
    db = get_db()
    if user["role"] not in ("super_admin", "reseller") and user.get("company_id") != company_id:
        raise HTTPException(403, "Forbidden")
    rows = await db.module_events.find({"company_id": company_id}, {"_id": 0}).sort("at", -1).to_list(500)
    return rows
