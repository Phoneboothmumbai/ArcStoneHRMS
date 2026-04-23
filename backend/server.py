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

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
