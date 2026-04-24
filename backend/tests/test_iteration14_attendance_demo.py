"""Iteration 14: tests for AttendanceAdmin live-board, register, and demo seeder endpoints."""
import os
import time
from datetime import date

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or "https://people-partner-cloud.preview.emergentagent.com"
HR_EMAIL = "hr@acme.io"
HR_PASS = "Hr@12345"
EMP_EMAIL = "employee@acme.io"
EMP_PASS = "Employee@123"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def hr_token():
    return _login(HR_EMAIL, HR_PASS)


@pytest.fixture(scope="module")
def emp_token():
    return _login(EMP_EMAIL, EMP_PASS)


def H(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# --- Live Board ---

class TestLiveBoard:
    def test_live_board_default_today(self, hr_token):
        r = requests.get(f"{BASE_URL}/api/attendance/live-board", headers=H(hr_token), timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "date" in data and "counts" in data and "rows" in data
        for key in ["present", "late", "absent", "on_leave", "holiday", "week_off", "wfh", "half_day"]:
            assert key in data["counts"], f"missing count key {key}"
        assert isinstance(data["rows"], list)
        if data["rows"]:
            r0 = data["rows"][0]
            for k in ["employee_name", "employee_code", "status", "check_in", "check_out",
                      "hours", "is_late", "leave_type", "employee_type", "job_title", "department_name"]:
                assert k in r0, f"row missing field {k}"

    def test_live_board_specific_date(self, hr_token):
        today = date.today().isoformat()
        r = requests.get(f"{BASE_URL}/api/attendance/live-board?on_date={today}", headers=H(hr_token), timeout=30)
        assert r.status_code == 200
        assert r.json()["date"] == today

    def test_live_board_invalid_date(self, hr_token):
        r = requests.get(f"{BASE_URL}/api/attendance/live-board?on_date=bad-date", headers=H(hr_token), timeout=30)
        assert r.status_code == 400

    def test_live_board_forbidden_for_employee(self, emp_token):
        r = requests.get(f"{BASE_URL}/api/attendance/live-board", headers=H(emp_token), timeout=30)
        assert r.status_code == 403, f"Expected 403 for employee but got {r.status_code} {r.text}"


# --- Monthly Register ---

class TestRegister:
    def test_register_returns_grid(self, hr_token):
        month = date.today().strftime("%Y-%m")
        r = requests.get(f"{BASE_URL}/api/attendance/register?month={month}", headers=H(hr_token), timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["month"] == month
        assert isinstance(data["dates"], list) and len(data["dates"]) >= 28
        assert isinstance(data["rows"], list)
        if data["rows"]:
            row = data["rows"][0]
            assert "employee_id" in row and "employee_name" in row and "employee_code" in row
            assert "days" in row and len(row["days"]) == len(data["dates"])
            assert "summary" in row
            for k in ["present", "absent", "leave", "holidays", "week_off", "half_day"]:
                assert k in row["summary"]
            codes = {d["code"] for d in row["days"]}
            valid = {"P", "P*", "HD", "A", "L", "H", "WO"}
            assert codes.issubset(valid), f"unexpected codes {codes - valid}"

    def test_register_missing_month(self, hr_token):
        r = requests.get(f"{BASE_URL}/api/attendance/register", headers=H(hr_token), timeout=30)
        assert r.status_code in (400, 422)


# --- Demo Seeder / Wipe ---

class TestDemoSeeder:
    def test_seed_requires_hr(self, emp_token):
        r = requests.post(f"{BASE_URL}/api/demo/seed-employees?count=2&years=1", headers=H(emp_token), timeout=30)
        assert r.status_code == 403

    def test_wipe_requires_hr(self, emp_token):
        r = requests.post(f"{BASE_URL}/api/demo/wipe-demo", headers=H(emp_token), timeout=30)
        assert r.status_code == 403

    def test_seed_small_then_live_board_has_demos(self, hr_token):
        # First, wipe (clean slate)
        wipe = requests.post(f"{BASE_URL}/api/demo/wipe-demo", headers=H(hr_token), timeout=60)
        assert wipe.status_code == 200

        t0 = time.time()
        r = requests.post(f"{BASE_URL}/api/demo/seed-employees?count=5&years=1&reset=false",
                          headers=H(hr_token), timeout=90)
        dur = time.time() - t0
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        stats = data["stats"]
        assert stats["employees"] == 5
        assert stats["attendance"] > 0
        assert stats["payslips"] > 0
        assert "login_hint" in data
        print(f"seed count=5 years=1 took {dur:.2f}s; stats={stats}")

        # live-board should reflect new employees
        lb = requests.get(f"{BASE_URL}/api/attendance/live-board", headers=H(hr_token), timeout=30)
        assert lb.status_code == 200
        rows = lb.json()["rows"]
        demo_rows = [r for r in rows if (r.get("employee_code") or "").startswith("DEMO")]
        assert len(demo_rows) >= 5, f"expected demo rows on live-board, got {len(demo_rows)}"

    def test_seed_idempotent_no_duplicate_key(self, hr_token):
        """Running seed twice with reset=false should NOT hit duplicate payslip key."""
        r = requests.post(f"{BASE_URL}/api/demo/seed-employees?count=3&years=1&reset=false",
                          headers=H(hr_token), timeout=90)
        assert r.status_code == 200, f"second seed crashed: {r.text}"
        assert r.json()["ok"] is True

    def test_seed_50x2_perf(self, hr_token):
        """50 employees × 2 years should complete in under 90s."""
        # Reset first
        wipe = requests.post(f"{BASE_URL}/api/demo/wipe-demo", headers=H(hr_token), timeout=60)
        assert wipe.status_code == 200
        t0 = time.time()
        r = requests.post(f"{BASE_URL}/api/demo/seed-employees?count=50&years=2&reset=false",
                          headers=H(hr_token), timeout=120)
        dur = time.time() - t0
        assert r.status_code == 200, r.text
        stats = r.json()["stats"]
        assert stats["employees"] == 50
        print(f"seed count=50 years=2 took {dur:.2f}s; stats={stats}")
        assert dur < 90, f"seed took too long: {dur:.2f}s"

    def test_wipe_cleans_up(self, hr_token):
        r = requests.post(f"{BASE_URL}/api/demo/wipe-demo", headers=H(hr_token), timeout=60)
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is True
        assert data["removed"] >= 0
        # Second wipe should return 0
        r2 = requests.post(f"{BASE_URL}/api/demo/wipe-demo", headers=H(hr_token), timeout=60)
        assert r2.status_code == 200
        assert r2.json()["removed"] == 0

    def test_seed_param_validation(self, hr_token):
        # count > 500 should fail
        r = requests.post(f"{BASE_URL}/api/demo/seed-employees?count=501&years=1",
                          headers=H(hr_token), timeout=30)
        assert r.status_code in (400, 422)
        # years > 5 should fail
        r = requests.post(f"{BASE_URL}/api/demo/seed-employees?count=5&years=10",
                          headers=H(hr_token), timeout=30)
        assert r.status_code in (400, 422)
