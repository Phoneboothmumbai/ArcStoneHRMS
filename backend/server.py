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

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
