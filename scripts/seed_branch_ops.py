"""Seed branch operations demo data:
  • Sample utility bills, rent agreements, fire safety certs per branch
  • Recurring expense templates (electricity, internet, tea/coffee, housekeeping, water)

Idempotent. Run: python /app/scripts/seed_branch_ops.py
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[1] / "backend" / ".env")

from motor.motor_asyncio import AsyncIOMotorClient

DOC_PRESETS = [
    # (doc_type, title_template, vendor, amount, expiry_offset_days, period_offset_days)
    ("utility_bill",     "BESCOM Electricity — Mar 2026",   "BESCOM",                 28500, None,  -30),
    ("utility_bill",     "Airtel Internet — Mar 2026",      "Airtel Business",         8999, None,  -30),
    ("utility_bill",     "BWSSB Water — Q1 2026",           "BWSSB",                   4200, None,  -45),
    ("rent_agreement",   "Office Lease Deed — 2024-26",     "Prestige Estates",      None,    180,  None),
    ("property_tax",     "BBMP Property Tax — FY 2025-26",  "BBMP",                  62000,   None,  None),
    ("fire_safety",      "Fire Safety NOC",                 "Karnataka Fire Dept",   None,     45,   None),
    ("business_license", "Trade License",                   "BBMP",                  None,    300,   None),
    ("amc_contract",     "AC AMC Contract — Annual",        "Cool Tech Services",    36000,    90,   None),
    ("insurance",        "Office Asset Insurance",          "ICICI Lombard",         18500,   240,   None),
]

REC_PRESETS = [
    # (name, category, amount, mode, day_of_month, vendor)
    ("BESCOM Electricity",          "electricity",       28000, "AUTO_SUBMIT", 5,  "BESCOM"),
    ("Airtel Business Internet",    "internet",           8999, "AUTO_SUBMIT", 7,  "Airtel"),
    ("BWSSB Water",                 "water",              1400, "AUTO_DRAFT",  10, "BWSSB"),
    ("Tea / Coffee Supplies",       "tea_coffee",         5500, "AUTO_DRAFT",  3,  "Sleepy Owl"),
    ("Housekeeping Charges",        "housekeeping",      18000, "AUTO_DRAFT",  1,  "BVG India"),
    ("Drinking Water Cans",         "drinking_water",     3200, "MANUAL_ONE_CLICK", 1, "Bisleri"),
    ("Bharti Airtel — SIM Cards",   "sim_cards",          7500, "AUTO_DRAFT",  5,  "Airtel"),
    ("Office Stationery — Bulk",    "office_supplies",    9500, "AUTO_DRAFT",  15, "Office Depot"),
]


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    comp = await db.companies.find_one({"name": {"$regex": "acme", "$options": "i"}}, {"_id": 0}) \
        or await db.companies.find_one({}, {"_id": 0})
    if not comp:
        print("No company. Aborting.")
        return
    cid = comp["id"]

    branches = await db.branches.find({"company_id": cid}, {"_id": 0}).to_list(50)
    if not branches:
        print("No branches. Create branches first.")
        return

    today = datetime.now(timezone.utc).date()
    now_iso = datetime.now(timezone.utc).isoformat()
    user = await db.users.find_one({"company_id": cid, "role": "company_admin"}, {"_id": 0})
    uid_, uname = (user or {}).get("id", "system"), (user or {}).get("name", "Branch Manager")

    docs_added, recs_added, docs_skipped, recs_skipped = 0, 0, 0, 0

    # Pick first 3 branches max for demo (keeps it focused)
    for branch in branches[:3]:
        bid = branch["id"]
        # Documents
        for dtype, title, vendor, amount, exp_off, per_off in DOC_PRESETS:
            existing = await db.branch_documents.find_one({"branch_id": bid, "title": title})
            if existing:
                docs_skipped += 1
                continue
            doc = {
                "id": str(uuid.uuid4()),
                "company_id": cid, "branch_id": bid,
                "doc_type": dtype, "title": title,
                "vendor_name": vendor, "amount": amount, "currency": "INR",
                "description": None,
                "period_start": (today + timedelta(days=per_off)).isoformat() if per_off else None,
                "period_end": (today + timedelta(days=(per_off or 0) + 30)).isoformat() if per_off else None,
                "expiry_date": (today + timedelta(days=exp_off)).isoformat() if exp_off else None,
                "file_name": None, "content_type": None, "base64_data": None,
                "status": "active",
                "uploaded_by": uid_, "uploaded_by_name": uname,
                "created_at": now_iso, "updated_at": now_iso,
            }
            await db.branch_documents.insert_one(doc)
            docs_added += 1

        # Recurring expense templates
        for name, cat, amt, mode, dom, vendor in REC_PRESETS:
            existing = await db.recurring_expense_templates.find_one({"branch_id": bid, "name": name})
            if existing:
                recs_skipped += 1
                continue
            # Compute next_run_at: 1st future occurrence of `dom`
            year, month = today.year, today.month
            if today.day >= dom:
                if month == 12: year += 1; month = 1
                else: month += 1
            next_run = datetime(year, month, min(dom, 28), 0, 5, tzinfo=timezone.utc).isoformat()
            tpl = {
                "id": str(uuid.uuid4()),
                "company_id": cid, "branch_id": bid,
                "name": name, "category": cat,
                "description": None,
                "amount": amt, "currency": "INR",
                "mode": mode, "day_of_month": dom,
                "vendor_name": vendor,
                "active": True,
                "last_run_at": None, "last_run_period": None,
                "next_run_at": next_run,
                "created_by": uid_, "created_by_name": uname,
                "created_at": now_iso, "updated_at": now_iso,
            }
            await db.recurring_expense_templates.insert_one(tpl)
            recs_added += 1

    print(f"Documents:   added {docs_added}, skipped {docs_skipped}")
    print(f"Recurring:   added {recs_added}, skipped {recs_skipped}")
    print(f"Across {min(3, len(branches))} branches.")


if __name__ == "__main__":
    asyncio.run(main())
