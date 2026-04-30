"""Employment-class feature entitlements.

Every employee has an `employment_class` that determines which features they can
access. On-roll employees get everything; off-roll (consultants/contractors) are
excluded from payroll, PF/ESIC, leave, loans, insurance — but retain timesheet,
expenses, attendance. Interns by default get a light subset. Company admins can
override any default per class via the admin UI.

Effective permissions = DEFAULTS (code-as-truth) overlaid with per-company
overrides stored in `employment_class_permissions` collection.
"""
from __future__ import annotations
from typing import Dict, List

# All feature keys an employment-class can gate. Keep the list flat & canonical.
FEATURES: List[dict] = [
    {"key": "payroll",     "label": "Payroll & Payslips",   "group": "Compensation"},
    {"key": "pf_esic",     "label": "PF / ESIC / Statutory", "group": "Compensation"},
    {"key": "loans",       "label": "Salary Loans",         "group": "Compensation"},
    {"key": "insurance",   "label": "Group Insurance",      "group": "Compensation"},
    {"key": "leave",       "label": "Leave Balances & Requests", "group": "Time Off"},
    {"key": "comp_off",    "label": "Comp-Off",             "group": "Time Off"},
    {"key": "attendance",  "label": "Attendance & Check-in", "group": "Time & Attendance"},
    {"key": "timesheet",   "label": "Timesheets",           "group": "Time & Attendance"},
    {"key": "shifts",      "label": "Shift Roster",         "group": "Time & Attendance"},
    {"key": "expenses",    "label": "Expense Claims",       "group": "Operations"},
    {"key": "assets",      "label": "Asset Assignments",    "group": "Operations"},
    {"key": "helpdesk",    "label": "Helpdesk Tickets",     "group": "Operations"},
    {"key": "policies",    "label": "Policies",             "group": "Docs & Knowledge"},
    {"key": "kb",          "label": "Knowledge Base",       "group": "Docs & Knowledge"},
    {"key": "letters",     "label": "Letters Library",      "group": "Docs & Knowledge"},
    {"key": "performance", "label": "Performance & Goals",  "group": "Growth"},
    {"key": "learning",    "label": "Learning / LMS",       "group": "Growth"},
    {"key": "referral",    "label": "Recruitment Referral", "group": "Growth"},
    {"key": "idea_factory","label": "Idea Factory",         "group": "Engagement"},
]

FEATURE_KEYS = [f["key"] for f in FEATURES]


# Employment classes, ordered for display
CLASSES: List[dict] = [
    {"key": "on_roll",               "label": "On-Roll Employee",        "description": "Permanent employee — full payroll, PF/ESIC, leaves, all benefits."},
    {"key": "off_roll_consultant",   "label": "Consultant (Off-Roll)",   "description": "Retainer-based consultant — no payroll/PF; timesheet + expenses only."},
    {"key": "off_roll_contractor",   "label": "Contractor (Off-Roll)",   "description": "Third-party contractor — minimal access, attendance + tickets."},
    {"key": "intern",                "label": "Intern",                  "description": "Stipend-based intern — lightweight feature set."},
]

CLASS_KEYS = [c["key"] for c in CLASSES]


# DEFAULT PERMISSION MATRIX — code-as-truth defaults.
# True  = feature enabled for this class.
# False = feature hidden/blocked.
DEFAULTS: Dict[str, Dict[str, bool]] = {
    "on_roll": {k: True for k in FEATURE_KEYS},
    "off_roll_consultant": {
        "payroll": False, "pf_esic": False, "loans": False, "insurance": False,
        "leave": False, "comp_off": False, "shifts": False,
        "attendance": True, "timesheet": True, "expenses": True,
        "assets": True, "helpdesk": True, "policies": True, "kb": True, "letters": False,
        "performance": False, "learning": True, "referral": False,
        "idea_factory": True,
    },
    "off_roll_contractor": {
        "payroll": False, "pf_esic": False, "loans": False, "insurance": False,
        "leave": False, "comp_off": False, "shifts": True,
        "attendance": True, "timesheet": True, "expenses": False,
        "assets": True, "helpdesk": True, "policies": True, "kb": True, "letters": False,
        "performance": False, "learning": False, "referral": False,
        "idea_factory": False,
    },
    "intern": {
        "payroll": True, "pf_esic": False, "loans": False, "insurance": False,
        "leave": True, "comp_off": False, "shifts": True,
        "attendance": True, "timesheet": True, "expenses": True,
        "assets": True, "helpdesk": True, "policies": True, "kb": True, "letters": True,
        "performance": True, "learning": True, "referral": False,
        "idea_factory": True,
    },
}


def default_matrix() -> Dict[str, Dict[str, bool]]:
    """Return a deep copy of the default permission matrix."""
    return {cls: dict(perms) for cls, perms in DEFAULTS.items()}


def _normalize(matrix: dict) -> Dict[str, Dict[str, bool]]:
    """Ensure every class has every feature key. Missing keys fall back to True (conservative)."""
    out = {}
    for cls in CLASS_KEYS:
        row = dict(DEFAULTS[cls])
        if isinstance(matrix.get(cls), dict):
            for k in FEATURE_KEYS:
                if k in matrix[cls]:
                    row[k] = bool(matrix[cls][k])
        out[cls] = row
    return out


async def get_effective_matrix(db, company_id: str) -> Dict[str, Dict[str, bool]]:
    """Return the full per-class × per-feature matrix for a company, defaults + overrides."""
    doc = await db.employment_class_permissions.find_one({"company_id": company_id}, {"_id": 0})
    if not doc:
        return default_matrix()
    return _normalize(doc.get("matrix") or {})


async def is_feature_allowed(db, company_id: str, employment_class: str, feature_key: str) -> bool:
    """Single-feature gate. Default True for on-roll & unknown feature keys (conservative)."""
    if employment_class not in CLASS_KEYS:
        employment_class = "on_roll"
    if feature_key not in FEATURE_KEYS:
        return True
    matrix = await get_effective_matrix(db, company_id)
    return matrix.get(employment_class, {}).get(feature_key, True)


async def get_permissions_for(db, company_id: str, employment_class: str) -> Dict[str, bool]:
    """Return permissions for one class as flat dict."""
    matrix = await get_effective_matrix(db, company_id)
    if employment_class not in CLASS_KEYS:
        employment_class = "on_roll"
    return matrix[employment_class]
