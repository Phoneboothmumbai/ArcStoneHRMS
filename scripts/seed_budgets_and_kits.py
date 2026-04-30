"""Seed Budget envelopes + Joining Kit templates for demo."""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[1] / "backend" / ".env")

from motor.motor_asyncio import AsyncIOMotorClient


BUDGET_PRESETS = [
    # (name, dept_match, cost_center, category, amount, period)
    ("Branch — Operating Expenses",     None, None, None,                700000, "yearly"),
    ("Travel — All Departments",        None, None, "travel",             400000, "yearly"),
    ("Office Supplies — Stationery",    None, None, "stationery_general", 120000, "yearly"),
    ("IT Hardware — All",               None, "IT", "it_hardware",        500000, "yearly"),
    ("Joining Kit Spend",               None, "HR", "joining_kit",         80000, "yearly"),
]

KIT_TEMPLATES = [
    {
        "name": "Standard Joining Kit",
        "description": "Default kit issued to all new joiners.",
        "is_default": True,
        "items": [
            {"sku": "BAG-001", "name": "Branded laptop bag", "quantity": 1, "is_returnable": False, "is_required": True},
            {"sku": "ID-001", "name": "Photo ID card + lanyard", "quantity": 1, "is_returnable": True, "is_required": True},
            {"sku": "DIARY-001", "name": "Welcome diary", "quantity": 1, "is_returnable": False, "is_required": True},
            {"sku": "PEN-001", "name": "Branded pen", "quantity": 2, "is_returnable": False, "is_required": True},
            {"sku": "BOTTLE-001", "name": "Steel water bottle", "quantity": 1, "is_returnable": False, "is_required": True},
            {"sku": "TSHIRT-001", "name": "T-shirt (size on file)", "quantity": 2, "is_returnable": False, "is_required": False},
        ],
    },
    {
        "name": "Engineering Onboarding Kit",
        "description": "Engineering joiners — laptop + accessories included.",
        "is_default": False,
        "items": [
            {"sku": "LAPTOP-001", "name": "MacBook Pro 14-inch", "quantity": 1, "is_returnable": True, "is_required": True},
            {"sku": "DOCK-001", "name": "USB-C docking station", "quantity": 1, "is_returnable": True, "is_required": True},
            {"sku": "MOUSE-001", "name": "Wireless mouse", "quantity": 1, "is_returnable": True, "is_required": True},
            {"sku": "HEADSET-001", "name": "Noise-cancelling headset", "quantity": 1, "is_returnable": True, "is_required": True},
            {"sku": "BAG-001", "name": "Branded laptop bag", "quantity": 1, "is_returnable": False, "is_required": True},
            {"sku": "ID-001", "name": "Photo ID card + lanyard", "quantity": 1, "is_returnable": True, "is_required": True},
        ],
    },
]


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    comp = await db.companies.find_one({"name": {"$regex": "acme", "$options": "i"}}, {"_id": 0}) \
        or await db.companies.find_one({}, {"_id": 0})
    cid = comp["id"]
    branches = await db.branches.find({"company_id": cid}, {"_id": 0}).to_list(50)
    if not branches:
        print("No branches; aborting.")
        return
    user = await db.users.find_one({"company_id": cid, "role": "company_admin"}, {"_id": 0}) or {}
    uid_, uname = user.get("id", "system"), user.get("name", "Admin")
    now_iso = datetime.now(timezone.utc).isoformat()

    fy = "FY2027"

    # Budgets — assign to first 2 branches
    budgets_added = 0
    for branch in branches[:2]:
        for name, dept, cc, cat, amt, period in BUDGET_PRESETS:
            existing = await db.budget_envelopes.find_one({
                "company_id": cid, "branch_id": branch["id"],
                "fiscal_year": fy, "name": name,
            })
            if existing:
                continue
            doc = {
                "id": str(uuid.uuid4()),
                "company_id": cid, "name": name,
                "description": None,
                "branch_id": branch["id"],
                "department_id": None, "cost_center": cc,
                "category": cat,
                "fiscal_year": fy, "period": period, "period_label": fy,
                "amount": amt, "currency": "INR",
                "soft_warn_pct": 80.0, "hard_block_pct": 100.0,
                "allow_override": True,
                "status": "active",
                "created_by": uid_, "created_by_name": uname,
                "created_at": now_iso, "updated_at": now_iso,
            }
            await db.budget_envelopes.insert_one(doc)
            budgets_added += 1

    # Joining-kit templates (company-wide)
    kits_added = 0
    for tpl in KIT_TEMPLATES:
        existing = await db.kit_templates.find_one({"company_id": cid, "name": tpl["name"]})
        if existing:
            continue
        doc = {
            "id": str(uuid.uuid4()),
            "company_id": cid,
            "name": tpl["name"], "description": tpl["description"],
            "department_id": None, "branch_id": None, "employment_class": None,
            "items": tpl["items"],
            "is_default": tpl["is_default"], "active": True,
            "created_by": uid_, "created_by_name": uname,
            "created_at": now_iso, "updated_at": now_iso,
        }
        await db.kit_templates.insert_one(doc)
        kits_added += 1

    print(f"Budgets: added {budgets_added}")
    print(f"Kit templates: added {kits_added}")


if __name__ == "__main__":
    asyncio.run(main())
