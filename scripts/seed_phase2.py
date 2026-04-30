"""Phase-2 demo seeder: hierarchy + rich policies + performance + recruitment.

Idempotent. Run after seed_demo_extras.py:

    cd /opt/arcstone/backend
    python /opt/arcstone/scripts/seed_phase2.py

Touches:
  • Employees   — restructures manager_id chain into a clean 3-level org tree
  • Policies    — 5 fully-fleshed markdown policies (POSH, IT Sec, Travel, COC, Leave)
  • Performance — goals, review cycles, 9-box assessment
  • Recruitment — open requisitions, candidates in pipeline
  • Onboarding  — 1 active onboarding journey for new hire
"""
from __future__ import annotations
import asyncio
import os
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from motor.motor_asyncio import AsyncIOMotorClient   # noqa: E402

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "hrms_saas")


def uid(): return str(uuid.uuid4())
def now_iso(): return datetime.now(timezone.utc).isoformat()
def ago_iso(days=0): return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
def in_iso(days=0): return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


def banner(s): print(f"\n\033[1;36m▶ {s}\033[0m")
def ok(s): print(f"  \033[32m✓\033[0m {s}")
def skip(s): print(f"  \033[90m·\033[0m {s} (already seeded)")


# ---------------------------------------------------------------------------
# Policy content — proper, sales-ready markdown
# ---------------------------------------------------------------------------
POSH_BODY = """# Prevention of Sexual Harassment (POSH) Policy

## Purpose
ACME Global is committed to providing a safe, respectful, and inclusive workplace for every employee, contractor, and visitor. This policy is issued in compliance with **The Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013** ("POSH Act").

## Scope
This policy applies to:
- All full-time, part-time, and contract employees, regardless of gender
- Interns, trainees, vendors, and visitors at any ACME premises
- Remote / WFH employees during work hours and on virtual collaboration tools

## What constitutes sexual harassment
Any unwelcome, sexually-determined behaviour — physical, verbal, or non-verbal — including but not limited to:
- Suggestive remarks, jokes, or messages
- Display of sexually-explicit pictures, posters, or screensavers
- Demand or request for sexual favours, implicit or explicit
- Physical contact and advances
- Showing sexually-explicit content via any medium
- Cyber-harassment over email, chat, or social media

## How to report
1. **Confidential channel** — write to `posh@arcstone.co.in` (read only by the IC)
2. **Direct to IC chair** — email or in-person meeting with the chairperson
3. **Through your manager** — they are required to escalate within 24 hours

## Internal Committee (IC)
| Role | Name |
|---|---|
| Chairperson | (TBD — senior woman employee) |
| Members | 2 internal members + 1 external NGO representative |

## Process and timelines
- **Day 0–10**: Inquiry initiated upon written complaint
- **Day 10–90**: Investigation, evidence gathering, witness interviews
- **Day 90**: Final report and recommendations submitted to management
- **Day 90–60**: Management acts on recommendations within 60 days

## Protection from retaliation
Anyone — complainant, witness, or IC member — is shielded from retaliation. Retaliatory action is itself a punishable offense under this policy.

## Annual reporting
The IC will publish an anonymised annual report covering complaint volume, resolution time, and outcomes.

---
*Last updated: April 2026 · v2.1 · For questions: posh@arcstone.co.in*"""

IT_SECURITY_BODY = """# Information Security Policy

## Why this matters
A single compromised laptop can expose customer payslips, salary data, and tax records. This policy defines the minimum security controls every employee must follow.

## Acceptable use
- Use only company-issued or company-approved devices for work
- No personal cloud storage (Dropbox, Google Drive personal) for company data
- Lock your screen when stepping away — `Win+L` or `Cmd+Ctrl+Q`
- Report lost/stolen devices to IT within **2 hours** via `it@arcstone.co.in`

## Password & MFA
- Minimum 10 characters, with upper, lower, digit, and symbol
- A unique password per system — use a password manager (1Password / Bitwarden)
- 2FA mandatory on Email, HRMS Admin, GitHub, AWS, and Production servers
- Rotate every 180 days; never reuse the last 4 passwords
- Never share passwords — even with managers

## Data classification
| Tier | Examples | Handling |
|---|---|---|
| **Public** | Marketing site, blog | No restriction |
| **Internal** | Org chart, OKRs | Inside ACME only |
| **Confidential** | Salaries, customer data | Encrypted, access-logged |
| **Restricted** | Payment data, HR investigations | Need-to-know basis |

## Email / phishing
- Hover before clicking — verify the sender domain
- Never click password-reset links sent unexpectedly
- Forward suspected phishing to `phish@arcstone.co.in`
- Bank transfer / wire instructions via email **must** be verified by phone

## Software install
- Only install software from the approved catalog
- Open-source libraries must clear `License-OK` review (no GPL in commercial code)
- VPN must be ON when accessing prod systems from outside the office

## Incident response
If you suspect a breach:
1. Disconnect the affected device from network
2. Call `+91 98xxxxxxxx` (24/7 IT hotline)
3. Document what you saw — do **not** alter files

---
*Effective: 1 April 2026 · v3.0 · Owner: CISO*"""

TRAVEL_BODY = """# Travel & Reimbursement Policy

## Booking philosophy
We prefer "lowest reasonable" — not "cheapest possible." Spend like you'd spend your own money.

## Pre-approval
- **Below ₹25,000** total trip — manager approval is enough
- **₹25,000–1,00,000** — manager + finance pre-approval
- **Above ₹1,00,000** — additional country head approval

## Air travel
| Distance | Class |
|---|---|
| < 4 hours | Economy |
| 4–8 hours | Economy (premium economy if available <2x cost) |
| > 8 hours | Premium Economy / Business for VPs and above |

Book at least 14 days in advance through Skyline Travel (corporate tie-up).

## Accommodation caps (per night, INR)
| City tier | Cap |
|---|---|
| Tier-1 (Mumbai, Bengaluru, Delhi) | ₹8,000 |
| Tier-2 (Pune, Hyderabad, Chennai) | ₹6,000 |
| Tier-3 (others) | ₹4,000 |
| International | $200 USD |

## Per diem
- **Domestic** — ₹2,500/day (covers meals + local transport)
- **International** — $75 USD/day (Tier-1 cities $100)

## Local transport
- Cabs (Uber/Ola) for client meetings only
- Public transport / company-pooled cars for office commute
- Private car mileage at ₹15/km (with logbook)

## Receipts
- Mandatory above ₹500 except for per-diem
- Upload via Mobile App → Expenses → Snap Receipt
- Submit within **15 days** of trip end — late submissions need branch-head approval

## Forbidden
- Alcohol on company expenses (except client entertainment, with prior approval)
- Personal entertainment, spa, golf
- Companion travel (book and pay separately)

---
*v2.4 · For exceptions: travel@arcstone.co.in*"""

LEAVE_BODY = """# Leave Policy

## Leave types and annual entitlements
| Type | Days/year | Carry forward | Encashment |
|---|---|---|---|
| Casual Leave (CL) | 12 | No | No |
| Sick Leave (SL) | 12 | Up to 60 days | No |
| Earned Leave (EL/PL) | 21 | Up to 60 days | At separation |
| Maternity Leave | 26 weeks | — | — |
| Paternity Leave | 5 working days | — | — |
| Marriage Leave | 5 days | One-time | — |
| Bereavement Leave | 3 days | — | — |
| Compensatory Off | Earned per weekend work | Expires in 90 days | — |

## How to apply
1. Open the HRMS app → Leave → Apply
2. Pick dates and type
3. Add a substitute / handover note
4. Submit — your manager gets notified instantly

## Approval timelines
- **Same-day / next-day** — manager must respond within 4 hours
- **>3 days** — apply at least 7 working days in advance
- **Long leave (>10 days)** — manager + branch-head approval

## Sandwich rule
Public holidays falling **between** approved leave count as leave. E.g. Mon–Wed leave with Thu being a holiday → 4 days leave debited if Fri also taken.

## Loss of Pay (LOP)
If your leave balance is insufficient or unapproved, the day(s) are marked LOP and salary is auto-deducted in the next payroll run.

## Comp-off
You earn 1 comp-off if you work ≥6 hours on a weekly-off or holiday. File via:
HRMS → Comp-off → Request → manager approves → balance auto-credits with **90-day expiry**.

---
*v2.0 · Holiday calendar published every December for the next year*"""

COC_BODY = """# Code of Conduct

## Our values
**Integrity · Customer Obsession · Bias for Action · Inclusion · Excellence**

## Honesty in all things
- Tell the truth even when it's hard
- Disagree and commit — don't sandbag and resent
- Surface bad news fast; we fix problems together

## Respect for everyone
- No discrimination on the basis of gender, caste, religion, nationality, age, disability, or sexual orientation
- Listen first; speak with care
- Disagreements happen — attack ideas, never people

## Conflicts of interest
Disclose to your manager + HR within 7 days if:
- A close family member works at a vendor / customer / competitor
- You hold > 1 % equity in a company that does business with ACME
- You receive gifts / hospitality > ₹5,000 from a third party

## Outside engagements
- Side projects are OK if they don't compete with ACME and don't use company time/resources
- Speaking engagements / blog posts mentioning your role need pre-clearance
- Board seats at non-profits — disclose; usually fine

## Anti-corruption
- We do not pay bribes — facilitating payments included
- We do not accept kickbacks
- Government interactions logged in the Compliance module

## Confidentiality
- Customer data is sacrosanct
- Source code, salaries, and unreleased products are confidential
- NDAs survive employment — they apply forever

## Reporting violations
Use the **Whistleblower Channel** at `whistle@arcstone.co.in` — read only by the Audit Committee. Anonymous reporting supported.

---
*Acknowledging this Code is a condition of employment. Annual re-acknowledgement required.*"""

POLICY_DOCS = [
    ("Code of Conduct",                "code-of-conduct-2026",  "code_of_conduct", COC_BODY,         "1.0"),
    ("Information Security Policy",    "info-security-2026-v3", "it_security",     IT_SECURITY_BODY, "3.0"),
    ("Travel & Reimbursement Policy",  "travel-reimbursement-2026", "travel",      TRAVEL_BODY,      "2.4"),
    ("Leave Policy",                   "leave-policy-2026",     "leave",           LEAVE_BODY,       "2.0"),
    ("Anti-Harassment & POSH Policy",  "posh-policy-2026",      "posh",            POSH_BODY,        "2.1"),
]


# ---------------------------------------------------------------------------
# Hierarchy seeder
# ---------------------------------------------------------------------------
def assign_hierarchy(employees, hr_emp, mgr, emp):
    """Build a clean 3-level org tree out of the existing employees.

    L0 (CEO/founder)        : 1 person — `hr_emp` (designated as CEO for the demo)
    L1 (Country/Region head): 4 people — top managers across functions
    L2 (Branch managers)    : ~10 people
    L3 (ICs)                : everyone else (~40 people)

    Returns list of {id, manager_id, role_in_company} tuples ready to bulk-write.
    """
    pool = [e for e in employees if e["status"] == "active"]
    random.shuffle(pool)
    # Ensure `hr_emp` is first (L0)
    pool = [hr_emp] + [e for e in pool if e["id"] != hr_emp["id"]]

    updates = []
    # L0 — top of org
    updates.append((hr_emp["id"], None, "company_admin"))
    next_idx = 1

    # L1 — 4 country/region heads
    l1 = pool[next_idx:next_idx + 4]
    next_idx += 4
    if mgr["id"] not in [e["id"] for e in l1]:
        l1[0] = mgr
    for e in l1:
        updates.append((e["id"], hr_emp["id"], "country_head" if e == l1[0] else "region_head"))

    # L2 — 10 branch managers
    l2 = pool[next_idx:next_idx + 10]
    next_idx += 10
    for i, e in enumerate(l2):
        # spread evenly across L1 parents
        parent = l1[i % len(l1)]
        updates.append((e["id"], parent["id"], "branch_manager"))

    # L3 — rest are ICs reporting to L2
    l3 = pool[next_idx:]
    # Make sure `emp` (employee@acme.io) is in L3 reporting to mgr
    emp_in_l3 = next((e for e in l3 if e["id"] == emp["id"]), None)
    if emp_in_l3:
        # we'll handle emp separately — pin to mgr explicitly
        l3 = [e for e in l3 if e["id"] != emp["id"]]
    updates.append((emp["id"], mgr["id"], "employee"))

    for i, e in enumerate(l3):
        parent = l2[i % len(l2)]
        updates.append((e["id"], parent["id"], "employee"))

    return updates


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    company = await db.companies.find_one({}, {"_id": 0})
    if not company:
        print("No company — run base seeder first."); return
    cid = company["id"]
    employees = await db.employees.find({"company_id": cid}, {"_id": 0}).to_list(500)
    if not employees:
        print("No employees yet."); return

    # `hr@acme.io` is a user (not an employee). Pick a senior employee to act as L0
    # in the hierarchy demo. We prefer the manager_id == None pool; fallback to first.
    mgr = next((e for e in employees if e.get("email") == "manager@acme.io"), employees[0])
    emp = next((e for e in employees if e.get("email") == "employee@acme.io"), employees[1])
    # CEO/L0 — pick a different person from mgr/emp (random first non-mgr non-emp)
    hr_emp = next(
        (e for e in employees
         if e.get("status") == "active" and e["id"] not in (mgr["id"], emp["id"])
         and e.get("role_in_company") in ("branch_manager", "company_admin", None)),
        next(e for e in employees if e["id"] not in (mgr["id"], emp["id"])),
    )
    # Real HR user (for created_by audit fields) — still useful to reference.
    hr_user = await db.users.find_one({"email": "hr@acme.io"}, {"_id": 0}) or {}

    print(f"Seeding for {company['name']} ({cid}) with {len(employees)} employees")
    print(f"  L0 (CEO) = {hr_emp['name']}  ·  Manager = {mgr['name']}  ·  Employee = {emp['name']}")

    # ===================================================================
    # 1. Hierarchy
    # ===================================================================
    banner("Hierarchy map")
    # Always re-run — it's a deterministic re-build, not duplicating data
    updates = assign_hierarchy(employees, hr_emp, mgr, emp)
    bulk = []
    for emp_id, mgr_id, role in updates:
        bulk.append({"updateOne": {
            "filter": {"id": emp_id, "company_id": cid},
            "update": {"$set": {"manager_id": mgr_id, "role_in_company": role,
                                 "updated_at": now_iso()}},
        }})
    if bulk:
        # Apply the updates one by one (motor doesn't accept the literal bulk-syntax above)
        for u in bulk:
            f = u["updateOne"]["filter"]; up = u["updateOne"]["update"]
            await db.employees.update_one(f, up)
        ok(f"Restructured manager_id chain for {len(updates)} employees: 1 CEO → 4 heads → 10 branch managers → {len(updates)-15} ICs")

    # ===================================================================
    # 2. Policies — wipe demo + reseed with rich content
    # ===================================================================
    banner("Policies — rich markdown content")
    seeded = 0
    for title, slug, cat, body, ver in POLICY_DOCS:
        existing = await db.company_policies.find_one({"company_id": cid, "slug": slug}) or \
                   await db.company_policies.find_one({"company_id": cid, "title": title})
        if existing:
            # Update body in-place so demo shows full content
            await db.company_policies.update_one(
                {"id": existing["id"]},
                {"$set": {
                    "body_markdown": body, "category": cat, "version": ver,
                    "status": "published", "requires_acknowledgement": True,
                    "acknowledgement_grace_days": 14,
                    "effective_from": ago_iso(days=30)[:10],
                    "published_at": ago_iso(days=30),
                    "updated_at": now_iso(),
                }})
            continue
        await db.company_policies.insert_one({
            "id": uid(), "company_id": cid, "title": title, "slug": slug,
            "category": cat, "version": ver,
            "body_markdown": body,
            "status": "published",
            "requires_acknowledgement": True,
            "acknowledgement_grace_days": 14,
            "effective_from": ago_iso(days=30)[:10],
            "published_at": ago_iso(days=30),
            "created_at": ago_iso(days=45),
            "updated_at": now_iso(),
            "acknowledgements": [],
        })
        seeded += 1
    # Drop any leftover stub policies from earlier seed (the thin 5)
    await db.policies.delete_many({"company_id": cid})  # the wrong-collection rows
    ok(f"Seeded {seeded} new + refreshed body for the rest")

    # Sprinkle some acknowledgements so the demo shows engagement
    pubs = await db.company_policies.find({"company_id": cid, "status": "published"}, {"_id": 0}).to_list(20)
    for p in pubs:
        existing_acks = {a["employee_id"] for a in (p.get("acknowledgements") or [])}
        sample_emps = random.sample(employees, k=min(20, len(employees)))
        new_acks = []
        for e in sample_emps:
            if e["id"] in existing_acks:
                continue
            new_acks.append({
                "employee_id": e["id"], "employee_name": e["name"],
                "acknowledged_at": ago_iso(days=random.randint(1, 25)),
                "ip": "10.0.0." + str(random.randint(2, 254)),
            })
        if new_acks:
            await db.company_policies.update_one(
                {"id": p["id"]},
                {"$push": {"acknowledgements": {"$each": new_acks}}},
            )
    ok("Added randomised acknowledgements (sampling 20 employees per policy)")

    # ===================================================================
    # 3. Performance — goals + review cycle
    # ===================================================================
    banner("Performance — goals + reviews")
    if await db.review_cycles.count_documents({"company_id": cid}) >= 1:
        skip("review_cycles")
    else:
        await db.review_cycles.insert_one({
            "id": uid(), "company_id": cid,
            "name": "Q2 2026 Review", "period_start": "2026-04-01", "period_end": "2026-06-30",
            "status": "open",
            "self_review_due": "2026-07-05", "manager_review_due": "2026-07-15",
            "calibration_due": "2026-07-25",
            "created_at": ago_iso(days=10), "updated_at": now_iso(),
        })
        ok("Created Q2 2026 review cycle (self-review opens July 1)")

    # Note: goals collection already has 293 rows from prior seed — leave alone.

    # ===================================================================
    # 4. Recruitment — open requisitions + candidates
    # ===================================================================
    banner("Recruitment — open jobs + candidates")
    if await db.recruitment_jobs.count_documents({"company_id": cid}) >= 3:
        skip("recruitment_jobs")
    else:
        jobs = [
            ("Senior Software Engineer (Backend)", "Engineering", "Bengaluru", 22_00_000, 30_00_000, 5),
            ("Product Designer · Senior",          "Design",      "Bengaluru / Remote", 18_00_000, 26_00_000, 3),
            ("Customer Success Manager",           "Customer",    "Mumbai",      14_00_000, 22_00_000, 4),
            ("Engineering Manager · Platform",     "Engineering", "Bengaluru",   42_00_000, 60_00_000, 1),
        ]
        for title, dept, loc, lo, hi, applicants in jobs:
            jid = uid()
            await db.recruitment_jobs.insert_one({
                "id": jid, "job_code": f"JOB-{random.randint(1000, 9999)}",
                "company_id": cid, "title": title, "department": dept,
                "location": loc, "ctc_min": lo, "ctc_max": hi, "currency": "INR",
                "status": "open", "type": "full_time",
                "description": f"We are hiring a {title.lower()} to join our {dept.lower()} team. India/remote-friendly, 5-day work week.",
                "must_haves": ["3+ years experience", "Strong communication"],
                "good_to_haves": ["Exposure to Indian SaaS"],
                "hiring_manager_id": mgr["id"],
                "created_at": ago_iso(days=20), "updated_at": now_iso(),
                "open_seats": 1,
            })
            stages = ["screen", "tech-1", "tech-2", "manager", "hr-final", "offer"]
            for i in range(applicants):
                stage = random.choice(stages[:3 + (i % 3)])
                await db.recruitment_candidates.insert_one({
                    "id": uid(), "company_id": cid, "job_id": jid,
                    "name": random.choice(["Aarav Reddy", "Diya Patel", "Kabir Iyer", "Saanvi Rao",
                                            "Vihaan Joshi", "Anaya Nair", "Arnav Khurana", "Ishaan Pillai"]) + f" #{i+1}",
                    "email": f"candidate{random.randint(100,999)}@gmail.com",
                    "phone": f"+91 9{random.randint(1000000, 9999999)}",
                    "stage": stage,
                    "current_ctc": random.choice([12_00_000, 18_00_000, 25_00_000]),
                    "expected_ctc": random.choice([20_00_000, 28_00_000, 35_00_000]),
                    "experience_years": random.randint(3, 12),
                    "applied_on": ago_iso(days=random.randint(1, 18))[:10],
                    "rating": random.choice([3, 4, 4, 4, 5]),
                    "notes": "Strong candidate, good cultural fit so far.",
                    "created_at": ago_iso(days=random.randint(1, 18)),
                    "updated_at": now_iso(),
                })
        ok(f"Inserted {len(jobs)} open jobs + 13 candidates across pipeline stages")

    # ===================================================================
    # 5. Onboarding journey — show the workflow
    # ===================================================================
    banner("Onboarding journey")
    if await db.onboarding_journeys.count_documents({"company_id": cid}) >= 1:
        skip("onboarding_journeys")
    else:
        # Pick the 3 most recently-created employees as 'new hires'
        recent_hires = sorted(employees, key=lambda e: e.get("created_at", ""), reverse=True)[:3]
        for hire in recent_hires:
            tasks = [
                ("Offer letter signed", "completed"),
                ("Document collection (PAN, Aadhaar, bank)", "completed"),
                ("IT setup — laptop + email + Slack", "completed"),
                ("HRIS onboarding form", "in_progress"),
                ("Buddy assignment", "pending"),
                ("Day-1 orientation", "pending"),
                ("Probation review (90-day)", "pending"),
            ]
            await db.onboarding_journeys.insert_one({
                "id": uid(), "company_id": cid,
                "employee_id": hire["id"], "employee_name": hire["name"],
                "template_name": "Standard Engineering Onboarding",
                "started_on": ago_iso(days=4)[:10],
                "expected_complete_on": in_iso(days=60)[:10],
                "tasks": [
                    {"id": uid(), "title": t, "status": s,
                     "completed_at": ago_iso(days=random.randint(1, 4)) if s == "completed" else None}
                    for t, s in tasks
                ],
                "progress_pct": 45,
                "created_at": ago_iso(days=4), "updated_at": now_iso(),
            })
        ok(f"Created {len(recent_hires)} active onboarding journeys")

    print("\n\033[1;32m✓ Phase-2 seed complete\033[0m")


if __name__ == "__main__":
    asyncio.run(main())
