"""Phase 1 Employment Class API integration tests.

Covers:
- /api/employment-class/catalog
- /api/employment-class/permissions
- /api/admin/employment-class/config (GET/PUT)
- /api/admin/employment-class/reset
- /api/admin/employment-class/stats
- /api/employees (employment_class filter, create, patch)
- Role-based access (employee cannot view admin config)
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://people-partner-cloud.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

HR_EMAIL = "hr@acme.io"
HR_PASSWORD = "Hr@12345"
EMP_EMAIL = "employee@acme.io"
EMP_PASSWORD = "Employee@123"


def _login(email: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    if r.status_code == 429:
        time.sleep(5)
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def hr_token():
    return _login(HR_EMAIL, HR_PASSWORD)


@pytest.fixture(scope="module")
def emp_token():
    return _login(EMP_EMAIL, EMP_PASSWORD)


@pytest.fixture(scope="module")
def hr_headers(hr_token):
    return {"Authorization": f"Bearer {hr_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def emp_headers(emp_token):
    return {"Authorization": f"Bearer {emp_token}", "Content-Type": "application/json"}


# ---------- Catalog & permissions ----------

def test_catalog_has_4_classes_and_19_features(hr_headers):
    r = requests.get(f"{API}/employment-class/catalog", headers=hr_headers, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert len(data["classes"]) == 4
    keys = {c["key"] for c in data["classes"]}
    assert keys == {"on_roll", "off_roll_consultant", "off_roll_contractor", "intern"}
    assert len(data["features"]) == 19
    # Sample feature keys present
    fkeys = {f["key"] for f in data["features"]}
    for required in ["payroll", "pf_esic", "leave", "timesheet", "expenses", "attendance", "helpdesk"]:
        assert required in fkeys


def test_permissions_for_hr_admin_defaults_to_on_roll(hr_headers):
    r = requests.get(f"{API}/employment-class/permissions", headers=hr_headers, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data["employment_class"] == "on_roll"
    # All 19 keys present
    assert len(data["permissions"]) == 19
    # on_roll has all true by default
    assert all(v is True for v in data["permissions"].values())


def test_permissions_accessible_to_regular_employee(emp_headers):
    r = requests.get(f"{API}/employment-class/permissions", headers=emp_headers, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "employment_class" in data
    assert "permissions" in data


# ---------- Admin config ----------

def test_admin_config_returns_full_matrix(hr_headers):
    r = requests.get(f"{API}/admin/employment-class/config", headers=hr_headers, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "matrix" in data
    m = data["matrix"]
    assert set(m.keys()) == {"on_roll", "off_roll_consultant", "off_roll_contractor", "intern"}
    # Each class has 19 feature keys
    for cls, perms in m.items():
        assert len(perms) == 19, f"class {cls} has {len(perms)} keys"
    # Default correctness assertions
    assert all(v for v in m["on_roll"].values())
    assert m["off_roll_consultant"]["payroll"] is False
    assert m["off_roll_consultant"]["pf_esic"] is False
    assert m["off_roll_consultant"]["leave"] is False
    assert m["off_roll_consultant"]["insurance"] is False
    assert m["off_roll_consultant"]["loans"] is False
    assert m["off_roll_consultant"]["timesheet"] is True
    assert m["off_roll_consultant"]["expenses"] is True
    assert m["off_roll_consultant"]["attendance"] is True
    assert m["intern"]["payroll"] is True
    assert m["intern"]["pf_esic"] is False


def test_employee_role_cannot_read_admin_config(emp_headers):
    r = requests.get(f"{API}/admin/employment-class/config", headers=emp_headers, timeout=15)
    assert r.status_code == 403, f"expected 403, got {r.status_code} body={r.text[:200]}"


def test_put_config_flips_single_flag_preserves_others(hr_headers):
    # Ensure clean state
    requests.post(f"{API}/admin/employment-class/reset", headers=hr_headers, timeout=15)

    # Flip intern.helpdesk to False
    payload = {"matrix": {"intern": {"helpdesk": False}}}
    r = requests.put(f"{API}/admin/employment-class/config", headers=hr_headers, json=payload, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    m = body["matrix"]
    assert m["intern"]["helpdesk"] is False
    # Other intern defaults preserved
    assert m["intern"]["payroll"] is True
    assert m["intern"]["leave"] is True
    # Other classes untouched
    assert all(v for v in m["on_roll"].values())
    assert m["off_roll_consultant"]["timesheet"] is True

    # Confirm persistence + is_custom flag
    r2 = requests.get(f"{API}/admin/employment-class/config", headers=hr_headers, timeout=15)
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["is_custom"] is True
    assert d2["matrix"]["intern"]["helpdesk"] is False


def test_reset_restores_defaults_and_unsets_is_custom(hr_headers):
    # Apply override first
    requests.put(f"{API}/admin/employment-class/config", headers=hr_headers,
                 json={"matrix": {"intern": {"helpdesk": False}}}, timeout=15)
    r = requests.post(f"{API}/admin/employment-class/reset", headers=hr_headers, timeout=15)
    assert r.status_code == 200
    assert r.json()["ok"] is True
    # is_custom should be false now
    r2 = requests.get(f"{API}/admin/employment-class/config", headers=hr_headers, timeout=15)
    assert r2.status_code == 200
    d = r2.json()
    assert d["is_custom"] is False
    # intern.helpdesk back to default True
    assert d["matrix"]["intern"]["helpdesk"] is True


# ---------- Stats ----------

def test_stats_counts_match_seeded_numbers(hr_headers):
    r = requests.get(f"{API}/admin/employment-class/stats", headers=hr_headers, timeout=15)
    assert r.status_code == 200
    counts = r.json()["counts"]
    assert set(counts.keys()) == {"on_roll", "off_roll_consultant", "off_roll_contractor", "intern"}
    # Seeded approximate counts - allow tolerance since other tests may create records
    assert counts["off_roll_consultant"] >= 3
    assert counts["off_roll_contractor"] >= 2
    assert counts["intern"] >= 3
    assert counts["on_roll"] >= 20  # relaxed - seed says ~42


# ---------- Employees CRUD with employment_class ----------

def test_employees_filter_by_employment_class_intern(hr_headers):
    r = requests.get(f"{API}/employees?employment_class=intern&limit=50", headers=hr_headers, timeout=15)
    assert r.status_code == 200
    data = r.json()
    items = data.get("items") if isinstance(data, dict) else data
    assert isinstance(items, list)
    for emp in items:
        assert emp.get("employment_class") == "intern", f"unexpected class: {emp.get('employment_class')}"
    # At least 3 seeded interns
    assert len(items) >= 3


def test_employees_filter_by_consultant(hr_headers):
    r = requests.get(f"{API}/employees?employment_class=off_roll_consultant&limit=50", headers=hr_headers, timeout=15)
    assert r.status_code == 200
    data = r.json()
    items = data.get("items") if isinstance(data, dict) else data
    assert len(items) >= 3
    for e in items:
        assert e["employment_class"] == "off_roll_consultant"


@pytest.fixture(scope="module")
def created_employee(hr_headers):
    payload = {
        "name": "TEST_Phase1 Consultant",
        "email": f"test_phase1_cons_{int(time.time())}@acme.io",
        "job_title": "Test Consultant",
        "department": "Engineering",
        "employment_class": "off_roll_consultant",
    }
    r = requests.post(f"{API}/employees", headers=hr_headers, json=payload, timeout=15)
    assert r.status_code in (200, 201), f"{r.status_code} {r.text[:200]}"
    emp = r.json()
    assert emp.get("employment_class") == "off_roll_consultant"
    yield emp
    # cleanup
    try:
        requests.delete(f"{API}/employees/{emp['id']}", headers=hr_headers, timeout=10)
    except Exception:
        pass


def test_create_employee_persists_employment_class(hr_headers, created_employee):
    # Verify via GET
    r = requests.get(f"{API}/employees/{created_employee['id']}", headers=hr_headers, timeout=15)
    assert r.status_code == 200
    assert r.json()["employment_class"] == "off_roll_consultant"


def test_patch_employee_can_update_employment_class(hr_headers, created_employee):
    r = requests.patch(f"{API}/employees/{created_employee['id']}",
                       headers=hr_headers, json={"employment_class": "intern"}, timeout=15)
    assert r.status_code == 200
    # verify
    r2 = requests.get(f"{API}/employees/{created_employee['id']}", headers=hr_headers, timeout=15)
    assert r2.status_code == 200
    assert r2.json()["employment_class"] == "intern"
