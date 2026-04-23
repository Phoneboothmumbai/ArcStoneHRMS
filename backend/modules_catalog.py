"""Platform module catalog. Code-as-truth: every module's metadata lives here.
DB stores only per-company entitlements + pricing overrides.
"""

# Currency codes we support from day 1 (multi-currency ready)
SUPPORTED_CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD"]
DEFAULT_CURRENCY = "INR"

# Each module entry defines:
#   id, name, description, category, retail_price (default currency INR),
#   wholesale_price, trial_days, provides (list of feature keys),
#   depends_on (modules this requires), icon (lucide-style key)
MODULES = {
    "base_hrms": {
        "id": "base_hrms", "name": "HRMS Base", "category": "Core",
        "description": "Employees, org hierarchy, attendance, leave, approvals engine.",
        "retail_price": 100, "wholesale_price": 60, "trial_days": 0,
        "included_by_default": True,
        "provides": ["employees", "attendance", "leave", "approvals", "org_tree", "workflows"],
        "depends_on": [],
    },
    "payroll": {
        "id": "payroll", "name": "Payroll", "category": "HR & People",
        "description": "Country-specific payroll rules, payslips, tax config.",
        "retail_price": 60, "wholesale_price": 40, "trial_days": 14,
        "provides": ["payroll_runs", "payslips", "tax_config"], "depends_on": ["base_hrms"],
    },
    "performance": {
        "id": "performance", "name": "Performance & Goals", "category": "HR & People",
        "description": "OKRs, reviews, 1:1s, calibration.",
        "retail_price": 30, "wholesale_price": 20, "trial_days": 14,
        "provides": ["okrs", "reviews", "one_on_ones"], "depends_on": ["base_hrms"],
    },
    "ats": {
        "id": "ats", "name": "Recruitment (ATS)", "category": "HR & People",
        "description": "Job requisitions, candidate pipeline, interviews, offers.",
        "retail_price": 50, "wholesale_price": 30, "trial_days": 14,
        "provides": ["job_requisitions", "candidates", "interviews"], "depends_on": ["base_hrms"],
    },
    "learning": {
        "id": "learning", "name": "Learning (LMS)", "category": "HR & People",
        "description": "Courses, training, certifications, compliance training.",
        "retail_price": 35, "wholesale_price": 22, "trial_days": 14,
        "provides": ["courses", "certifications"], "depends_on": ["base_hrms"],
    },
    "helpdesk": {
        "id": "helpdesk", "name": "HR Helpdesk", "category": "HR & People",
        "description": "Employee queries, ticketing, SLAs, knowledge base.",
        "retail_price": 20, "wholesale_price": 12, "trial_days": 14,
        "provides": ["tickets", "knowledge_base"], "depends_on": ["base_hrms"],
    },
    "onboarding": {
        "id": "onboarding", "name": "Onboarding & Offboarding", "category": "HR & People",
        "description": "Employee joining/exit workflows, checklists, document collection.",
        "retail_price": 25, "wholesale_price": 15, "trial_days": 14,
        "provides": ["onboarding_flows", "offboarding_flows"], "depends_on": ["base_hrms"],
    },
    "engagement": {
        "id": "engagement", "name": "Engagement & Surveys", "category": "HR & People",
        "description": "Pulse surveys, eNPS, feedback loops, engagement analytics.",
        "retail_price": 30, "wholesale_price": 18, "trial_days": 14,
        "provides": ["surveys", "enps", "pulse"], "depends_on": ["base_hrms"],
    },
    "procurement": {
        "id": "procurement", "name": "Procurement & Vendor Marketplace", "category": "Operations",
        "description": "Vendors, RFQs, quotes, POs, vendor portal.",
        "retail_price": 50, "wholesale_price": 30, "trial_days": 14,
        "provides": ["vendors", "rfqs", "quotes", "purchase_orders", "vendor_portal"],
        "depends_on": ["base_hrms"],
    },
    "expense": {
        "id": "expense", "name": "Expense Management", "category": "Operations",
        "description": "Expense claims, reimbursement, multi-currency.",
        "retail_price": 25, "wholesale_price": 15, "trial_days": 14,
        "provides": ["expenses", "reimbursements"], "depends_on": ["base_hrms"],
    },
    "assets": {
        "id": "assets", "name": "Asset Management", "category": "Operations",
        "description": "Company asset assignment, return, depreciation.",
        "retail_price": 20, "wholesale_price": 12, "trial_days": 14,
        "provides": ["assets", "asset_assignment"], "depends_on": ["base_hrms"],
    },
    "travel": {
        "id": "travel", "name": "Travel Management", "category": "Operations",
        "description": "Travel requests, bookings, per-diem, expense linking.",
        "retail_price": 30, "wholesale_price": 18, "trial_days": 14,
        "provides": ["travel_requests", "bookings"], "depends_on": ["base_hrms"],
    },
    "shift_scheduling": {
        "id": "shift_scheduling", "name": "Shift Scheduling", "category": "Operations",
        "description": "Rota planning, shift swaps, overtime tracking.",
        "retail_price": 25, "wholesale_price": 15, "trial_days": 14,
        "provides": ["shifts", "rotas"], "depends_on": ["base_hrms"],
    },
    "analytics": {
        "id": "analytics", "name": "Analytics & Insights", "category": "Premium",
        "description": "Workforce planning, attrition prediction, cost analytics.",
        "retail_price": 40, "wholesale_price": 25, "trial_days": 14,
        "provides": ["analytics_dashboards", "attrition_prediction"], "depends_on": ["base_hrms"],
    },
    "compliance": {
        "id": "compliance", "name": "Compliance & Audit", "category": "Premium",
        "description": "Per-country labor law packs, statutory reports, audit log exports.",
        "retail_price": 30, "wholesale_price": 18, "trial_days": 14,
        "provides": ["compliance_packs", "audit_exports"], "depends_on": ["base_hrms"],
    },
    "sso_enterprise": {
        "id": "sso_enterprise", "name": "Enterprise SSO", "category": "Premium",
        "description": "SAML 2.0, OIDC, SCIM 2.0 auto-provisioning.",
        "retail_price": 50, "wholesale_price": 30, "trial_days": 14,
        "provides": ["saml", "oidc", "scim"], "depends_on": ["base_hrms"],
    },
}


# Pre-built bundles — name, modules, bundled price (INR)
BUNDLES = {
    "hr_essentials": {
        "id": "hr_essentials", "name": "HR Essentials",
        "description": "Everything a growing HR team needs to run people operations.",
        "modules": ["base_hrms", "payroll", "performance"],
        "retail_price": 160, "wholesale_price": 100,  # save ₹30 retail / ₹20 wholesale
    },
    "people_ops_full": {
        "id": "people_ops_full", "name": "People Ops Full",
        "description": "Complete HR stack including helpdesk, onboarding and engagement.",
        "modules": ["base_hrms", "payroll", "performance", "helpdesk", "onboarding", "engagement"],
        "retail_price": 220, "wholesale_price": 145,
    },
    "enterprise_complete": {
        "id": "enterprise_complete", "name": "Enterprise Complete",
        "description": "All 16 modules activated. Best value for large enterprises.",
        "modules": list(MODULES.keys()),
        "retail_price": 550, "wholesale_price": 340,
    },
}


def module_exists(mid: str) -> bool:
    return mid in MODULES


def get_module(mid: str) -> dict:
    return MODULES.get(mid)


def get_bundle(bid: str) -> dict:
    return BUNDLES.get(bid)
