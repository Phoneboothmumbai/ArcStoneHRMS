"""Seed demo data for sales demos / pilot kickoff.

Idempotent — running it multiple times is safe; collections that already have
> threshold rows are skipped. Designed to run directly on the prod box:

    cd /opt/arcstone/backend
    python scripts/seed_demo_extras.py

Fills the thin collections (vendors, RFQs, POs, expenses, helpdesk,
loans, visitors, resource bookings, assets, policies, comp-offs,
notifications, KB role-targeted articles).

After running, the 5 demo accounts (super_admin, reseller, HR admin,
manager, employee) should all have something interesting to show.
"""
from __future__ import annotations
import asyncio
import os
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Make the backend modules importable
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
import uuid  # noqa: E402

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "hrms_saas")


def uid() -> str:
    return str(uuid.uuid4())


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ago_iso(days=0, hours=0, minutes=0) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days, hours=hours, minutes=minutes)).isoformat()


def in_iso(days=0) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


# Pretty messaging
def banner(s):
    print(f"\n\033[1;36m▶ {s}\033[0m")


def ok(s):
    print(f"  \033[32m✓\033[0m {s}")


def skip(s):
    print(f"  \033[90m·\033[0m {s} (already seeded)")


async def seed():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    company = await db.companies.find_one({}, {"_id": 0})
    if not company:
        print("No company in DB — run base seeder first.")
        return
    cid = company["id"]
    branches = await db.branches.find({"company_id": cid}, {"_id": 0}).to_list(20)
    employees = await db.employees.find({"company_id": cid, "status": "active"}, {"_id": 0}).to_list(200)
    if not employees:
        print("No employees — run base seeder first.")
        return

    hr = next((e for e in employees if e.get("email") == "hr@acme.io"), employees[0])
    mgr = next((e for e in employees if e.get("email") == "manager@acme.io"), employees[1])
    emp = next((e for e in employees if e.get("email") == "employee@acme.io"), employees[2])
    bid = branches[0]["id"] if branches else None
    print(f"Seeding into company {company['name']} ({cid}) with {len(employees)} employees")

    # ===================================================================
    # 1. VENDORS — 8 vendors across categories
    # ===================================================================
    banner("Vendors")
    if await db.vendors.count_documents({"company_id": cid}) >= 5:
        skip("vendors")
    else:
        vendors = [
            {"name": "ABC Corporation", "type": "IT Hardware",
             "contact": "amit@abccorp.in", "phone": "+91 98100 11122",
             "gst_number": "29AAACA1234B1Z5", "pan": "AAACA1234B",
             "address": "Plot 42, Whitefield, Bengaluru 560066",
             "rating": 4.6, "tags": ["laptops", "monitors", "peripherals"]},
            {"name": "Stellar Print Solutions", "type": "Printing & Stationery",
             "contact": "sales@stellarprint.in", "phone": "+91 99002 33445",
             "gst_number": "29AAFCS9876J1ZK", "pan": "AAFCS9876J",
             "address": "12 Brigade Road, Bengaluru 560001",
             "rating": 4.2, "tags": ["printing", "stationery", "marketing"]},
            {"name": "Skyline Travel", "type": "Travel & Hospitality",
             "contact": "corp@skyline.travel", "phone": "+91 96543 78901",
             "gst_number": "27AAACS5544K1ZP", "pan": "AAACS5544K",
             "address": "BKC, Mumbai 400051",
             "rating": 4.7, "tags": ["flights", "hotels", "cabs"]},
            {"name": "GreenLeaf Office Supplies", "type": "Office Supplies",
             "contact": "orders@greenleaf.co.in", "phone": "+91 88820 11223",
             "gst_number": "29AAFCG7799K1Z2", "pan": "AAFCG7799K",
             "address": "HSR Layout, Bengaluru 560102",
             "rating": 3.9, "tags": ["furniture", "consumables"]},
            {"name": "PixelCraft Studios", "type": "Marketing & Design",
             "contact": "hello@pixelcraft.studio", "phone": "+91 75554 88123",
             "gst_number": "29AAACP6655L1ZX", "pan": "AAACP6655L",
             "address": "Indiranagar, Bengaluru 560038",
             "rating": 4.8, "tags": ["branding", "digital", "video"]},
            {"name": "QuickServe Catering", "type": "Catering",
             "contact": "books@quickserve.in", "phone": "+91 90000 12345",
             "gst_number": "29AAGCQ4321P1ZA", "pan": "AAGCQ4321P",
             "address": "Koramangala, Bengaluru 560034",
             "rating": 4.3, "tags": ["meals", "events"]},
            {"name": "SafeGuard Security Services", "type": "Facility & Security",
             "contact": "ops@safeguard.in", "phone": "+91 98800 99001",
             "gst_number": "29AAACS3322N1ZY", "pan": "AAACS3322N",
             "address": "Electronic City, Bengaluru 560100",
             "rating": 4.1, "tags": ["security", "housekeeping"]},
            {"name": "BrightLine Cloud Services", "type": "SaaS / Cloud",
             "contact": "billing@brightline.cloud", "phone": "+91 70123 45678",
             "gst_number": "29AAGCB1212J1ZQ", "pan": "AAGCB1212J",
             "address": "Powai, Mumbai 400076",
             "rating": 4.5, "tags": ["cloud", "tools", "saas"]},
        ]
        for v in vendors:
            doc = {"id": uid(), "company_id": cid, "status": "active",
                   "created_at": now_iso(), "updated_at": now_iso(), **v}
            await db.vendors.insert_one(doc)
        ok(f"Inserted {len(vendors)} vendors")

    # Pull a few back for reference
    vendor_rows = await db.vendors.find({"company_id": cid}, {"_id": 0}).to_list(50)

    # ===================================================================
    # 2. RFQs + Quotes + PO
    # ===================================================================
    banner("RFQs · Quotes · POs")
    if await db.rfqs.count_documents({"company_id": cid}) >= 3:
        skip("rfqs")
    else:
        for spec in [
            {"title": "30 laptops for Q1 onboarding", "category": "IT Hardware",
             "items": [{"name": "Lenovo ThinkPad X1 Carbon Gen 12", "qty": 25, "uom": "ea"},
                       {"name": "Dell XPS 13 (i7/16GB)",            "qty": 5,  "uom": "ea"}],
             "winning": "ABC Corporation"},
            {"title": "Office stationery — annual contract", "category": "Office Supplies",
             "items": [{"name": "A4 Paper (80gsm)", "qty": 200, "uom": "ream"},
                       {"name": "Black ballpoint pens", "qty": 500, "uom": "ea"},
                       {"name": "Whiteboard markers", "qty": 100, "uom": "ea"}],
             "winning": "GreenLeaf Office Supplies"},
            {"title": "Annual cab corporate tie-up — Bengaluru", "category": "Travel & Hospitality",
             "items": [{"name": "Sedan rentals (8hr/80km)", "qty": 60, "uom": "trip"},
                       {"name": "Airport transfers", "qty": 40, "uom": "trip"}],
             "winning": "Skyline Travel"},
        ]:
            rfq_id = uid()
            invited = random.sample(
                [v for v in vendor_rows if v.get("type") == spec["category"]],
                min(3, sum(1 for v in vendor_rows if v.get("type") == spec["category"])))
            if not invited:
                invited = vendor_rows[:3]
            await db.rfqs.insert_one({
                "id": rfq_id, "company_id": cid, "title": spec["title"],
                "category": spec["category"], "items": spec["items"],
                "invited_vendors": [v["id"] for v in invited],
                "deadline": in_iso(7), "status": "awarded",
                "created_by": hr["id"], "created_at": ago_iso(days=10),
                "updated_at": now_iso(),
            })
            # Create 1 quote per invited vendor
            base_total = sum(it["qty"] for it in spec["items"]) * 1500
            winner_id = next(
                (v["id"] for v in invited if v.get("name") == spec["winning"]),
                invited[0]["id"],
            )
            for i, vend in enumerate(invited):
                q = base_total + random.randint(-base_total // 10, base_total // 10)
                await db.quotes.insert_one({
                    "id": uid(), "company_id": cid, "rfq_id": rfq_id,
                    "vendor_id": vend["id"], "vendor_name": vend["name"],
                    "total_amount": q, "currency": "INR",
                    "delivery_days": random.choice([7, 10, 14, 21]),
                    "payment_terms": random.choice(["Net 30", "Net 45", "50% advance"]),
                    "status": "winning" if vend["id"] == winner_id else "submitted",
                    "submitted_at": ago_iso(days=5), "created_at": ago_iso(days=5),
                })
            # Create the awarded PO
            await db.purchase_orders.insert_one({
                "id": uid(), "po_number": f"PO/{datetime.now().year}/{random.randint(1000, 9999)}",
                "company_id": cid, "rfq_id": rfq_id, "vendor_id": winner_id,
                "vendor_name": spec["winning"], "items": spec["items"],
                "total_amount": base_total, "currency": "INR",
                "status": "delivered", "delivery_date": ago_iso(days=2),
                "approved_by": hr["id"], "created_at": ago_iso(days=4),
                "updated_at": now_iso(),
            })
        ok("Inserted 3 RFQs + 9 quotes + 3 POs (1 awarded chain each)")

    # ===================================================================
    # 3. EXPENSES — 15 claims across categories + statuses
    # ===================================================================
    banner("Expense claims")
    if await db.expense_claims.count_documents({"company_id": cid}) >= 8:
        skip("expense_claims")
    else:
        seeded_emps = [emp, mgr] + random.sample(
            [e for e in employees if e["id"] not in (hr["id"], emp["id"], mgr["id"])], 6)
        rows = [
            ("Client lunch · Bangalore HQ", "meals", 1850, "approved",   2),
            ("Cab to Whitefield client",    "travel_taxi", 450,  "approved", 5),
            ("Hotel · Pune offsite",        "travel_hotel", 8200, "submitted", 1),
            ("Flight · BLR→DEL · Q1 review","travel_flight", 9450, "approved", 12),
            ("Team dinner · Stellar Print pitch","meals", 1450, "approved", 8),
            ("Internet bill — Mar 2026",    "phone_internet", 1499, "approved", 3),
            ("Whiteboard markers",          "office_supplies", 480, "approved", 18),
            ("Per diem · 3 days Mumbai",    "travel_per_diem", 4500, "approved", 11),
            ("Datadog renewal · Pro tier",  "subscription", 14500, "approved", 25),
            ("AWS Re:Invent training",      "training", 35000, "submitted", 0),
            ("Petrol — client visits",      "fuel", 2700, "rejected", 9),
            ("Gym subscription — Apr",      "subscription", 1800, "rejected", 14),
            ("Coffee with vendor lead",     "client_meeting", 980, "approved", 6),
            ("Cab · airport pickup VIP",    "travel_taxi", 2200, "approved", 4),
            ("Lunch · ABC Corp meet",       "meals", 1200, "submitted", 0),
        ]
        for i, (title, cat, amt, status, days_ago) in enumerate(rows):
            user_emp = seeded_emps[i % len(seeded_emps)]
            await db.expense_claims.insert_one({
                "id": uid(), "company_id": cid, "employee_id": user_emp["id"],
                "employee_name": user_emp["name"], "title": title, "purpose": title,
                "currency": "INR", "status": status,
                "items": [{"category": cat, "expense_date": ago_iso(days=days_ago)[:10],
                           "amount": amt, "receipts": []}],
                "total_amount": amt,
                "submitted_at": ago_iso(days=days_ago) if status != "draft" else None,
                "approved_at": ago_iso(days=max(0, days_ago - 1)) if status == "approved" else None,
                "approved_by": hr["id"] if status == "approved" else None,
                "rejected_at": ago_iso(days=max(0, days_ago - 1)) if status == "rejected" else None,
                "rejected_by": hr["id"] if status == "rejected" else None,
                "rejection_reason": "Per policy — non-business expense" if status == "rejected" else None,
                "created_at": ago_iso(days=days_ago + 1), "updated_at": now_iso(),
            })
        ok(f"Inserted {len(rows)} expense claims")

    # ===================================================================
    # 4. LOAN REQUESTS + ACTIVE LOANS
    # ===================================================================
    banner("Loans & loan requests")
    if await db.loan_requests.count_documents({"company_id": cid}) >= 3:
        skip("loan_requests")
    else:
        loan_specs = [
            {"emp": emp, "type": "personal",  "amt": 100000, "tenure": 12, "status": "approved", "purpose": "Home renovation in Hyderabad."},
            {"emp": mgr, "type": "salary_advance", "amt": 50000, "tenure": 5,  "status": "approved", "purpose": "Daughter's school admission."},
            {"emp": employees[3], "type": "medical", "amt": 80000, "tenure": 10, "status": "pending", "purpose": "Father's cardiac surgery."},
            {"emp": employees[5], "type": "personal", "amt": 60000, "tenure": 8, "status": "rejected", "purpose": "Bike upgrade.",
             "decision_note": "Outside loan policy — only medical and education are eligible."},
        ]
        for ls in loan_specs:
            req_id = uid()
            await db.loan_requests.insert_one({
                "id": req_id, "company_id": cid,
                "employee_id": ls["emp"]["id"], "employee_name": ls["emp"]["name"],
                "loan_type": ls["type"], "amount": ls["amt"],
                "tenure_months": ls["tenure"], "purpose": ls["purpose"],
                "status": ls["status"],
                "decision_note": ls.get("decision_note"),
                "decided_by": hr["id"] if ls["status"] != "pending" else None,
                "decided_at": ago_iso(days=2) if ls["status"] != "pending" else None,
                "created_at": ago_iso(days=4), "updated_at": now_iso(),
            })
            # Create active loan if approved
            if ls["status"] == "approved":
                emi = round(ls["amt"] / ls["tenure"], 2)
                await db.loans.insert_one({
                    "id": uid(), "company_id": cid,
                    "employee_id": ls["emp"]["id"], "employee_name": ls["emp"]["name"],
                    "loan_type": ls["type"], "principal": ls["amt"],
                    "tenure_months": ls["tenure"], "emi_monthly": emi,
                    "outstanding": ls["amt"] - emi,   # one EMI already paid
                    "interest_pct": 0, "start_month": ago_iso(days=30)[:7],
                    "status": "active", "request_id": req_id,
                    "created_at": ago_iso(days=2), "updated_at": now_iso(),
                })
        ok("Inserted 4 loan requests + 2 active loans (with EMI schedules)")

    # ===================================================================
    # 5. HELPDESK TICKETS
    # ===================================================================
    banner("Helpdesk tickets")
    if await db.helpdesk_tickets.count_documents({"company_id": cid}) >= 5:
        skip("helpdesk_tickets")
    else:
        tickets = [
            ("Laptop screen flickering", "IT", "open", "high", emp,
             "Screen has been flickering for 2 days. Tried restart, no luck."),
            ("Need access to Confluence", "IT", "in_progress", "medium", mgr,
             "New project — need read+write on the Engineering space."),
            ("PF UAN not reflecting", "HR", "open", "high", employees[3],
             "UAN number on payslip is incorrect. Could you verify?"),
            ("Visiting card request", "Admin", "resolved", "low", mgr,
             "Need 200 visiting cards for upcoming client visits."),
            ("Office Wi-Fi slow in afternoon", "IT", "in_progress", "medium", employees[4],
             "Speeds drop to <2 Mbps every day around 3 PM."),
            ("Reimbursement not credited", "Finance", "resolved", "high", emp,
             "March travel reimbursement still not in account. Approved on Apr 5."),
            ("Need new chair (back issue)", "Admin", "open", "medium", employees[6],
             "ENT advised an ergonomic chair. Can we order one?"),
            ("Date of birth correction in HRMS", "HR", "resolved", "low", employees[7],
             "Birth date showing as 1990-12-04 — should be 1992-12-04."),
        ]
        for title, cat, status, prio, user_emp, body in tickets:
            await db.helpdesk_tickets.insert_one({
                "id": uid(), "ticket_number": f"TKT-{random.randint(1000, 9999)}",
                "company_id": cid, "raised_by": user_emp["id"],
                "raised_by_name": user_emp["name"],
                "category": cat, "priority": prio, "status": status,
                "subject": title, "description": body,
                "assigned_to": hr["id"] if cat == "HR" else None,
                "resolved_at": ago_iso(days=1) if status == "resolved" else None,
                "created_at": ago_iso(days=random.randint(1, 8)),
                "updated_at": now_iso(),
            })
        ok(f"Inserted {len(tickets)} helpdesk tickets across IT/HR/Admin/Finance")

    # ===================================================================
    # 6. ASSETS
    # ===================================================================
    banner("Assets")
    if await db.assets.count_documents({"company_id": cid}) >= 8:
        skip("assets")
    else:
        asset_specs = [
            ("Lenovo ThinkPad X1 Carbon", "laptop", "TPX1-2024-0014", 145000, emp),
            ("Dell XPS 13 (i7/16GB)",    "laptop", "XPS13-2024-0021", 110000, mgr),
            ("Apple MacBook Pro 14 M3",  "laptop", "MBP14-2024-0007", 220000, employees[3]),
            ("Logitech MX Master 3S",    "peripheral", "MXM-0432", 9500, emp),
            ("Dell U2723QE 27\" 4K",     "monitor", "U2723-0089", 75000, mgr),
            ("Office iPhone 15 Pro",     "phone",  "IPH15P-0011", 135000, employees[2]),
            ("Bose QC Ultra Headphones", "peripheral", "BQC-0156", 35000, hr),
            ("HP LaserJet Pro M404dn",   "printer", "HPLJ-0003", 28000, None),
            ("Conference Room Projector", "av-equipment", "PRJ-0002", 95000, None),
        ]
        for name, kind, tag, value, assignee in asset_specs:
            await db.assets.insert_one({
                "id": uid(), "company_id": cid, "asset_tag": tag,
                "name": name, "category": kind,
                "purchase_price": value, "currency": "INR",
                "purchase_date": ago_iso(days=random.randint(60, 730))[:10],
                "vendor": "ABC Corporation",
                "assigned_to": assignee["id"] if assignee else None,
                "assigned_to_name": assignee["name"] if assignee else None,
                "assigned_on": ago_iso(days=random.randint(30, 365))[:10] if assignee else None,
                "status": "assigned" if assignee else "available",
                "branch_id": bid,
                "warranty_until": in_iso(days=365)[:10],
                "created_at": ago_iso(days=300), "updated_at": now_iso(),
            })
        ok(f"Inserted {len(asset_specs)} assets (7 assigned, 2 available)")

    # ===================================================================
    # 7. VISITORS
    # ===================================================================
    banner("Visitors (front-desk log)")
    if await db.visitors.count_documents({"company_id": cid}) >= 5:
        skip("visitors")
    else:
        visitors = [
            ("Rakesh Sharma", "Wipro Ltd", "amit@wipro.com", "Sales meeting", hr, "checked_out", 2),
            ("Lina Park",     "Dentsu", "lina@dentsu.jp", "Marketing collab discussion", mgr, "checked_in", 0),
            ("Anil Joshi",    "Self-employed", "anil@interview.io", "Senior SWE interview round", hr, "checked_out", 1),
            ("Nina Verma",    "ABC Corporation", "nina@abccorp.in", "PO delivery acknowledgement", hr, "checked_out", 5),
            ("Daniel O'Brien","Stripe", "daniel@stripe.com", "Stripe Connect demo", mgr, "scheduled", -1),
        ]
        for name, org, email, purpose, host, status, days_ago in visitors:
            await db.visitors.insert_one({
                "id": uid(), "company_id": cid,
                "visitor_name": name, "visitor_org": org, "visitor_email": email,
                "purpose": purpose, "host_employee_id": host["id"],
                "host_name": host["name"], "branch_id": bid,
                "status": status,
                "checked_in_at": ago_iso(days=days_ago) if status != "scheduled" else None,
                "checked_out_at": ago_iso(days=days_ago, hours=-2) if status == "checked_out" else None,
                "scheduled_for": in_iso(days=abs(days_ago)) if status == "scheduled" else None,
                "created_at": ago_iso(days=days_ago + 1),
                "updated_at": now_iso(),
            })
        ok(f"Inserted {len(visitors)} visitors (mix of checked-out, in, scheduled)")

    # ===================================================================
    # 8. RESOURCE BOOKINGS (meeting rooms, vehicles)
    # ===================================================================
    banner("Resources & bookings")
    if await db.resources.count_documents({"company_id": cid}) >= 4:
        skip("resources")
    else:
        resources = [
            ("Mainstage (12-seater)", "meeting_room", "Conference room with TV + whiteboard", 12),
            ("Workshop (6-seater)",  "meeting_room", "Smaller huddle room with monitor", 6),
            ("Phone booth A",        "meeting_room", "Single-occupancy private call space", 1),
            ("Pool car · KA-01-CH-1234", "vehicle",  "Maruti Ciaz, fuel allowance ₹500/day", 4),
        ]
        for name, kind, desc, cap in resources:
            await db.resources.insert_one({
                "id": uid(), "company_id": cid, "branch_id": bid,
                "name": name, "type": kind, "description": desc,
                "capacity": cap, "is_active": True,
                "created_at": ago_iso(days=120), "updated_at": now_iso(),
            })
        all_res = await db.resources.find({"company_id": cid}, {"_id": 0}).to_list(20)
        for r in all_res[:3]:
            await db.resource_bookings.insert_one({
                "id": uid(), "company_id": cid, "resource_id": r["id"],
                "resource_name": r["name"],
                "booked_by": mgr["id"], "booked_by_name": mgr["name"],
                "title": "Sprint review · Q2 planning",
                "start_at": in_iso(days=2), "end_at": in_iso(days=2),
                "status": "confirmed",
                "created_at": ago_iso(days=1), "updated_at": now_iso(),
            })
        ok(f"Inserted {len(resources)} resources + 3 bookings")

    # ===================================================================
    # 9. POLICIES (acknowledgement-tracked docs)
    # ===================================================================
    banner("Policies")
    if await db.policies.count_documents({"company_id": cid}) >= 3:
        skip("policies")
    else:
        policy_docs = [
            ("Code of Conduct",              "All employees must read and acknowledge by July 31st."),
            ("Information Security Policy",  "Covers password hygiene, device handling, and data classification."),
            ("Travel & Reimbursement Policy","Per-diem, hotel caps by city tier, advance request workflow."),
            ("Anti-Harassment & POSH Policy","India POSH Act compliance + IC committee details."),
            ("Remote Work Policy",           "WFH eligibility, equipment provisioning, attendance norms."),
        ]
        for title, summary in policy_docs:
            await db.policies.insert_one({
                "id": uid(), "company_id": cid, "title": title,
                "summary": summary, "version": "v2.1",
                "effective_from": ago_iso(days=90)[:10],
                "is_published": True,
                "requires_acknowledgement": True,
                "content": f"# {title}\n\n{summary}\n\n## Scope\nApplies to all full-time and contract employees.\n\n## Review cycle\nReviewed annually by the HR-Compliance committee.",
                "created_by": hr["id"], "created_at": ago_iso(days=90),
                "updated_at": now_iso(),
            })
        ok(f"Inserted {len(policy_docs)} policies")

    # ===================================================================
    # 10. COMP-OFF CREDITS
    # ===================================================================
    banner("Comp-off credits")
    if await db.comp_off_credits.count_documents({"company_id": cid}) >= 3:
        skip("comp_off_credits")
    else:
        co_specs = [
            (emp, "2026-04-04", 1.0, "Worked Saturday for prod deploy", "approved"),
            (mgr, "2026-04-11", 1.0, "Onsite client visit on weekend",   "approved"),
            (employees[4], "2026-04-18", 0.5, "Half-day sprint demo on Sunday", "pending"),
            (employees[6], "2026-03-22", 1.0, "Migrated DB cluster on Saturday", "approved"),
        ]
        for emp_co, work_date, days, reason, status in co_specs:
            doc = {
                "id": uid(), "company_id": cid,
                "employee_id": emp_co["id"], "work_date": work_date,
                "days": days, "reason": reason, "status": status,
                "expires_on": (datetime.fromisoformat(work_date) + timedelta(days=90)).isoformat()[:10],
                "created_by": emp_co["id"], "created_at": ago_iso(days=2),
                "updated_at": now_iso(),
            }
            if status == "approved":
                doc["approved_by"] = hr["id"]
                doc["approved_at"] = ago_iso(days=1)
            await db.comp_off_credits.insert_one(doc)
        ok(f"Inserted {len(co_specs)} comp-off credits (3 approved, 1 pending)")

    # ===================================================================
    # 11. NOTIFICATIONS — fresh in-app inbox for each demo account
    # ===================================================================
    banner("Notifications")
    if await db.notifications.count_documents({"company_id": cid}) >= 10:
        skip("notifications")
    else:
        notif_specs = [
            (emp,  "Loan approved", "Your ₹1,00,000 personal loan has been approved. EMI ₹8,333 starts next payroll.", "loan", False),
            (emp,  "Payslip · Mar 2026 ready", "Your March payslip is now available. Net pay: ₹52,840.", "payslip", False),
            (emp,  "New article · WFH Policy", "Your HR has published the Remote Work Policy. Please acknowledge.", "policy", True),
            (mgr,  "1 leave waiting your approval", "Aisha Khan has requested 3 days of casual leave (Apr 28 → Apr 30).", "approval", False),
            (mgr,  "5 expenses pending review", "5 team expense claims totalling ₹18,400 are waiting for your action.", "approval", False),
            (mgr,  "Comp-off credited", "Your 1-day comp-off for Apr 11 is now in your leave balance (expires Jul 10).", "leave", True),
            (hr,   "Payroll cycle · Apr 2026", "Apr payroll cycle starts Apr 28. Cut-off is 5 PM IST.", "payroll", False),
            (hr,   "12 employees joining this month", "Onboarding checklists generated for 12 new hires.", "onboarding", False),
            (hr,   "Form 16 generation ready", "FY 2025-26 Form 16 generation is unlocked. Run from Compliance → Form 16.", "compliance", True),
            (hr,   "PF challan · Apr generated", "Apr PF challan ₹1,84,200 generated. Due by May 15.", "compliance", False),
        ]
        for u, title, body, kind, is_read in notif_specs:
            await db.notifications.insert_one({
                "id": uid(), "company_id": cid, "user_id": u["id"],
                "employee_id": u["id"], "title": title, "body": body,
                "type": kind, "is_read": is_read,
                "created_at": ago_iso(hours=random.randint(2, 72)),
                "read_at": ago_iso(hours=1) if is_read else None,
            })
        ok(f"Inserted {len(notif_specs)} notifications across 3 demo accounts")

    # ===================================================================
    # 12. KB articles — role-targeted demo of the new visibility feature
    # ===================================================================
    banner("KB · role-targeted articles")
    role_articles = [
        {"slug": "manager-leave-approval-tips", "title": "How to approve / reject leave (Manager guide)",
         "category": "Approvals & Workflows",
         "visible_roles": ["branch_manager", "sub_manager", "assistant_manager"],
         "excerpt": "Step-by-step guide for managers on the leave approval workflow.",
         "tags": ["manager", "leave"]},
        {"slug": "employee-pf-uan-faq", "title": "PF / UAN — Frequently asked questions",
         "category": "India Statutory (PF, ESIC, PT)",
         "visible_roles": ["employee"],
         "excerpt": "Where to find your UAN, how to merge old accounts, and what to do at job change.",
         "tags": ["pf", "uan", "statutory"]},
        {"slug": "hr-form16-prep-checklist", "title": "Form 16 generation — readiness checklist",
         "category": "Admin & Modules",
         "visible_roles": [],   # all roles, but you can demo flipping to HR-only
         "excerpt": "Things to verify in payroll before opening the Form 16 tap.",
         "tags": ["form16", "year-end", "compliance"]},
    ]
    for a in role_articles:
        existing = await db.kb_articles.find_one({"company_id": cid, "slug": a["slug"]}) or \
                   await db.kb_articles.find_one({"slug": a["slug"]})
        if existing:
            skip(f"KB article: {a['title']}")
            continue
        await db.kb_articles.insert_one({
            "id": uid(), "slug": a["slug"], "title": a["title"],
            "category": a["category"], "visible_roles": a["visible_roles"],
            "excerpt": a["excerpt"], "tags": a["tags"],
            "content": f"# {a['title']}\n\n{a['excerpt']}\n\n## Section 1\n\nRelevant content here.\n\n## Section 2\n\nMore detail with **bold** and *italic*.\n\n- Bullet point 1\n- Bullet point 2",
            "is_published": True, "view_count": random.randint(10, 200),
            "author_name": "HR Team", "company_id": cid,
            "created_at": ago_iso(days=random.randint(5, 60)),
            "updated_at": now_iso(),
        })
        ok(f"Added KB article: {a['title']} (visible_to: {a['visible_roles'] or 'all roles'})")

    # ===================================================================
    # 13. EXPENSE POLICY — pre-load a demo override so policies UI shows data
    # ===================================================================
    banner("Expense policy overrides")
    if await db.expense_policies.count_documents({"company_id": cid}) >= 1:
        skip("expense_policies")
    else:
        await db.expense_policies.insert_one({
            "company_id": cid,
            "rules": [
                {"category": "meals",       "max_per_item": 2500, "receipt_required_above": 500},
                {"category": "travel_taxi", "max_per_item": 4000, "receipt_required_above": 500},
                {"category": "travel_hotel","max_per_item": 12000,"receipt_required_above": 1000},
                {"category": "training",    "max_per_item": 75000,"receipt_required_above": 1000},
            ],
            "updated_at": now_iso(), "updated_by": hr["id"],
        })
        ok("Inserted expense policy overrides for 4 categories")

    # ===================================================================
    # 14. AUDIT EVENTS — sprinkle a few interesting ones
    # ===================================================================
    banner("Audit events")
    if await db.audit_events.count_documents({"company_id": cid}) >= 30:
        skip("audit_events")
    else:
        for i in range(20):
            ev_pool = [
                ("employee.update",  "employee", emp["id"], {"field": "designation", "from": "Engineer", "to": "Senior Engineer"}),
                ("payroll.finalize", "payroll_run", uid(),  {"period": "2026-03", "total_net": 28_45_000}),
                ("loan.approve",     "loan",     uid(),     {"amount": 100000, "tenure": 12}),
                ("expense.approve",  "expense_claim", uid(),{"amount": 4500}),
                ("comp_off.approve", "comp_off_credit", uid(), {"days": 1.0}),
                ("module.enable",    "company_module", uid(), {"module": "procurement"}),
            ]
            ev, rt, rid, det = random.choice(ev_pool)
            await db.audit_events.insert_one({
                "id": uid(), "ts": ago_iso(hours=random.randint(1, 240)),
                "event": ev, "actor_id": hr["id"],
                "actor_email": "hr@acme.io", "actor_role": "company_admin",
                "company_id": cid, "resource_type": rt, "resource_id": rid,
                "detail": det, "ip": "10.0.0.42",
            })
        ok("Inserted 20 audit events spanning all major workflows")

    print("\n\033[1;32m✓ Demo seed complete\033[0m\n")


if __name__ == "__main__":
    asyncio.run(seed())
