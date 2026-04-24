"""Phase 1J — Performance Management integration tests.
Covers: Cycles, Goals/OKRs (with KR progress), Reviews, 9-Box, PIPs.
"""
import os
from datetime import date, timedelta

import pytest
import requests

_BE = os.environ.get("REACT_APP_BACKEND_URL")
if not _BE:
    with open("/app/frontend/.env") as _f:
        for ln in _f:
            if ln.startswith("REACT_APP_BACKEND_URL="):
                _BE = ln.strip().split("=", 1)[1]
                break
API = _BE.rstrip("/") + "/api"

HR = {"email": "hr@acme.io", "password": "Hr@12345"}
EMP = {"email": "employee@acme.io", "password": "Employee@123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module", autouse=True)
def _ensure_performance_active():
    """Ensure `performance` module is active for ACME."""
    tok = _login({"email": "admin@hrms.io", "password": "Admin@123"})
    rows = requests.get(f"{API}/companies", headers=_h(tok), timeout=15).json()
    acme = next((c for c in rows if c.get("name") == "ACME Global"), rows[0] if rows else None)
    if acme:
        requests.post(
            f"{API}/modules/company/{acme['id']}/enable",
            headers=_h(tok),
            json={"module_id": "performance", "mode": "active"},
            timeout=15,
        )
    yield


@pytest.fixture(scope="module")
def hr_tok():
    return _login(HR)


@pytest.fixture(scope="module")
def emp_tok():
    return _login(EMP)


@pytest.fixture(scope="module")
def cycle(hr_tok):
    """Create a unique cycle for this test session."""
    unique = f"Test Cycle {date.today().isoformat()}-{os.urandom(3).hex()}"
    r = requests.post(f"{API}/review-cycles", headers=_h(hr_tok), json={
        "name": unique,
        "cadence": "quarterly",
        "period_start": "2026-04-01",
        "period_end": "2026-06-30",
    }, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def emp_id(hr_tok):
    """employee@acme.io's employee id."""
    rows = requests.get(f"{API}/employees", headers=_h(hr_tok), timeout=15).json()
    target = next((e for e in rows if e.get("email") == "employee@acme.io"), None)
    assert target, "Need employee@acme.io in seed"
    return target["id"]


# ---------------------------------------------------------------------------
# Review Cycles
# ---------------------------------------------------------------------------
class TestCycles:
    def test_list_and_status_transitions(self, hr_tok, cycle):
        rows = requests.get(f"{API}/review-cycles", headers=_h(hr_tok), timeout=15).json()
        assert any(c["id"] == cycle["id"] for c in rows)

        # draft → open → in_review → calibration → closed
        for step in ("open", "in_review", "calibration", "closed"):
            r = requests.post(f"{API}/review-cycles/{cycle['id']}/status",
                              headers=_h(hr_tok), json={"status": step}, timeout=15)
            assert r.status_code == 200
            assert r.json()["status"] == step

    def test_invalid_status_rejected(self, hr_tok, cycle):
        r = requests.post(f"{API}/review-cycles/{cycle['id']}/status",
                          headers=_h(hr_tok), json={"status": "bogus"}, timeout=15)
        assert r.status_code == 400

    def test_employee_cannot_create_cycle(self, emp_tok):
        r = requests.post(f"{API}/review-cycles", headers=_h(emp_tok), json={
            "name": "Hacky", "cadence": "annual",
            "period_start": "2026-01-01", "period_end": "2026-12-31",
        }, timeout=15)
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# Goals / OKRs
# ---------------------------------------------------------------------------
class TestGoals:
    def test_hr_creates_goal_and_progress_computed(self, hr_tok, cycle, emp_id):
        r = requests.post(f"{API}/goals", headers=_h(hr_tok), json={
            "cycle_id": cycle["id"], "owner_employee_id": emp_id,
            "title": "Ship perf mgmt",
            "key_results": [
                {"id": "a", "title": "Deliver KR1", "target": 100, "current": 50, "weight": 1},
                {"id": "b", "title": "Deliver KR2", "target": 10, "current": 10, "weight": 1},
            ],
        }, timeout=15)
        assert r.status_code == 200, r.text
        g = r.json()
        # Weighted avg of 50% and 100% = 75%
        assert g["progress"] == 75.0
        assert g["status"] == "on_track"
        assert g["owner_employee_id"] == emp_id

    def test_employee_updates_own_kr_progress(self, emp_tok, hr_tok, cycle, emp_id):
        # Create a goal for the employee (as HR)
        r = requests.post(f"{API}/goals", headers=_h(hr_tok), json={
            "cycle_id": cycle["id"], "owner_employee_id": emp_id,
            "title": "Employee self-updates", "key_results": [
                {"id": "kr1", "title": "Target 100", "target": 100, "current": 0, "weight": 1},
            ],
        }, timeout=15)
        g = r.json()
        # Employee updates KR
        r2 = requests.post(f"{API}/goals/{g['id']}/kr-progress",
                           headers=_h(emp_tok), json={"kr_id": "kr1", "current": 90},
                           timeout=15)
        assert r2.status_code == 200, r2.text
        assert r2.json()["progress"] == 90.0
        assert r2.json()["status"] == "on_track"

    def test_employee_cannot_create_for_others(self, emp_tok, cycle, hr_tok):
        rows = requests.get(f"{API}/employees", headers=_h(hr_tok), timeout=15).json()
        other = next((e for e in rows if e.get("email") != "employee@acme.io"), None)
        assert other
        r = requests.post(f"{API}/goals", headers=_h(emp_tok), json={
            "cycle_id": cycle["id"], "owner_employee_id": other["id"],
            "title": "Hack attempt", "key_results": [],
        }, timeout=15)
        assert r.status_code == 403

    def test_employee_sees_only_own_goals(self, emp_tok, emp_id):
        rows = requests.get(f"{API}/goals", headers=_h(emp_tok), timeout=15).json()
        assert all(g["owner_employee_id"] == emp_id for g in rows)

    def test_me_summary(self, emp_tok):
        r = requests.get(f"{API}/goals/me/summary", headers=_h(emp_tok), timeout=15)
        assert r.status_code == 200
        s = r.json()
        assert "total" in s and "avg_progress" in s


# ---------------------------------------------------------------------------
# Reviews
# ---------------------------------------------------------------------------
class TestReviews:
    def test_create_self_review_and_submit(self, hr_tok, emp_tok, cycle, emp_id):
        # Reopen cycle so we can work with it
        requests.post(f"{API}/review-cycles/{cycle['id']}/status",
                      headers=_h(hr_tok), json={"status": "in_review"}, timeout=15)

        r = requests.post(f"{API}/reviews", headers=_h(emp_tok), json={
            "cycle_id": cycle["id"], "subject_employee_id": emp_id,
            "review_type": "self",
        }, timeout=15)
        assert r.status_code == 200, r.text
        rv = r.json()
        assert rv["review_type"] == "self"
        assert rv["status"] == "pending"
        assert len(rv["competencies"]) >= 3

        # Employee submits their self-review
        r2 = requests.post(f"{API}/reviews/{rv['id']}/submit", headers=_h(emp_tok), json={
            "overall_rating": 4,
            "competencies": [
                {"competency": rv["competencies"][0]["competency"], "rating": 4},
            ],
            "strengths": "Great ownership", "improvements": "Delegate more",
        }, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["status"] == "submitted"
        assert r2.json()["overall_rating"] == 4

        # HR shares it
        r3 = requests.post(f"{API}/reviews/{rv['id']}/share", headers=_h(hr_tok), timeout=15)
        assert r3.status_code == 200 and r3.json()["status"] == "shared"

        # Subject (employee) can now fetch it
        r4 = requests.get(f"{API}/reviews/{rv['id']}", headers=_h(emp_tok), timeout=15)
        assert r4.status_code == 200

    def test_duplicate_review_returns_existing(self, emp_tok, cycle, emp_id):
        # Same (cycle, subject, reviewer, type) should dedupe
        r1 = requests.post(f"{API}/reviews", headers=_h(emp_tok), json={
            "cycle_id": cycle["id"], "subject_employee_id": emp_id,
            "review_type": "self",
        }, timeout=15)
        r2 = requests.post(f"{API}/reviews", headers=_h(emp_tok), json={
            "cycle_id": cycle["id"], "subject_employee_id": emp_id,
            "review_type": "self",
        }, timeout=15)
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()["id"] == r2.json()["id"]

    def test_invalid_rating_rejected(self, emp_tok, cycle, emp_id):
        r = requests.post(f"{API}/reviews", headers=_h(emp_tok), json={
            "cycle_id": cycle["id"], "subject_employee_id": emp_id,
            "review_type": "self",
        }, timeout=15)
        rv_id = r.json()["id"]
        r2 = requests.post(f"{API}/reviews/{rv_id}/submit", headers=_h(emp_tok), json={
            "overall_rating": 99, "competencies": [],
        }, timeout=15)
        assert r2.status_code == 400


# ---------------------------------------------------------------------------
# 9-Box
# ---------------------------------------------------------------------------
class TestNineBox:
    def test_upsert_and_grid(self, hr_tok, cycle, emp_id):
        r = requests.post(f"{API}/nine-box", headers=_h(hr_tok), json={
            "cycle_id": cycle["id"], "employee_id": emp_id,
            "performance": "high", "potential": "high",
            "notes": "Rising star",
        }, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["box"] == 9
        assert "Star" in r.json()["box_label"]

        # Upsert — move to different box
        r2 = requests.post(f"{API}/nine-box", headers=_h(hr_tok), json={
            "cycle_id": cycle["id"], "employee_id": emp_id,
            "performance": "medium", "potential": "high",
        }, timeout=15)
        assert r2.json()["box"] == 6

        # Grid contains placement
        r3 = requests.get(f"{API}/nine-box?cycle_id={cycle['id']}", headers=_h(hr_tok), timeout=15)
        assert r3.status_code == 200
        data = r3.json()
        assert any(p["employee_id"] == emp_id for p in data["placements"])
        assert str(6) in data["grid"]

    def test_employee_cannot_view_grid(self, emp_tok, cycle):
        r = requests.get(f"{API}/nine-box?cycle_id={cycle['id']}", headers=_h(emp_tok), timeout=15)
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# PIPs
# ---------------------------------------------------------------------------
class TestPIPs:
    def test_create_milestone_close(self, hr_tok, emp_id):
        r = requests.post(f"{API}/pips", headers=_h(hr_tok), json={
            "employee_id": emp_id,
            "start_date": "2026-05-01", "end_date": "2026-07-31",
            "concerns_markdown": "Missing commitments",
            "milestones": [
                {"id": "m1", "title": "Deliver feature X", "due_date": "2026-06-15", "status": "pending"},
                {"id": "m2", "title": "Improve code quality", "due_date": "2026-07-15", "status": "pending"},
            ],
        }, timeout=15)
        assert r.status_code == 200, r.text
        pip = r.json()
        assert pip["status"] == "active"
        assert len(pip["milestones"]) == 2

        # Mark milestone met
        r2 = requests.post(f"{API}/pips/{pip['id']}/milestones/m1/status",
                           headers=_h(hr_tok), json={"status": "met"}, timeout=15)
        assert r2.status_code == 200
        assert next(m for m in r2.json()["milestones"] if m["id"] == "m1")["status"] == "met"

        # Close PIP with outcome
        r3 = requests.post(f"{API}/pips/{pip['id']}/outcome", headers=_h(hr_tok),
                           json={"outcome": "passed", "outcome_notes": "Great progress"},
                           timeout=15)
        assert r3.status_code == 200
        assert r3.json()["outcome"] == "passed"
        assert r3.json()["status"] == "passed"

    def test_employee_sees_own_pip(self, hr_tok, emp_tok, emp_id):
        # Create another PIP for the employee
        requests.post(f"{API}/pips", headers=_h(hr_tok), json={
            "employee_id": emp_id,
            "start_date": "2026-05-01", "end_date": "2026-07-31",
            "concerns_markdown": "Second PIP test",
        }, timeout=15)
        r = requests.get(f"{API}/pips", headers=_h(emp_tok), timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert all(p["employee_id"] == emp_id for p in rows)
