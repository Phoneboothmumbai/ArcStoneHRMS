"""KB seed articles — platform-wide, idempotent."""
from models import now_iso, uid


SEED_ARTICLES = [
    {
        "slug": "welcome-to-arcstone",
        "title": "Welcome to Arcstone — the 3-minute tour",
        "category": "Getting Started",
        "excerpt": "The five places you'll spend most of your time and how they fit together.",
        "tags": ["basics", "tour"],
        "related_page": "dashboard",
        "content": """# Welcome to Arcstone 👋

Arcstone is built around five things you'll use every day:

## 1. **Employees** (the directory)
Everyone who works at your company lives here. Click any name to open their **full profile** — 10 sections covering Personal, Contact, KYC, Statutory (India PF/ESIC), Bank, Employment, Family, Education, Prior Employment, and Documents.

## 2. **Onboarding** (for new joiners)
Every new hire gets a task checklist organized by stage: **Pre-joining → Day 1 → Week 1 → Month 1 → Probation**. HR, IT, Admin, and the reporting manager each own specific tasks. When the last task is done, the employee is automatically moved from "onboarding" to "active".

## 3. **Approvals** (the engine)
Every request that needs a sign-off — leave, purchase, expense — flows through the approval engine. Workflows are fully configurable per company, per category, with match rules (cost thresholds, leave duration, branch) so routing is automatic.

## 4. **Leave & Attendance**
Employees apply for leave, check in/out, request regularization. Managers approve. HR reports.

## 5. **Billing & Modules**
Your company only pays for what you've turned on. You can request activation of more modules (Payroll, Performance, Procurement, ATS, etc.) from **Billing & Modules**. Your Super Admin or Reseller approves.

## Need help?
Every page has a **Help** icon in the top-right. Hover on any field with a `?` to see inline guidance. Still stuck? Search this Knowledge Base from the sidebar.
""",
    },
    {
        "slug": "how-to-add-first-employee",
        "title": "How to add your first employee",
        "category": "Employees & Profile",
        "excerpt": "From basic details to full onboarding, step by step.",
        "tags": ["employee", "add", "new hire"],
        "related_page": "employees",
        "content": """# Adding an employee

## Step 1 — Create the employee record
1. Go to **Employees** in the sidebar.
2. Click **+ Add employee** (top-right of the directory).
3. Fill in:
   - Name, work email, phone
   - Employee type: **WFO / WFH / Field / Hybrid**
   - Branch and department (create them from **Organization** first if missing)
   - Job title and reporting manager
   - Role in company (Employee / Branch Manager / etc.)
4. Check **Create login** if this person should be able to log in and set a temporary password.
5. Click **Save**. Arcstone auto-generates an Employee Code (`EMP-0001` and so on).

## Step 2 — Complete the profile
Click the new name in the directory → you land on their **Profile** page with 10 sections.

HR (that's you) should fill:
- **KYC**: PAN, Aadhaar last-4, passport
- **Statutory India**: UAN, PF number, ESIC (if applicable), PT state
- **Bank**: Account number, IFSC
- **Employment**: Grade, band, DOJ, probation, cost center

The employee can later self-update **Personal, Contact, Family, Education, Prior Employment** from **My Profile**.

## Step 3 — Start their onboarding
1. Go to **Onboarding** in the sidebar.
2. Click **Start onboarding**.
3. Pick the employee, the template ("Standard India Onboarding" is seeded for you), and the Date of Joining.
4. The 12-task checklist appears — HR/IT/Admin/Manager each see what they need to do.

That's it. The employee will auto-flip to "active" status when every task is marked done.
""",
    },
    {
        "slug": "india-statutory-pf-esic-pt",
        "title": "Understanding PF, UAN, ESIC, PT, LWF — which apply to your employee?",
        "category": "India Statutory (PF, ESIC, PT)",
        "excerpt": "Plain-English guide to each India payroll deduction and when it applies.",
        "tags": ["india", "statutory", "pf", "esic", "pt", "uan", "lwf"],
        "related_page": "profile.statutory",
        "content": """# India Statutory — a quick reference

## Provident Fund (PF) & UAN
- **Applies to**: Any company with **20+ employees** must register. Employees earning basic+DA ≤ ₹15,000/month are **mandatory** enrollees; above that, optional.
- **UAN** (Universal Account Number) is issued by EPFO once — the employee carries it across jobs. If a new hire worked anywhere before, ask for their UAN; never generate a new one.
- **Contribution**: 12% of basic by employee + 12% by employer (8.33% goes to EPS, 3.67% to EPF).
- **In Arcstone**: Fill UAN + PF Number under **Profile → Statutory**. Toggle **PF opted in**.

## ESIC (Employees' State Insurance Corporation)
- **Applies to**: Companies with 10+ employees, for employees earning ≤ ₹21,000/month (₹25,000 for persons with disability).
- **Contribution**: 0.75% employee + 3.25% employer.
- **In Arcstone**: Fill ESIC Number under **Profile → Statutory**. Toggle **ESIC opted in** only if salary is within the cap.

## Professional Tax (PT)
- **State-level tax**. Rates and rules vary by state.
- **Applicable in**: Maharashtra, Karnataka, West Bengal, Tamil Nadu, Andhra, Telangana, Gujarat, Kerala, Madhya Pradesh, and a few others. **NOT** applicable in Delhi, UP, Haryana, Punjab, Rajasthan etc.
- **In Arcstone**: Set the **PT State** dropdown — we'll use this for payslip calculations (coming in Payroll module).

## NPS (National Pension System)
- **Optional** retirement scheme. Corporate NPS gives tax benefits under 80CCD(2).
- **In Arcstone**: Toggle **NPS opted in** if the employee has chosen to participate.

## LWF (Labour Welfare Fund)
- **State-level** — applicable in Karnataka, Kerala, Tamil Nadu, Maharashtra, Gujarat, Punjab, West Bengal, Haryana, MP, Chhattisgarh, Goa, Delhi.
- Flat amount deducted (₹6–₹40 depending on state) half-yearly or monthly.
- **In Arcstone**: Toggle **LWF applicable** based on state.

## How to find an employee's existing UAN
1. Ask the employee to log in at [unifiedportal-mem.epfindia.gov.in](https://unifiedportal-mem.epfindia.gov.in)
2. OR call **EPFO helpline 14470**
3. OR check the last payslip — UAN is always printed on it

## What we don't ask for
- **Full Aadhaar number** — we only store the last 4 digits for privacy (DPDP compliant). If EPF linking needs the full number, that happens directly at the EPFO portal.
""",
    },
    {
        "slug": "kyc-documents-employee",
        "title": "Setting up employee KYC — PAN, Aadhaar, Passport",
        "category": "Employees & Profile",
        "excerpt": "What to collect, how to store it, and the privacy rules we follow.",
        "tags": ["kyc", "pan", "aadhaar", "passport"],
        "related_page": "profile.kyc",
        "content": """# KYC — what to collect and how

## Required documents (India)
1. **PAN card** — 10-character alphanumeric (e.g. `ABCDE1234F`). Required for TDS, salary, PF.
2. **Aadhaar** — 12 digits. **We store only the last 4** for privacy compliance (DPDP Act).
3. **Passport** — optional, but needed if employee will travel or for visa sponsorship.
4. **Driving licence / Voter ID** — supporting identity proof.

## How to capture in Arcstone
1. Open the employee's profile → **KYC** tab.
2. Enter:
   - **PAN**: Type the 10 characters. We auto-uppercase.
   - **Aadhaar — last 4 digits only**: We never store the full 12 digits.
   - **Passport** + expiry date (to warn before expiry).
   - Others if applicable.
3. Click **Save**.

## Upload the actual documents (scanned copies)
1. Scroll down to **Document vault** on the same profile page.
2. Pick **Category**: `identity`
3. Click **Upload** — select the PDF/image (max 2 MB per file).
4. File is stored encrypted in the database. Only HR roles + the employee themselves can download.

## Privacy & compliance
- **Only HR and the employee** can view KYC fields. Managers cannot.
- **Only the last 4 digits of Aadhaar** are retained. Full number is never stored.
- **Document deletion** on employee exit is manual for now (tip: enable an auto-purge-after-7-years policy in Admin → Settings when Phase 1E lands).
""",
    },
    {
        "slug": "how-onboarding-works",
        "title": "How onboarding works — templates, stages and tasks",
        "category": "Onboarding",
        "excerpt": "The 5-stage flow, who does what, and how to customize.",
        "tags": ["onboarding", "template", "new hire"],
        "related_page": "onboarding",
        "content": """# Onboarding in 2 minutes

## The flow
Every onboarding uses a **template**. Arcstone ships with a default **Standard India Onboarding** template (12 tasks) to get you started. You can create more from the admin area (coming soon — for now we use the seeded template).

## The 5 stages
1. **Pre-joining** — before Day 1: offer letter, KYC collection, laptop provisioning
2. **Day 1** — welcome, ID card, email, statutory forms (Form 2 PF nomination)
3. **Week 1** — team intros, policy handbook, compliance training
4. **Month 1** — 30-day HR check-in, first goals finalized with manager
5. **Probation** — probation review, confirmation letter

## Who owns each task?
Each task is tagged with an assignee role — **HR / IT / Admin / Manager / Finance / Employee**. When that person logs in, their tasks appear in their view (upcoming dashboard panel in Phase 1D).

## Starting an onboarding
1. Go to **Onboarding** in the sidebar.
2. Click **Start onboarding** → pick the employee, template, Date of Joining.
3. Task due dates are **auto-calculated** from DOJ (e.g. "offer letter" is DOJ minus 7 days, "30-day check-in" is DOJ plus 30).

## Completing tasks
Click any task row → status dropdown (Pending / In progress / Done / Skipped). Done tasks stamp your name and timestamp for audit.

## When does it auto-complete?
When every task is marked **Done** or **Skipped**, the onboarding automatically flips to **completed** and the employee's status flips from "onboarding" to "active". You'll see a green progress bar fill to 100%.
""",
    },
    {
        "slug": "employee-exit-clearance",
        "title": "Handling employee exit & clearance",
        "category": "Offboarding & Exit",
        "excerpt": "From resignation to relieving letter — step by step.",
        "tags": ["offboarding", "exit", "clearance", "f&f"],
        "related_page": "offboarding",
        "content": """# Employee exit — the full playbook

## Step 1 — Initiate
1. Go to **Offboarding** in the sidebar.
2. Click **Initiate exit**.
3. Pick the employee, set:
   - **Resignation date** (when they submitted the letter)
   - **Last working day** (usually resignation + notice period)
   - **Reason**: Resignation / Termination / Retirement / End of contract / Other
   - **Notice period days** (default 60; editable)
4. Click **Initiate**. Arcstone creates an exit case with an 8-item **clearance checklist** pre-populated.

## Step 2 — Clearance checklist
The 8 default items cover every department:

| Department | Task |
|---|---|
| IT | Return laptop / device |
| IT | Revoke system access & email |
| Admin | Return ID card and access badge |
| Admin | Return company assets (phone, keys, books) |
| Finance | Clear pending reimbursements / advances |
| HR | Submit resignation acceptance |
| Manager | Handover work & documentation |
| Security | Final sign-out |

Each department head marks their item **Cleared / Pending dues** with remarks. Every clearance is stamped with the user's name + timestamp.

## Step 3 — Exit interview
On the same page, there's an **Exit interview** form — submit before last working day. Captured fields:
- Overall rating (1–5)
- Reason for leaving
- What worked well
- What we can improve
- Would recommend as employer? / Would rejoin?

The employee can fill this themselves (they log in as self) or HR can capture it on their behalf.

## Step 4 — Complete exit
Once **all 8 clearance items are Cleared**, click **Complete exit & issue letters**. This action:
1. Marks the exit case as **Relieved**
2. Issues the **Relieving letter** (flag set to true — actual PDF generation comes in Phase 1F)
3. Issues the **Experience letter** (same)
4. Marks **F&F settled** (final settlement — payslip + dues reconciled in Payroll module)
5. Flips the employee's status to **Terminated**
6. Deactivates the user's login

## If you skip a clearance item
You cannot complete the exit. Arcstone will block the action and show you which items are still pending.
""",
    },
    {
        "slug": "how-approval-workflows-work",
        "title": "How approval workflows work",
        "category": "Approvals & Workflows",
        "excerpt": "Match rules, steps, and how routing is decided.",
        "tags": ["approval", "workflow"],
        "related_page": "workflows",
        "content": """# Approval workflows — the routing brain

## What is a workflow?
A **workflow** is a set of approval steps that a request must pass through. Workflows are defined **per company**, **per request type** (leave, product_service, expense).

Each workflow has:
- **Match criteria** — when should this workflow apply? (item category, cost range, leave duration, branch)
- **Steps** — the ordered list of approvers

## Example
> *"Any computer purchase above ₹50,000 in the Bengaluru branch needs 3 approvals: Direct Manager → Department Head → HR Admin."*

That translates to a workflow with:
- `match_item_category = "computer"`
- `match_min_cost = 50000`
- `match_branch_id = <Bengaluru branch id>`
- Steps: `manager` → `department_head` → `role:company_admin`

## Matching
When a request is submitted, Arcstone looks for the **highest-priority matching workflow**. Multiple workflows can overlap — the one with the highest `priority` value wins. This lets you define:
- A generic fallback (priority 10)
- A stricter override for large amounts (priority 100)

## Step resolvers
Each step picks its approver via a resolver:
- `manager` — the requester's direct manager
- `department_head` — head of the requester's department
- `branch_manager` — manager of the requester's branch
- `company_admin` — any company admin (first to respond owns it)
- `role` — any user with a specific role (e.g. `country_head`)
- `user` — a specific named user

## Conditional skip
You can mark a step with `condition_min_cost` — e.g. skip the Finance approval if the amount is under ₹10,000. This keeps routine requests fast.

## How to configure
1. **Workflows** in the sidebar (HR admin only).
2. Click **+ New workflow**.
3. Pick request type, match rules, priority.
4. Add steps in order. For each, pick the resolver and a friendly label.
5. **Save**. New requests submitted after this moment use the workflow.

Existing pending requests continue on their original workflow — this is by design to avoid mid-flight surprises.
""",
    },
    {
        "slug": "modules-and-billing",
        "title": "What are modules and how do I activate them?",
        "category": "Admin & Modules",
        "excerpt": "Pay for what you use — turn modules on and off per company.",
        "tags": ["modules", "billing", "activation"],
        "related_page": "billing",
        "content": """# Modules, explained

Arcstone ships **16 modules + 3 bundles**. You only pay for what's turned on.

## What's included by default
- **HRMS Base** — employees, org tree, attendance, leave, approvals, workflows. Always on.

## What's optional
- **Payroll** — India statutory payroll, payslips, tax
- **Performance & Goals** — OKRs, reviews, 1:1s
- **Recruitment (ATS)** — jobs, pipeline, offers
- **Learning (LMS)** — courses, certifications
- **HR Helpdesk** — tickets, SLAs
- **Onboarding** — advanced onboarding/offboarding flows (you have this one seeded as a demo)
- **Engagement & Surveys** — pulse, eNPS
- **Procurement & Vendor Marketplace** — vendors, RFQs, POs
- **Expense Management** — claims, reimbursement
- **Asset Management** — devices, assignment
- **Travel Management** — requests, bookings, per-diem
- **Shift Scheduling** — rosters, shift swaps
- **Analytics & Insights** — predictive attrition, cost analytics
- **Compliance & Audit** — country labor law packs
- **Enterprise SSO** — SAML, OIDC, SCIM

## How to activate
1. Go to **Billing & Modules** in the sidebar (company admin).
2. You see **Active modules** and **Available modules**.
3. On any available module, click **Request activation**.
4. Your reseller (or Super Admin if you bought directly) gets a notification. They approve — the module turns on instantly for your company.

## Trial mode
Some modules offer a **14-day free trial**. Activate with **Start trial** — full access; auto-disables at day 15 unless you convert to paid.

## Bundles save money
Three bundles:
- **HR Essentials** — Base + Payroll + Performance (save ~19%)
- **People Ops Full** — Adds Helpdesk + Onboarding + Engagement
- **Enterprise Complete** — All 16 modules (biggest discount)

Bundle pricing is proportional — if you later disable one module from a bundle, credit is applied to the next.

## Pricing privacy
- **Super Admin** sees both wholesale and retail prices everywhere.
- **Reseller** sees only wholesale (their cost).
- **Company Admin / Employees** see only your effective price — never other companies' pricing.
""",
    },
]


async def seed_kb_articles(db, super_admin_name: str = "Platform"):
    """Idempotent: inserts any article whose slug doesn't already exist."""
    existing_slugs = {d["slug"] async for d in db.kb_articles.find({}, {"_id": 0, "slug": 1})}
    inserted = 0
    for art in SEED_ARTICLES:
        if art["slug"] in existing_slugs:
            continue
        doc = {
            "id": uid(),
            "slug": art["slug"],
            "title": art["title"],
            "category": art["category"],
            "excerpt": art.get("excerpt"),
            "content": art["content"],
            "tags": art.get("tags", []),
            "related_page": art.get("related_page"),
            "author_name": super_admin_name,
            "is_published": True,
            "view_count": 0,
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        await db.kb_articles.insert_one(doc)
        inserted += 1
    return inserted
