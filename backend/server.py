"""Main HRMS SaaS FastAPI app."""
from dotenv import load_dotenv
from pathlib import Path

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

from db import init_db, ensure_indexes, seed_demo_data, get_db
from routers.auth_routes import router as auth_router
from routers.resellers_routes import router as resellers_router
from routers.companies_routes import router as companies_router
from routers.org_routes import router as org_router
from routers.employees_routes import router as employees_router
from routers.approvals_routes import router as approvals_router
from routers.leave_routes import router as leave_router
from routers.attendance_routes import router as attendance_router
from routers.requests_routes import router as requests_router, vendors_router
from routers.dashboard_routes import router as dashboard_router
from routers.workflows_routes import router as workflows_router
from routers.modules_routes import router as modules_router
from routers.tenant_routes import router as tenant_router
from routers.profile_routes import router as profile_router
from routers.documents_routes import router as documents_router
from routers.onboarding_routes import router as onboarding_router
from routers.offboarding_routes import router as offboarding_router
from routers.kb_routes import router as kb_router
from routers.leave_admin_routes import (
    router as leave_admin_router, public as leave_types_router,
    holidays_router, balances_router as leave_balances_router,
)
from routers.attendance_admin_routes import (
    shifts_router, assignments_router, worksites_router,
    reg_router, ot_router, ts_router,
)
from routers.notifications_routes import router as notifications_router
from routers.payroll_routes import (
    components_router as salary_components_router,
    structures_router as salary_structures_router,
    comp_router as compensation_router,
)
from routers.payroll_run_routes import runs_router as payroll_runs_router, payslips_router
from routers.statutory_routes import decl_router as declarations_router, exp_router as payroll_exports_router
from routers.fnf_routes import loans_router, fnf_router
from routers.policy_routes import policies_router, settings_router as company_settings_router
from routers.letters_routes import tmpl_router as letter_templates_router, letters_router
from routers.assets_routes import assets_router, assignments_router as asset_assignments_router
from routers.expenses_routes import expenses_router, travel_router
from routers.performance_routes import (
    cycles_router as review_cycles_router,
    goals_router as performance_goals_router,
    reviews_router as performance_reviews_router,
    ninebox_router as performance_ninebox_router,
    pips_router as performance_pips_router,
)
from routers.ats_routes import (
    reqs_router as ats_reqs_router,
    cand_router as ats_candidates_router,
    iv_router as ats_interviews_router,
    offers_router as ats_offers_router,
    careers_router as ats_careers_router,
)
from routers.reports_routes import router as reports_router
from routers.helpdesk_routes import (
    cats_router as ticket_categories_router,
    tickets_router as tickets_router,
    posh_router as posh_router,
)
from routers.procurement_routes import (
    vendors_router as procurement_vendors_router,
    rfq_router as procurement_rfq_router,
    po_router as procurement_po_router,
    portal_router as procurement_portal_router,
)
from routers.demo_data_routes import router as demo_data_router
from routers.lifecycle_routes import router as lifecycle_router
from routers.employee_self_service import (
    loan_req_router as ess_loan_router,
    insurance_router as ess_insurance_router,
)
from routers.statutory_compliance import (
    router as lwf_router,
    bulletin_router as compliance_bulletin_router,
)
from routers.public_routes import router as public_router
from routers.mobile_routes import router as mobile_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
log = logging.getLogger("hrms")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    await ensure_indexes()
    await seed_demo_data()
    log.info("HRMS backend ready")
    yield


app = FastAPI(title="HRMS SaaS API", lifespan=lifespan)

# Health
health_router = APIRouter(prefix="/api", tags=["health"])


@health_router.get("/")
async def root():
    return {"service": "hrms-saas", "status": "ok"}


@health_router.get("/health")
async def health():
    return {"ok": True}


app.include_router(health_router)
app.include_router(auth_router)
app.include_router(resellers_router)
app.include_router(companies_router)
app.include_router(org_router)
app.include_router(employees_router)
app.include_router(approvals_router)
app.include_router(leave_router)
app.include_router(attendance_router)
app.include_router(requests_router)
app.include_router(vendors_router)
app.include_router(dashboard_router)
app.include_router(workflows_router)
app.include_router(modules_router)
app.include_router(tenant_router)
app.include_router(profile_router)
app.include_router(documents_router)
app.include_router(onboarding_router)
app.include_router(offboarding_router)
app.include_router(kb_router)
app.include_router(leave_admin_router)
app.include_router(leave_types_router)
app.include_router(holidays_router)
app.include_router(leave_balances_router)
app.include_router(shifts_router)
app.include_router(assignments_router)
app.include_router(worksites_router)
app.include_router(reg_router)
app.include_router(ot_router)
app.include_router(ts_router)
app.include_router(notifications_router)
app.include_router(salary_components_router)
app.include_router(salary_structures_router)
app.include_router(compensation_router)
app.include_router(payroll_runs_router)
app.include_router(payslips_router)
app.include_router(declarations_router)
app.include_router(payroll_exports_router)
app.include_router(loans_router)
app.include_router(fnf_router)
app.include_router(policies_router)
app.include_router(company_settings_router)
app.include_router(letter_templates_router)
app.include_router(letters_router)
app.include_router(assets_router)
app.include_router(asset_assignments_router)
app.include_router(expenses_router)
app.include_router(travel_router)
app.include_router(review_cycles_router)
app.include_router(performance_goals_router)
app.include_router(performance_reviews_router)
app.include_router(performance_ninebox_router)
app.include_router(performance_pips_router)
app.include_router(ats_reqs_router)
app.include_router(ats_candidates_router)
app.include_router(ats_interviews_router)
app.include_router(ats_offers_router)
app.include_router(ats_careers_router)
app.include_router(reports_router)
app.include_router(ticket_categories_router)
app.include_router(tickets_router)
app.include_router(posh_router)
app.include_router(procurement_vendors_router)
app.include_router(procurement_rfq_router)
app.include_router(procurement_po_router)
app.include_router(procurement_portal_router)
app.include_router(demo_data_router)
app.include_router(lifecycle_router)
app.include_router(ess_loan_router)
app.include_router(ess_insurance_router)
app.include_router(lwf_router)
app.include_router(compliance_bulletin_router)
app.include_router(public_router)
app.include_router(mobile_router)

# SpineHR-aligned modules
from routers.resource_booking_routes import resources_router, bookings_router as resource_bookings_router
from routers.visitors_routes import router as visitors_router
from routers.live_tracking_routes import router as live_tracking_router
app.include_router(resources_router)
app.include_router(resource_bookings_router)
app.include_router(visitors_router)
app.include_router(live_tracking_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
