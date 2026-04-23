"""MongoDB client, indexes, and seed data for HRMS SaaS."""
from __future__ import annotations

import os
import logging
from datetime import datetime, timezone
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from auth import hash_password, verify_password
from models import uid, now_iso

log = logging.getLogger("db")

_client: Optional[AsyncIOMotorClient] = None
_db: Optional[AsyncIOMotorDatabase] = None


def init_db() -> AsyncIOMotorDatabase:
    global _client, _db
    if _db is None:
        _client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        _db = _client[os.environ["DB_NAME"]]
    return _db


def get_db() -> AsyncIOMotorDatabase:
    if _db is None:
        return init_db()
    return _db


async def ensure_indexes() -> None:
    db = get_db()
    await db.users.create_index("email", unique=True)
    await db.users.create_index("company_id")
    await db.users.create_index("reseller_id")
    await db.users.create_index("id", unique=True)
    await db.resellers.create_index("id", unique=True)
    await db.companies.create_index("id", unique=True)
    await db.companies.create_index("reseller_id")
    await db.employees.create_index("id", unique=True)
    await db.employees.create_index("company_id")
    await db.employees.create_index("employee_code")
    await db.employees.create_index("manager_id")
    await db.approval_requests.create_index("company_id")
    await db.approval_requests.create_index("requester_user_id")
    await db.approval_requests.create_index("status")
    await db.leave_requests.create_index("company_id")
    await db.attendance.create_index([("company_id", 1), ("employee_id", 1), ("date", 1)])
    await db.product_service_requests.create_index("company_id")
    await db.vendors.create_index("company_id")
    await db.approval_workflows.create_index([("company_id", 1), ("request_type", 1), ("is_active", 1)])
    await db.company_modules.create_index([("company_id", 1), ("module_id", 1)], unique=True)
    await db.company_modules.create_index("status")
    await db.module_events.create_index([("company_id", 1), ("at", -1)])
    await db.module_activation_requests.create_index([("company_id", 1), ("status", 1)])
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.login_attempts.create_index("identifier")
    # Phase 1A — Employee lifecycle
    await db.employee_profiles.create_index("employee_id", unique=True)
    await db.employee_profiles.create_index("company_id")
    await db.employee_documents.create_index([("company_id", 1), ("employee_id", 1)])
    await db.employee_documents.create_index("category")
    await db.onboarding_templates.create_index([("company_id", 1), ("is_default", 1)])
    await db.onboardings.create_index([("company_id", 1), ("status", 1)])
    await db.onboardings.create_index("employee_id")
    await db.offboardings.create_index([("company_id", 1), ("status", 1)])
    await db.offboardings.create_index("employee_id")
    # Phase 1M — Knowledge Base
    await db.kb_articles.create_index("slug", unique=True)
    await db.kb_articles.create_index("category")
    await db.kb_articles.create_index("related_page")
    # Phase 1B — Leave
    await db.leave_types.create_index([("company_id", 1), ("code", 1)], unique=True)
    await db.leave_balances.create_index([("company_id", 1), ("employee_id", 1), ("leave_type_id", 1), ("year", 1)], unique=True)
    await db.holidays.create_index([("company_id", 1), ("date", 1)])
    await db.leave_adjustments_log.create_index([("company_id", 1), ("employee_id", 1)])
    # Phase 1C — Attendance
    await db.shifts.create_index([("company_id", 1), ("code", 1)], unique=True)
    await db.shift_assignments.create_index([("company_id", 1), ("employee_id", 1), ("from_date", -1)])
    await db.work_sites.create_index([("company_id", 1)])
    await db.regularizations.create_index([("company_id", 1), ("employee_id", 1), ("date", 1)])
    await db.overtime_requests.create_index([("company_id", 1), ("employee_id", 1), ("date", 1)])
    await db.timesheets.create_index([("company_id", 1), ("employee_id", 1), ("week_start", 1)], unique=True)
    await db.attendance.create_index([("company_id", 1), ("date", 1)])
    await db.attendance.create_index([("employee_id", 1), ("date", 1)])
    # Phase 1D — Notifications
    await db.notifications.create_index([("recipient_user_id", 1), ("created_at", -1)])
    await db.notifications.create_index([("recipient_user_id", 1), ("read", 1)])
    await db.notifications.create_index([("recipient_user_id", 1), ("dedup_key", 1)], unique=False, sparse=True)
    await db.notification_prefs.create_index("user_id", unique=True)
    # Phase 2A — Payroll foundation
    await db.salary_components.create_index([("company_id", 1), ("code", 1)], unique=True)
    await db.salary_structures.create_index([("company_id", 1)])
    await db.employee_salaries.create_index([("company_id", 1), ("employee_id", 1), ("is_current", 1)])
    await db.employee_salaries.create_index([("employee_id", 1), ("effective_from", -1)])


async def _upsert_user(email: str, password: str, name: str, role: str, company_id=None, reseller_id=None, employee_id=None) -> dict:
    db = get_db()
    existing = await db.users.find_one({"email": email})
    if existing is None:
        doc = {
            "id": uid(),
            "email": email,
            "password_hash": hash_password(password),
            "name": name,
            "role": role,
            "company_id": company_id,
            "reseller_id": reseller_id,
            "employee_id": employee_id,
            "is_active": True,
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        await db.users.insert_one(doc)
        return doc
    # update password if changed (idempotent)
    if not verify_password(password, existing["password_hash"]):
        await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(password)}})
    return existing


async def seed_demo_data() -> None:
    """Idempotent seed: super_admin, demo reseller, demo company (ACME), branches, employees."""
    db = get_db()

    # 1. Super admin
    await _upsert_user(
        email=os.environ.get("ADMIN_EMAIL", "admin@hrms.io"),
        password=os.environ.get("ADMIN_PASSWORD", "Admin@123"),
        name="Platform Admin",
        role="super_admin",
    )

    # 2. Demo Reseller
    reseller_email = os.environ.get("DEMO_RESELLER_EMAIL", "reseller@demo.io")
    reseller = await db.resellers.find_one({"contact_email": reseller_email})
    if reseller is None:
        reseller = {
            "id": uid(),
            "name": "Arlo Partners",
            "company_name": "Arlo Partners LLP",
            "contact_email": reseller_email,
            "phone": "+1-555-0100",
            "commission_rate": 0.20,
            "status": "active",
            "white_label": {"brand_color": "#2563EB"},
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        await db.resellers.insert_one(reseller)
    reseller_id = reseller["id"]

    await _upsert_user(
        email=reseller_email,
        password=os.environ.get("DEMO_RESELLER_PASSWORD", "Reseller@123"),
        name="Arlo Partners Admin",
        role="reseller",
        reseller_id=reseller_id,
    )

    # 3. Demo Company (ACME)
    company = await db.companies.find_one({"name": "ACME Global"})
    if company is None:
        company = {
            "id": uid(),
            "name": "ACME Global",
            "reseller_id": reseller_id,
            "plan": "enterprise",
            "status": "active",
            "industry": "Technology",
            "logo_url": None,
            "employee_count": 0,
            "region": "in-blr",          # data residency — Bengaluru for Indian DPDP
            "default_currency": "INR",   # multi-currency default
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        await db.companies.insert_one(company)
    company_id = company["id"]

    # 4. Regions / Countries / Branches / Departments
    async def _ensure(coll, filt, doc):
        existing = await db[coll].find_one(filt)
        if existing:
            return existing
        await db[coll].insert_one(doc)
        return doc

    apac = await _ensure("regions", {"company_id": company_id, "name": "APAC"},
                        {"id": uid(), "company_id": company_id, "name": "APAC", "head_user_id": None,
                         "created_at": now_iso(), "updated_at": now_iso()})
    emea = await _ensure("regions", {"company_id": company_id, "name": "EMEA"},
                        {"id": uid(), "company_id": company_id, "name": "EMEA", "head_user_id": None,
                         "created_at": now_iso(), "updated_at": now_iso()})

    india = await _ensure("countries", {"company_id": company_id, "name": "India"},
                         {"id": uid(), "company_id": company_id, "region_id": apac["id"], "name": "India",
                          "iso_code": "IN", "head_user_id": None, "created_at": now_iso(), "updated_at": now_iso()})
    uk = await _ensure("countries", {"company_id": company_id, "name": "United Kingdom"},
                      {"id": uid(), "company_id": company_id, "region_id": emea["id"], "name": "United Kingdom",
                       "iso_code": "GB", "head_user_id": None, "created_at": now_iso(), "updated_at": now_iso()})

    blr = await _ensure("branches", {"company_id": company_id, "name": "Bengaluru HQ"},
                       {"id": uid(), "company_id": company_id, "country_id": india["id"], "name": "Bengaluru HQ",
                        "city": "Bengaluru", "address": "Koramangala, BLR", "manager_user_id": None,
                        "created_at": now_iso(), "updated_at": now_iso()})
    lon = await _ensure("branches", {"company_id": company_id, "name": "London Office"},
                       {"id": uid(), "company_id": company_id, "country_id": uk["id"], "name": "London Office",
                        "city": "London", "address": "Shoreditch, London", "manager_user_id": None,
                        "created_at": now_iso(), "updated_at": now_iso()})

    eng = await _ensure("departments", {"company_id": company_id, "name": "Engineering"},
                       {"id": uid(), "company_id": company_id, "branch_id": blr["id"], "name": "Engineering",
                        "head_user_id": None, "created_at": now_iso(), "updated_at": now_iso()})
    sales = await _ensure("departments", {"company_id": company_id, "name": "Sales"},
                         {"id": uid(), "company_id": company_id, "branch_id": lon["id"], "name": "Sales",
                          "head_user_id": None, "created_at": now_iso(), "updated_at": now_iso()})

    # 5. HR admin user + Manager + Employee (with employee records)
    hr_user = await _upsert_user(
        email=os.environ.get("DEMO_HR_EMAIL", "hr@acme.io"),
        password=os.environ.get("DEMO_HR_PASSWORD", "Hr@12345"),
        name="Priya Sharma",
        role="company_admin",
        company_id=company_id,
    )

    # Create manager employee record
    mgr_emp = await db.employees.find_one({"company_id": company_id, "email": os.environ.get("DEMO_MANAGER_EMAIL", "manager@acme.io")})
    if mgr_emp is None:
        mgr_emp = {
            "id": uid(),
            "company_id": company_id,
            "user_id": None,
            "employee_code": "ACME-001",
            "name": "Rahul Verma",
            "email": os.environ.get("DEMO_MANAGER_EMAIL", "manager@acme.io"),
            "phone": "+91-9876543210",
            "employee_type": "hybrid",
            "region_id": apac["id"],
            "country_id": india["id"],
            "branch_id": blr["id"],
            "department_id": eng["id"],
            "job_title": "Engineering Manager",
            "manager_id": None,
            "role_in_company": "branch_manager",
            "joined_on": now_iso(),
            "status": "active",
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        await db.employees.insert_one(mgr_emp)
    mgr_user = await _upsert_user(
        email=os.environ.get("DEMO_MANAGER_EMAIL", "manager@acme.io"),
        password=os.environ.get("DEMO_MANAGER_PASSWORD", "Manager@123"),
        name=mgr_emp["name"],
        role="branch_manager",
        company_id=company_id,
        employee_id=mgr_emp["id"],
    )
    await db.employees.update_one({"id": mgr_emp["id"]}, {"$set": {"user_id": mgr_user["id"]}})

    # Create employee record
    emp_doc = await db.employees.find_one({"company_id": company_id, "email": os.environ.get("DEMO_EMPLOYEE_EMAIL", "employee@acme.io")})
    if emp_doc is None:
        emp_doc = {
            "id": uid(),
            "company_id": company_id,
            "user_id": None,
            "employee_code": "ACME-002",
            "name": "Aisha Khan",
            "email": os.environ.get("DEMO_EMPLOYEE_EMAIL", "employee@acme.io"),
            "phone": "+91-9812345678",
            "employee_type": "wfh",
            "region_id": apac["id"],
            "country_id": india["id"],
            "branch_id": blr["id"],
            "department_id": eng["id"],
            "job_title": "Senior Software Engineer",
            "manager_id": mgr_emp["id"],
            "role_in_company": "employee",
            "joined_on": now_iso(),
            "status": "active",
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        await db.employees.insert_one(emp_doc)
    emp_user = await _upsert_user(
        email=os.environ.get("DEMO_EMPLOYEE_EMAIL", "employee@acme.io"),
        password=os.environ.get("DEMO_EMPLOYEE_PASSWORD", "Employee@123"),
        name=emp_doc["name"],
        role="employee",
        company_id=company_id,
        employee_id=emp_doc["id"],
    )
    await db.employees.update_one({"id": emp_doc["id"]}, {"$set": {"user_id": emp_user["id"]}})

    # Additional sample employees for directory density
    sample_employees = [
        ("ACME-003", "James Carter", "james@acme.io", "wfo", "Sales Lead", lon["id"], uk["id"], emea["id"], sales["id"], "sub_manager"),
        ("ACME-004", "Sofia Rossi", "sofia@acme.io", "field", "Field Sales Exec", lon["id"], uk["id"], emea["id"], sales["id"], "employee"),
        ("ACME-005", "Noah Chen", "noah@acme.io", "hybrid", "Backend Engineer", blr["id"], india["id"], apac["id"], eng["id"], "employee"),
        ("ACME-006", "Yuki Tanaka", "yuki@acme.io", "wfh", "Product Designer", blr["id"], india["id"], apac["id"], eng["id"], "employee"),
    ]
    for code, name, mail, etype, title, br, co, rg, dp, role in sample_employees:
        if not await db.employees.find_one({"company_id": company_id, "employee_code": code}):
            await db.employees.insert_one({
                "id": uid(), "company_id": company_id, "user_id": None, "employee_code": code,
                "name": name, "email": mail, "phone": None, "employee_type": etype,
                "region_id": rg, "country_id": co, "branch_id": br, "department_id": dp,
                "job_title": title, "manager_id": mgr_emp["id"], "role_in_company": role,
                "joined_on": now_iso(), "status": "active",
                "created_at": now_iso(), "updated_at": now_iso(),
            })

    # update company employee_count
    count = await db.employees.count_documents({"company_id": company_id})
    await db.companies.update_one({"id": company_id}, {"$set": {"employee_count": count}})

    # Sample vendor
    if not await db.vendors.find_one({"company_id": company_id, "name": "OfficeMart Supplies"}):
        await db.vendors.insert_one({
            "id": uid(), "company_id": company_id, "name": "OfficeMart Supplies",
            "category": "Office Equipment", "contact_email": "sales@officemart.io",
            "phone": "+91-9000000000", "country_id": india["id"], "status": "active",
            "created_at": now_iso(), "updated_at": now_iso(),
        })

    # 6. Sample configurable approval workflows
    async def _ensure_wf(name, doc):
        if await db.approval_workflows.find_one({"company_id": company_id, "name": name}):
            return
        full = {**doc, "id": uid(), "company_id": company_id, "name": name,
                "created_at": now_iso(), "updated_at": now_iso()}
        await db.approval_workflows.insert_one(full)

    def _s(order, resolver, label, role=None, user_id=None, condition_min_cost=None):
        return {"order": order, "resolver": resolver, "label": label,
                "role": role, "user_id": user_id, "user_name": None,
                "condition_min_cost": condition_min_cost}

    # Product/Service workflows
    await _ensure_wf("Computer purchase — 5 levels", {
        "request_type": "product_service",
        "match_item_category": "computer",
        "match_leave_type": None,
        "match_min_cost": None, "match_max_cost": None,
        "match_min_days": None, "match_max_days": None,
        "match_branch_id": None, "priority": 100, "is_active": True,
        "steps": [
            _s(1, "manager", "Direct Manager"),
            _s(2, "department_head", "Department Head"),
            _s(3, "branch_manager", "Branch Manager"),
            _s(4, "role", "Country Head (IT)", role="country_head"),
            _s(5, "company_admin", "HR / Finance Sign-off"),
        ],
    })

    await _ensure_wf("Stationery — 2 levels", {
        "request_type": "product_service",
        "match_item_category": "stationery",
        "match_leave_type": None,
        "match_min_cost": None, "match_max_cost": None,
        "match_min_days": None, "match_max_days": None,
        "match_branch_id": None, "priority": 100, "is_active": True,
        "steps": [
            _s(1, "manager", "Direct Manager"),
            _s(2, "company_admin", "Admin / Ops"),
        ],
    })

    await _ensure_wf("High-value service >$5k — 4 levels", {
        "request_type": "product_service",
        "match_item_category": None,
        "match_leave_type": None,
        "match_min_cost": 5000, "match_max_cost": None,
        "match_min_days": None, "match_max_days": None,
        "match_branch_id": None, "priority": 60, "is_active": True,
        "steps": [
            _s(1, "manager", "Direct Manager"),
            _s(2, "department_head", "Department Head"),
            _s(3, "branch_manager", "Branch Manager"),
            _s(4, "company_admin", "Finance Sign-off"),
        ],
    })

    # Leave workflows
    await _ensure_wf("Casual leave ≤3d — manager only", {
        "request_type": "leave",
        "match_item_category": None,
        "match_leave_type": "cl",
        "match_min_cost": None, "match_max_cost": None,
        "match_min_days": None, "match_max_days": 3,
        "match_branch_id": None, "priority": 100, "is_active": True,
        "steps": [_s(1, "manager", "Direct Manager")],
    })

    await _ensure_wf("Unpaid leave — 3 levels", {
        "request_type": "leave",
        "match_item_category": None,
        "match_leave_type": "lop",
        "match_min_cost": None, "match_max_cost": None,
        "match_min_days": None, "match_max_days": None,
        "match_branch_id": None, "priority": 100, "is_active": True,
        "steps": [
            _s(1, "manager", "Direct Manager"),
            _s(2, "department_head", "Department Head"),
            _s(3, "company_admin", "HR Admin"),
        ],
    })

    log.info("Seed completed. Company=%s employees=%s", company_id, count)

    # 7. Seed module entitlements for ACME (base_hrms always on; procurement as active demo)
    async def _ensure_mod(module_id, status="active", amount=None, price_source="retail"):
        existing = await db.company_modules.find_one({"company_id": company_id, "module_id": module_id})
        if existing:
            return
        from modules_catalog import MODULES
        mod = MODULES.get(module_id)
        if not mod:
            return
        await db.company_modules.insert_one({
            "id": uid(), "company_id": company_id, "module_id": module_id,
            "status": status, "activated_at": now_iso(), "activated_by": None,
            "trial_until": None,
            "effective_amount": amount if amount is not None else mod["retail_price"],
            "effective_currency": "INR", "price_source": price_source,
            "created_at": now_iso(), "updated_at": now_iso(),
        })

    await _ensure_mod("base_hrms", status="active", price_source="included")
    await _ensure_mod("procurement", status="active")
    await _ensure_mod("onboarding", status="active")
    await _ensure_mod("payroll", status="active")
    log.info("Module entitlements seeded for company=%s", company_id)

    # 8. Seed default onboarding template for ACME (idempotent)
    existing_tpl = await db.onboarding_templates.find_one({"company_id": company_id, "is_default": True})
    if not existing_tpl:
        from models_profile import OnboardingTemplate, OnboardingTaskTemplate
        default_tasks = [
            OnboardingTaskTemplate(stage="pre_joining", title="Send offer letter & joining kit", assignee="hr", due_days_from_doj=-7),
            OnboardingTaskTemplate(stage="pre_joining", title="Collect KYC documents (PAN, Aadhaar, Passport)", assignee="hr", due_days_from_doj=-3),
            OnboardingTaskTemplate(stage="pre_joining", title="Provision laptop & accessories", assignee="it", due_days_from_doj=-1),
            OnboardingTaskTemplate(stage="day_1", title="Welcome & office tour", assignee="hr", due_days_from_doj=0),
            OnboardingTaskTemplate(stage="day_1", title="Create email & system accounts", assignee="it", due_days_from_doj=0),
            OnboardingTaskTemplate(stage="day_1", title="Assign ID card & desk", assignee="admin", due_days_from_doj=0),
            OnboardingTaskTemplate(stage="day_1", title="Submit statutory forms (PF, ESIC, Form 2)", assignee="hr", due_days_from_doj=1),
            OnboardingTaskTemplate(stage="week_1", title="Meet direct team & manager 1:1", assignee="manager", due_days_from_doj=3),
            OnboardingTaskTemplate(stage="week_1", title="Policy handbook & compliance training", assignee="hr", due_days_from_doj=5),
            OnboardingTaskTemplate(stage="month_1", title="30-day check-in with HR", assignee="hr", due_days_from_doj=30),
            OnboardingTaskTemplate(stage="month_1", title="First month goals finalized with manager", assignee="manager", due_days_from_doj=30),
            OnboardingTaskTemplate(stage="probation", title="Probation review & confirmation", assignee="hr", due_days_from_doj=180),
        ]
        tpl = OnboardingTemplate(
            company_id=company_id,
            name="Standard India Onboarding",
            description="Default onboarding template with India statutory compliance (PF, ESIC, Form 2).",
            is_default=True,
            tasks=default_tasks,
        ).model_dump()
        await db.onboarding_templates.insert_one(tpl)
        log.info("Default onboarding template seeded for company=%s", company_id)

    # 9. Seed KB articles (platform-wide, idempotent)
    from kb_seed import seed_kb_articles
    inserted = await seed_kb_articles(db)
    if inserted:
        log.info("Seeded %d knowledge base articles", inserted)

    # 10. Seed leave types + India 2026 holidays for ACME (idempotent)
    from leave_seed import seed_leave_types_and_holidays
    lt, h = await seed_leave_types_and_holidays(db, company_id)
    if lt or h:
        log.info("Seeded %d leave types + %d holidays for company=%s", lt, h, company_id)

    # 11. Seed default shifts for ACME (idempotent)
    from models_attendance import Shift
    default_shifts = [
        {"name": "General 9–6", "code": "GEN", "category": "general",
         "start_time": "09:00", "end_time": "18:00", "break_minutes": 60,
         "grace_minutes": 15, "is_default": True, "color": "#0ea5e9", "sort_order": 10},
        {"name": "Morning 6–3", "code": "MORN", "category": "morning",
         "start_time": "06:00", "end_time": "15:00", "break_minutes": 45,
         "grace_minutes": 10, "color": "#f59e0b", "sort_order": 20},
        {"name": "Afternoon 2–11", "code": "AFT", "category": "afternoon",
         "start_time": "14:00", "end_time": "23:00", "break_minutes": 45,
         "grace_minutes": 15, "color": "#8b5cf6", "sort_order": 30},
        {"name": "Night 10pm–7am", "code": "NIGHT", "category": "night",
         "start_time": "22:00", "end_time": "07:00", "break_minutes": 45,
         "grace_minutes": 10, "is_overnight": True, "color": "#1e40af", "sort_order": 40},
        {"name": "Flexible (any 9h)", "code": "FLEX", "category": "flexible",
         "start_time": "08:00", "end_time": "20:00", "break_minutes": 60,
         "grace_minutes": 60, "color": "#10b981", "sort_order": 50},
    ]
    existing_codes = {s["code"] async for s in db.shifts.find({"company_id": company_id}, {"_id": 0, "code": 1})}
    s_inserted = 0
    for sdef in default_shifts:
        if sdef["code"] in existing_codes:
            continue
        doc = Shift(company_id=company_id, **sdef).model_dump()
        await db.shifts.insert_one(doc)
        s_inserted += 1
    if s_inserted:
        log.info("Seeded %d default shifts for company=%s", s_inserted, company_id)

    # 12. Seed default salary components + structures for ACME (idempotent)
    from payroll_seed import seed_payroll_components
    c_ins, st_ins = await seed_payroll_components(db, company_id)
    if c_ins or st_ins:
        log.info("Seeded %d salary components + %d structures for company=%s", c_ins, st_ins, company_id)
