"""Seed comprehensive letter templates for the demo.

Adds 11 production-quality letter templates spanning the full employee
lifecycle: offer → appointment → confirmation → increment → promotion →
warning → transfer → NOC → address proof → relieving → experience.

All templates use {{merge_field}} syntax, with merge_fields auto-extracted
when saved through the API. This script writes directly to MongoDB.

Run on prod:
    cd /opt/arcstone/backend && source .venv/bin/activate
    python /opt/arcstone/scripts/seed_letter_templates.py
"""
from __future__ import annotations
import asyncio
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from motor.motor_asyncio import AsyncIOMotorClient   # noqa: E402

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "hrms_saas")

_MERGE_RE = re.compile(r"\{\{\s*([a-zA-Z0-9_\.]+)\s*\}\}")
def uid(): return str(uuid.uuid4())
def now_iso(): return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Templates — each is `(name, slug, category, body)`
# Common merge fields used: employee_name, designation, department, branch,
# doj, ctc, manager_name, hr_name, today, effective_date, last_working_day,
# new_designation, increment_amount, new_ctc, transfer_branch, etc.
# ---------------------------------------------------------------------------
T_OFFER = """**Date:** {{today}}

**To:**
{{candidate_name}}
{{candidate_address}}

**Subject:** Offer of Employment — {{designation}}

Dear {{candidate_name}},

We are delighted to extend an offer of employment with **{{company_name}}** for the role of **{{designation}}** based at our {{branch}} office.

### Compensation
- Annual CTC: ₹ {{ctc}}
- Joining bonus: ₹ {{joining_bonus}}  *(payable after 6 months of continuous service)*

### Key terms
- **Date of joining:** {{doj}}
- **Probation:** 6 months from joining date
- **Notice period:** 60 days post-confirmation
- **Working hours:** Mon–Fri, 9:30 AM – 6:30 PM

### Next steps
Please confirm acceptance by **{{offer_expiry}}** by signing the digital acknowledgement below. The detailed appointment letter and joining kit will follow on Day 1.

We look forward to having you on board.

Warm regards,

**{{hr_name}}**
Head of People · {{company_name}}
"""

T_APPOINTMENT = """**Date:** {{today}}

Dear {{employee_name}},

We are pleased to confirm your appointment with **{{company_name}}** as **{{designation}}** in our {{department}} team, effective **{{doj}}**.

### Position details
| Field | Detail |
|---|---|
| Employee ID | {{employee_code}} |
| Designation | {{designation}} |
| Department | {{department}} |
| Branch | {{branch}} |
| Reporting Manager | {{manager_name}} |
| Annual CTC | ₹ {{ctc}} |

### Probation
Your probation period is **6 months** from your joining date. During probation, either party may terminate this employment with 30 days' notice. Upon successful completion, you will be confirmed in writing.

### Conditions of employment
1. You will devote your full working time to **{{company_name}}**
2. You will abide by our Code of Conduct and IT Security policy
3. Confidential information shared during your tenure remains so for life
4. Salary is paid on the **last working day** of each month, after statutory deductions

### Documents to submit (Day 1)
- PAN card · Aadhaar · Passport (if held)
- Photographs (2 passport size)
- Last 3 months' payslips (if applicable)
- Educational and experience certificates

We welcome you and wish you a successful career at {{company_name}}.

Warm regards,

**{{hr_name}}**
Head of People · {{company_name}}
"""

T_CONFIRMATION = """**Date:** {{today}}

Dear {{employee_name}},

### Subject: Confirmation of Employment

We are pleased to inform you that based on your performance during the probation period, your services with **{{company_name}}** as **{{designation}}** are hereby confirmed with effect from **{{effective_date}}**.

You are now entitled to all benefits and policies applicable to confirmed employees, including:
- Annual leave entitlement of 21 working days
- Medical insurance cover
- Performance review eligibility
- Confirmed-employee notice period of 60 days

We look forward to your continued contribution.

Congratulations and best wishes,

**{{hr_name}}**
Head of People · {{company_name}}
"""

T_INCREMENT = """**Date:** {{today}}

Dear {{employee_name}},

### Subject: Salary Revision — FY {{fiscal_year}}

We are pleased to inform you that based on your performance and contribution during the period {{review_period}}, your annual compensation has been revised effective **{{effective_date}}**.

| Component | Previous | Revised |
|---|---|---|
| Annual CTC | ₹ {{old_ctc}} | ₹ {{new_ctc}} |
| Increment | — | ₹ {{increment_amount}} ({{increment_pct}}%) |

The revised salary structure will reflect in your **{{effective_month}}** payroll. The detailed CTC breakdown is attached separately.

Thank you for your continued dedication. We look forward to your sustained excellence in the year ahead.

Warm regards,

**{{hr_name}}**
Head of People · {{company_name}}
"""

T_PROMOTION = """**Date:** {{today}}

Dear {{employee_name}},

### Subject: Promotion — Congratulations!

It is our pleasure to inform you that in recognition of your exceptional performance and the value you bring to our organization, you have been **promoted** to the role of **{{new_designation}}** with effect from **{{effective_date}}**.

| Detail | Updated |
|---|---|
| New designation | {{new_designation}} |
| New department | {{new_department}} |
| New reporting manager | {{new_manager}} |
| Revised annual CTC | ₹ {{new_ctc}} |

Your new responsibilities, KPIs, and team structure will be discussed with your manager separately.

This promotion reflects our trust in your capability and our optimism about the next chapter of your journey here.

Warm regards and congratulations,

**{{hr_name}}**
Head of People · {{company_name}}
"""

T_TRANSFER = """**Date:** {{today}}

Dear {{employee_name}},

### Subject: Inter-branch Transfer

This letter is to formally communicate your **transfer** from **{{current_branch}}** to **{{transfer_branch}}**, effective **{{effective_date}}**.

The transfer is with reference to your discussion with {{manager_name}} and is necessitated by business requirements.

### Terms
- Designation, CTC, and reporting manager remain unchanged
- Relocation assistance of ₹ {{relocation_amount}} will be paid on relocation
- One-month grace period for accommodation arrangement
- Travel and lodging during this grace period will be reimbursed per Travel Policy

Please coordinate with HR for relocation logistics by **{{coordination_deadline}}**.

We appreciate your flexibility and wish you the best at the new location.

Warm regards,

**{{hr_name}}**
Head of People · {{company_name}}
"""

T_WARNING = """**Date:** {{today}}

**Strictly confidential — Personnel file**

Dear {{employee_name}},

### Subject: Letter of Warning

This letter is in reference to {{incident_summary}} on **{{incident_date}}**, which is in violation of {{policy_violated}}.

Per our discussions on {{discussion_date}} and the inputs from your manager, this constitutes a serious lapse and is unacceptable. The matter has been reviewed by HR and is being formally placed on record.

You are hereby **issued a written warning**. You are required to:
1. Acknowledge the receipt of this letter
2. Refrain from such conduct going forward
3. Cooperate with the corrective action plan agreed with your manager

Any repetition or similar breach within the next **{{review_window}}** months will lead to further disciplinary action, which may include termination of employment.

We hope you will take this in the right spirit and use it as an opportunity for improvement.

Sincerely,

**{{hr_name}}**
Head of People · {{company_name}}

---
**Acknowledgement** — by signing below, I confirm receipt and understanding of the above.
"""

T_RELIEVING = """**Date:** {{today}}

To Whomsoever It May Concern,

This is to certify that **{{employee_name}}** ({{employee_code}}) was employed with **{{company_name}}** as **{{designation}}** from **{{doj}}** to **{{last_working_day}}**.

We confirm that all dues including final settlement have been settled, and the employee has been duly relieved from the services of the company effective close of business on **{{last_working_day}}**.

We wish {{employee_name}} the very best for future endeavours.

Sincerely,

**{{hr_name}}**
Head of People · {{company_name}}
"""

T_EXPERIENCE = """**Date:** {{today}}

To Whomsoever It May Concern,

### Subject: Experience Certificate

This is to certify that **{{employee_name}}** ({{employee_code}}) was employed with **{{company_name}}** as **{{designation}}** in our **{{department}}** department from **{{doj}}** to **{{last_working_day}}**.

During this tenure, {{employee_name}} demonstrated:
- Strong technical and functional abilities
- Excellent collaboration and communication
- Professional commitment to deliverables and deadlines

Designations held:
{{designation_history}}

We wish {{employee_name}} continued success in future endeavours.

Sincerely,

**{{hr_name}}**
Head of People · {{company_name}}
"""

T_NOC = """**Date:** {{today}}

### No Objection Certificate

This is to certify that **{{employee_name}}** ({{employee_code}}), employed with **{{company_name}}** since **{{doj}}** as **{{designation}}**, has the no-objection of the company to:

> {{noc_purpose}}

This certificate is issued upon employee's request and at our discretion. **{{company_name}}** does not vouch for matters beyond the scope of employment.

Validity: **{{validity_period}}**.

Sincerely,

**{{hr_name}}**
Head of People · {{company_name}}
"""

T_ADDRESS_PROOF = """**Date:** {{today}}

To Whomsoever It May Concern,

### Subject: Address Confirmation

This is to certify that **{{employee_name}}** ({{employee_code}}) is a current employee of **{{company_name}}**, working as **{{designation}}** since **{{doj}}**.

As per our records, the employee currently resides at:

> {{employee_address}}

This certificate is issued at the request of the employee for the purpose of:

> {{purpose}}

Sincerely,

**{{hr_name}}**
Head of People · {{company_name}}
"""

T_TRAVEL = """**Date:** {{today}}

### Travel Authorization Letter

This is to confirm that **{{employee_name}}** ({{employee_code}}), {{designation}} at **{{company_name}}**, is authorised to travel to **{{travel_destination}}** for **business purposes** from **{{travel_start}}** to **{{travel_end}}**.

### Visa support
This letter may be used as supporting documentation for visa applications. {{company_name}} confirms that:
- The employee will return to India on/before **{{return_date}}**
- All travel costs are borne by **{{company_name}}**
- The employee is currently employed in good standing with us
- Annual CTC: ₹ {{ctc}}

For verification, please contact: {{hr_email}} · {{hr_phone}}.

Sincerely,

**{{hr_name}}**
Head of People · {{company_name}}
"""

TEMPLATES = [
    ("Offer Letter",                  "offer-letter-2026",        "offer",                  T_OFFER),
    ("Appointment Letter",            "appointment-letter-2026",  "appointment",            T_APPOINTMENT),
    ("Confirmation of Employment",    "confirmation-letter-2026", "appointment",            T_CONFIRMATION),
    ("Salary Increment Letter",       "increment-letter-fy26",    "salary_increment",       T_INCREMENT),
    ("Promotion Letter",              "promotion-letter-2026",    "promotion",              T_PROMOTION),
    ("Branch Transfer Letter",        "transfer-letter-2026",     "other",                  T_TRANSFER),
    ("Warning Letter",                "warning-letter-2026",      "warning",                T_WARNING),
    ("Relieving Letter",              "relieving-letter-2026",    "relieving",              T_RELIEVING),
    ("Experience Certificate",        "experience-cert-2026",     "experience",             T_EXPERIENCE),
    ("No-Objection Certificate (NOC)","noc-letter-2026",          "noc",                    T_NOC),
    ("Address Proof Letter",          "address-proof-2026",       "address_proof",          T_ADDRESS_PROOF),
    ("Travel Authorization Letter",   "travel-auth-letter-2026",  "travel_authorization",   T_TRAVEL),
]


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    company = await db.companies.find_one({}, {"_id": 0})
    if not company:
        print("No company yet."); return
    cid = company["id"]

    seeded = updated = 0
    for name, slug, category, body in TEMPLATES:
        merge_fields = sorted(set(_MERGE_RE.findall(body)))
        existing = await db.letter_templates.find_one({"company_id": cid, "slug": slug})
        if existing:
            # Refresh content but keep id/created_at
            await db.letter_templates.update_one(
                {"id": existing["id"]},
                {"$set": {
                    "name": name, "category": category,
                    "body_markdown": body, "merge_fields": merge_fields,
                    "is_active": True, "updated_at": now_iso(),
                }},
            )
            updated += 1
            continue
        await db.letter_templates.insert_one({
            "id": uid(), "company_id": cid, "name": name, "slug": slug,
            "category": category, "body_markdown": body,
            "merge_fields": merge_fields, "is_active": True,
            "created_at": now_iso(), "updated_at": now_iso(),
        })
        seeded += 1

    # Quietly deactivate the bare-bones default 'Joining Letter' if it lingers
    await db.letter_templates.update_one(
        {"company_id": cid, "name": "Joining Letter", "slug": {"$ne": "appointment-letter-2026"}},
        {"$set": {"is_active": False, "updated_at": now_iso()}},
    )

    print(f"\n✓ Letter templates: {seeded} new, {updated} refreshed (12 total active).\n")
    print("To browse them, login as hr@acme.io → People → Letters → Templates tab.")


if __name__ == "__main__":
    asyncio.run(main())
