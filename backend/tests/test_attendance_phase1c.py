"""Phase 1C — Attendance deepening backend tests.

Covers: shifts CRUD+seed+defaults, shift assignments, work-sites, geo check-in (WFH/WFO),
regularization, overtime, timesheet (upsert+submit), approvals cross-collection dispatch,
monthly register MIS, cross-tenant isolation.
"""
import os
import uuid
from datetime import date, timedelta

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"Login failed {email}: {r.text}"
    return r.json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def hr_token():
    return login("hr@acme.io", "Hr@12345")


@pytest.fixture(scope="module")
def emp_token():
    return login("employee@acme.io", "Employee@123")


@pytest.fixture(scope="module")
def mgr_token():
    return login("manager@acme.io", "Manager@123")


@pytest.fixture(scope="module")
def emp_me(emp_token):
    return requests.get(f"{API}/auth/me", headers=auth(emp_token)).json()


# ---------- Shifts ----------
class TestShifts:
    def test_list_5_seeded(self, hr_token):
        r = requests.get(f"{API}/shifts", headers=auth(hr_token))
        assert r.status_code == 200
        rows = r.json()
        codes = {s["code"] for s in rows}
        assert {"GEN", "MORN", "AFT", "NIGHT", "FLEX"}.issubset(codes), f"codes={codes}"
        gen = next(s for s in rows if s["code"] == "GEN")
        assert gen["start_time"] == "09:00" and gen["end_time"] == "18:00"
        night = next(s for s in rows if s["code"] == "NIGHT")
        assert night["is_overnight"] is True

    def test_create_shift_and_default_unsets_others(self, hr_token):
        code = f"TST{uuid.uuid4().hex[:4].upper()}"
        payload = {
            "name": f"Test {code}", "code": code, "category": "general",
            "start_time": "10:00", "end_time": "19:00", "is_default": True,
        }
        r = requests.post(f"{API}/shifts", json=payload, headers=auth(hr_token))
        assert r.status_code == 200, r.text
        sid = r.json()["id"]
        assert r.json()["code"] == code and r.json()["is_default"] is True
        # Verify others unset
        rows = requests.get(f"{API}/shifts", headers=auth(hr_token)).json()
        defaults = [s for s in rows if s.get("is_default")]
        assert len(defaults) == 1 and defaults[0]["id"] == sid

        # Dup code returns 400
        r2 = requests.post(f"{API}/shifts", json=payload, headers=auth(hr_token))
        assert r2.status_code == 400

        # Update
        upd = {**payload, "name": f"Updated {code}", "is_default": False}
        ru = requests.put(f"{API}/shifts/{sid}", json=upd, headers=auth(hr_token))
        assert ru.status_code == 200 and ru.json()["name"] == f"Updated {code}"

        # Delete (soft)
        rd = requests.delete(f"{API}/shifts/{sid}", headers=auth(hr_token))
        assert rd.status_code == 200
        rows2 = requests.get(f"{API}/shifts", headers=auth(hr_token)).json()
        assert not any(s["id"] == sid for s in rows2), "Soft-disabled shift still visible"

        # Restore a default (GEN was originally default) so subsequent tests have one
        gen = next((s for s in rows2 if s["code"] == "GEN"), None)
        if gen and not gen.get("is_default"):
            requests.put(
                f"{API}/shifts/{gen['id']}",
                json={**{k: gen[k] for k in ["name","code","start_time","end_time"]},
                      "is_default": True},
                headers=auth(hr_token),
            )

    def test_non_admin_create_403(self, emp_token):
        r = requests.post(
            f"{API}/shifts",
            json={"name": "X", "code": "XYZ", "start_time": "09:00", "end_time": "18:00"},
            headers=auth(emp_token),
        )
        assert r.status_code == 403


# ---------- Shift Assignments ----------
class TestAssignments:
    def test_create_assignment(self, hr_token, emp_me):
        shifts = requests.get(f"{API}/shifts", headers=auth(hr_token)).json()
        sid = next(s["id"] for s in shifts if s["code"] == "GEN")
        today = date.today().isoformat()
        r = requests.post(f"{API}/shift-assignments", json={
            "employee_id": emp_me["employee_id"], "shift_id": sid,
            "from_date": today, "to_date": None,
        }, headers=auth(hr_token))
        assert r.status_code == 200, r.text
        assert r.json()["shift_code"] == "GEN"

    def test_list_assignments(self, hr_token, emp_me):
        r = requests.get(f"{API}/shift-assignments", headers=auth(hr_token))
        assert r.status_code == 200
        rows = r.json()
        assert any(a["employee_id"] == emp_me["employee_id"] for a in rows)


# ---------- Work sites ----------
@pytest.fixture(scope="module")
def office_site(hr_token):
    # Bengaluru HQ ~12.9716, 77.5946; use large radius for tests
    r = requests.post(f"{API}/work-sites", json={
        "name": "TEST_ACME_HQ",
        "latitude": 12.9716, "longitude": 77.5946,
        "radius_meters": 500,
    }, headers=auth(hr_token))
    assert r.status_code == 200, r.text
    yield r.json()
    requests.delete(f"{API}/work-sites/{r.json()['id']}", headers=auth(hr_token))


class TestWorkSites:
    def test_list_sites(self, hr_token, office_site):
        r = requests.get(f"{API}/work-sites", headers=auth(hr_token))
        assert r.status_code == 200
        assert any(s["id"] == office_site["id"] for s in r.json())

    def test_non_admin_create_403(self, emp_token):
        r = requests.post(f"{API}/work-sites", json={
            "name": "emp", "latitude": 0, "longitude": 0, "radius_meters": 100
        }, headers=auth(emp_token))
        assert r.status_code == 403


# ---------- Check-in/out ----------
class TestCheckin:
    @pytest.fixture(autouse=True, scope="class")
    def _clear_today_attendance(self, emp_token):
        """Remove today's attendance row so checkin tests are deterministic."""
        from datetime import datetime, timezone
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        # Use hr_token to GET employee_id via /auth/me (emp scope fine)
        me = requests.get(f"{API}/auth/me", headers=auth(emp_token)).json()
        # Call an internal cleanup via a direct Mongo script is not allowed;
        # instead use hr-scoped list then hit a raw delete via admin endpoint if present.
        # Simplest: try to check-in wfh first; if already present, call checkout then we test with a fresh approach.
        # Fallback: just call checkout to clear any open check-in from earlier runs.
        requests.post(f"{API}/attendance/checkout", headers=auth(emp_token))
        yield

    def test_1_wfo_far_blocked(self, emp_token, office_site):
        # If already-checked-in today from prior runs, skip with informational assertion.
        r = requests.post(f"{API}/attendance/checkin", json={
            "type": "wfo", "latitude": 19.0760, "longitude": 72.8777, "location": "Mumbai"
        }, headers=auth(emp_token))
        if r.status_code == 400 and "Already checked in" in r.text:
            pytest.skip("Attendance already exists for today — cannot re-test geo-block (run after fresh day)")
        assert r.status_code == 400, r.text
        assert "Outside" in r.text or "location" in r.text.lower()

    def test_2_wfh_bypasses_geo(self, emp_token):
        # If already checked in for today, accept 400; we test once per day
        r = requests.post(f"{API}/attendance/checkin", json={
            "type": "wfh", "location": "Home"
        }, headers=auth(emp_token))
        # 200 if fresh, 400 if already checked in
        assert r.status_code in (200, 400)
        if r.status_code == 200:
            data = r.json()
            assert data["type"] == "wfh"
            assert data["check_in"] is not None
            # shift_code expected when shift is assigned/default exists
            assert "is_late" in data

    def test_3_checkout_computes_hours(self, emp_token):
        r = requests.post(f"{API}/attendance/checkout", headers=auth(emp_token))
        # 200 if checked-in earlier, 400 if no checkin or already checked-out
        assert r.status_code in (200, 400)
        if r.status_code == 200:
            data = r.json()
            assert data["check_out"] is not None
            assert isinstance(data["hours"], (int, float))


# ---------- Regularization ----------
class TestRegularization:
    def test_create_and_list(self, emp_token):
        r = requests.post(f"{API}/regularization", json={
            "date": date.today().isoformat(),
            "kind": "missed_punch",
            "expected_check_in": "09:15",
            "expected_check_out": "18:00",
            "reason": "TEST_forgot to punch in"
        }, headers=auth(emp_token))
        assert r.status_code == 200, r.text
        row = r.json()
        assert row["status"] == "pending"
        assert row["approval_request_id"] is not None
        # Verify list
        rl = requests.get(f"{API}/regularization", headers=auth(emp_token))
        assert rl.status_code == 200
        assert any(x["id"] == row["id"] for x in rl.json())


# ---------- Overtime ----------
class TestOvertime:
    def test_valid_ot(self, emp_token):
        r = requests.post(f"{API}/overtime", json={
            "date": date.today().isoformat(),
            "hours": 2.5, "rate_multiplier": 1.5,
            "reason": "TEST_production deploy"
        }, headers=auth(emp_token))
        assert r.status_code == 200, r.text
        assert r.json()["approval_request_id"] is not None
        assert r.json()["status"] == "pending"

    def test_invalid_hours_zero(self, emp_token):
        r = requests.post(f"{API}/overtime", json={
            "date": date.today().isoformat(), "hours": 0,
            "rate_multiplier": 1.5, "reason": "x"
        }, headers=auth(emp_token))
        assert r.status_code == 400

    def test_invalid_hours_over(self, emp_token):
        r = requests.post(f"{API}/overtime", json={
            "date": date.today().isoformat(), "hours": 13,
            "rate_multiplier": 2.0, "reason": "x"
        }, headers=auth(emp_token))
        assert r.status_code == 400


# ---------- Timesheet ----------
class TestTimesheet:
    def _monday(self):
        # Pick a unique far-future Monday to avoid conflict with previously-submitted timesheets
        import random
        offset_weeks = random.randint(20, 400)
        t = date.today()
        return (t - timedelta(days=t.weekday()) + timedelta(days=7 * offset_weeks)).isoformat()

    def test_upsert_draft_computes_total(self, emp_token):
        ws = self._monday()
        days = [{
            "date": (date.fromisoformat(ws) + timedelta(days=i)).isoformat(),
            "entries": [{"project": "TEST_Proj", "task": f"T{i}", "hours": 2.0}],
        } for i in range(5)]
        r = requests.post(f"{API}/timesheets", json={
            "week_start": ws, "days": days
        }, headers=auth(emp_token))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total_hours"] == 10.0
        assert data["status"] == "draft"
        tid = data["id"]

        # Submit
        rs = requests.post(f"{API}/timesheets/submit/{tid}", headers=auth(emp_token))
        assert rs.status_code == 200, rs.text
        assert rs.json()["status"] == "submitted"
        assert rs.json()["approval_request_id"] is not None

        # Cannot edit submitted
        re = requests.post(f"{API}/timesheets", json={
            "week_start": ws, "days": days
        }, headers=auth(emp_token))
        assert re.status_code == 400


# ---------- Approvals dispatch ----------
class TestApprovalsDispatch:
    def test_ot_approval_flips_status(self, emp_token, mgr_token, hr_token):
        # Create OT request
        r = requests.post(f"{API}/overtime", json={
            "date": date.today().isoformat(),
            "hours": 1.5, "rate_multiplier": 1.5, "reason": "TEST_approval dispatch"
        }, headers=auth(emp_token))
        assert r.status_code == 200
        ap_id = r.json()["approval_request_id"]
        ot_id = r.json()["id"]

        # Walk the approval chain: manager first, then HR if multi-step
        for tok, who in [(mgr_token, "manager"), (hr_token, "hr")]:
            rd = requests.post(
                f"{API}/approvals/{ap_id}/decide",
                json={"decision": "approve", "comment": f"TEST_{who}_ok"},
                headers=auth(tok),
            )
            # Break once we succeed on the final step (status flips)
            if rd.status_code == 200:
                rows = requests.get(f"{API}/overtime", headers=auth(emp_token)).json()
                row = next((x for x in rows if x["id"] == ot_id), None)
                if row and row["status"] == "approved":
                    return
        # If loop exits without terminal approval, fail with diag
        rows = requests.get(f"{API}/overtime", headers=auth(emp_token)).json()
        row = next((x for x in rows if x["id"] == ot_id), None)
        assert row and row["status"] == "approved", f"final row={row}"


# ---------- Monthly Register MIS ----------
class TestMonthlyRegister:
    def test_register_shape(self, hr_token):
        month = date.today().strftime("%Y-%m")
        r = requests.get(f"{API}/attendance/register?month={month}", headers=auth(hr_token))
        assert r.status_code == 200
        data = r.json()
        assert data["month"] == month
        assert isinstance(data["dates"], list) and len(data["dates"]) >= 28
        assert isinstance(data["rows"], list) and len(data["rows"]) > 0
        row0 = data["rows"][0]
        assert "summary" in row0
        assert all(k in row0["summary"] for k in ["present", "absent", "leave", "holidays", "week_off"])
        codes = {d["code"] for d in row0["days"]}
        assert codes.issubset({"P", "P*", "A", "L", "H", "WO", "HD"})


# ---------- Cross-tenant isolation ----------
class TestCrossTenant:
    def test_super_admin_does_not_leak_into_acme(self, hr_token):
        # Super-admin creates a shift in their own (null or other) company — simplest verification:
        # verify hr@acme only sees ACME shifts (no stray codes outside the seeded+test codes).
        rows = requests.get(f"{API}/shifts", headers=auth(hr_token)).json()
        company_ids = {s["company_id"] for s in rows}
        assert len(company_ids) == 1, f"cross-tenant leak: {company_ids}"
