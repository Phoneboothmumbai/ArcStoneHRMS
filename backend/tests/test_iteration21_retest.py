"""Iteration 21 retest of the 4 specific fixes from iteration_20.json:

1. POST /api/comp-off/credits/{id}/approve was 500 → expect 200
2. POST /api/comp-off/credits/{id}/reject → 200
3. GET /api/declarations/me with admin (no employee_id) was 400 → 200 placeholder
4. Bulk-import dry-run with valid CSV including ctc_annual → 200
"""
import os
import io
import uuid
from datetime import date, timedelta

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://people-partner-cloud.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@hrms.io", "password": "Admin@123"}
HR = {"email": "hr@acme.io", "password": "Hr@12345"}
EMP = {"email": "employee@acme.io", "password": "Employee@123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text}"
    j = r.json()
    return j.get("access_token") or j.get("token")


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def hr_token():
    return _login(HR)


@pytest.fixture(scope="module")
def emp_token():
    return _login(EMP)


# ---------- Fix #1: comp-off approve previously 500 ----------
class TestCompOffApprove:
    def test_request_then_approve(self, emp_token, hr_token):
        # Use a unique past date in the last 60 days to avoid duplicate-409s on reruns
        offset = (uuid.uuid4().int % 50) + 5
        work_date = (date.today() - timedelta(days=offset)).isoformat()
        body = {"work_date": work_date, "days": 1.0, "reason": f"TEST_iter21_retest {uuid.uuid4().hex[:6]}"}
        r = requests.post(f"{API}/comp-off/credits", json=body, headers=_hdr(emp_token), timeout=30)
        assert r.status_code in (200, 201), f"create failed: {r.status_code} {r.text}"
        cid = r.json()["id"]
        assert r.json()["status"] == "pending"

        # Now approve as HR (company_admin role)
        ra = requests.post(f"{API}/comp-off/credits/{cid}/approve", headers=_hdr(hr_token), timeout=30)
        assert ra.status_code == 200, f"approve broken: {ra.status_code} {ra.text}"
        data = ra.json()
        assert data.get("ok") is True
        assert "balance_id" in data
        assert data.get("days_credited") == 1.0

    def test_request_then_reject(self, emp_token, hr_token):
        offset = (uuid.uuid4().int % 50) + 60
        work_date = (date.today() - timedelta(days=offset)).isoformat()
        body = {"work_date": work_date, "days": 0.5, "reason": f"TEST_iter21_reject {uuid.uuid4().hex[:6]}"}
        r = requests.post(f"{API}/comp-off/credits", json=body, headers=_hdr(emp_token), timeout=30)
        assert r.status_code in (200, 201), f"create failed: {r.status_code} {r.text}"
        cid = r.json()["id"]

        rj = requests.post(f"{API}/comp-off/credits/{cid}/reject", headers=_hdr(hr_token), timeout=30)
        assert rj.status_code == 200, f"reject broken: {rj.status_code} {rj.text}"
        assert rj.json().get("ok") is True


# ---------- Fix #3: GET /api/declarations/me for admin without employee_id ----------
class TestDeclarationsMe:
    def test_admin_without_employee_id_gets_placeholder(self, admin_token):
        r = requests.get(f"{API}/declarations/me", headers=_hdr(admin_token), timeout=30)
        # Was 400 before, must be 200 now with placeholder
        assert r.status_code == 200, f"expected 200 got {r.status_code} {r.text}"
        data = r.json()
        assert data.get("status") == "draft"
        assert data.get("items") == []
        assert "financial_year" in data

    def test_admin_with_explicit_fy(self, admin_token):
        r = requests.get(f"{API}/declarations/me?financial_year=2026-2027",
                         headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200, f"expected 200 got {r.status_code} {r.text}"
        assert r.json().get("financial_year") == "2026-2027"

    def test_employee_with_employee_id_gets_draft(self, emp_token):
        r = requests.get(f"{API}/declarations/me?financial_year=2026-2027",
                         headers=_hdr(emp_token), timeout=30)
        assert r.status_code == 200, f"expected 200 got {r.status_code} {r.text}"
        data = r.json()
        assert data.get("financial_year") == "2026-2027"
        assert "items" in data


# ---------- Fix #4: Bulk-import dry-run with ctc_annual ----------
class TestBulkImportTemplate:
    def test_dry_run_with_ctc_annual(self, hr_token):
        csv = (
            "email,name,employee_code,designation,department,branch_code,employee_type,phone,date_of_joining,ctc_annual,manager_email\n"
            f"TEST_iter21_{uuid.uuid4().hex[:6]}@example.com,TEST Iter21 User,EMP-T21-001,Engineer,Engineering,BLR-HQ,wfo,+91-9999900099,2026-04-01,2400000,manager@acme.io\n"
        )
        files = {"file": ("test.csv", io.BytesIO(csv.encode()), "text/csv")}
        r = requests.post(f"{API}/employees/bulk-import/dry-run",
                          files=files, headers=_hdr(hr_token), timeout=60)
        assert r.status_code == 200, f"dry-run failed: {r.status_code} {r.text}"
        data = r.json()
        # Should not error on ctc_annual column
        errors = data.get("errors", [])
        ctc_errors = [e for e in errors if "ctc" in str(e).lower()]
        assert not ctc_errors, f"ctc_annual rejected: {ctc_errors}"
