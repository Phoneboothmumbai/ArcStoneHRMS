"""HRMS SaaS backend regression test suite.

Covers: auth (5 personas), RBAC, dashboard, tenant isolation, org tree,
employee filters, multi-level approvals (leave happy + reject), attendance,
product/service requests, reseller+company admin creation, and leak checks
(_id / password_hash).
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://people-partner-cloud.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CREDS = {
    "admin": ("admin@hrms.io", "Admin@123"),
    "reseller": ("reseller@demo.io", "Reseller@123"),
    "hr": ("hr@acme.io", "Hr@12345"),
    "manager": ("manager@acme.io", "Manager@123"),
    "employee": ("employee@acme.io", "Employee@123"),
}


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data and data["access_token"]
    assert "user" in data
    # cookies should also be set
    assert "access_token" in r.cookies or any(c.name == "access_token" for c in r.cookies)
    return data["access_token"], data["user"]


def _h(token):
    return {"Authorization": f"Bearer {token}"}


# ========== Auth ==========
@pytest.mark.parametrize("key", list(CREDS.keys()))
def test_login_all_personas(key):
    email, pwd = CREDS[key]
    token, user = _login(email, pwd)
    assert user["email"] == email
    assert "password_hash" not in user
    assert "_id" not in user
    # /auth/me
    r = requests.get(f"{API}/auth/me", headers=_h(token), timeout=15)
    assert r.status_code == 200
    me = r.json()
    assert me["email"] == email
    assert "password_hash" not in me
    assert "_id" not in me


def test_login_invalid_credentials():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@hrms.io", "password": "wrong"}, timeout=15)
    assert r.status_code == 401


# ========== RBAC ==========
def test_employee_cannot_list_resellers():
    token, _ = _login(*CREDS["employee"])
    r = requests.get(f"{API}/resellers", headers=_h(token), timeout=15)
    assert r.status_code == 403


def test_super_admin_can_list_resellers():
    token, _ = _login(*CREDS["admin"])
    r = requests.get(f"{API}/resellers", headers=_h(token), timeout=15)
    assert r.status_code == 200
    rows = r.json()
    assert isinstance(rows, list) and len(rows) >= 1
    # no _id leakage
    for row in rows:
        assert "_id" not in row


# ========== Dashboard stats role-aware ==========
def test_dashboard_super_admin():
    token, _ = _login(*CREDS["admin"])
    r = requests.get(f"{API}/dashboard/stats", headers=_h(token), timeout=15)
    assert r.status_code == 200
    d = r.json()
    for k in ("resellers", "companies", "employees", "active_users", "pending_approvals"):
        assert k in d


def test_dashboard_reseller():
    token, _ = _login(*CREDS["reseller"])
    r = requests.get(f"{API}/dashboard/stats", headers=_h(token), timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert "mrr" in d and "monthly_commission" in d and "commission_rate" in d


def test_dashboard_company_admin():
    token, _ = _login(*CREDS["hr"])
    r = requests.get(f"{API}/dashboard/stats", headers=_h(token), timeout=15)
    assert r.status_code == 200
    d = r.json()
    for k in ("employees", "branches", "pending_approvals", "open_leave", "open_requests"):
        assert k in d
    assert d["employees"] >= 6
    assert d["branches"] >= 2


def test_dashboard_employee():
    token, _ = _login(*CREDS["employee"])
    r = requests.get(f"{API}/dashboard/stats", headers=_h(token), timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert "my_leave" in d and "my_requests" in d


# ========== Tenant isolation ==========
def test_hr_employees_scoped_to_company():
    token, user = _login(*CREDS["hr"])
    r = requests.get(f"{API}/employees", headers=_h(token), timeout=15)
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) >= 6
    for e in rows:
        assert e["company_id"] == user["company_id"]
        assert "_id" not in e


def test_reseller_companies_scoped():
    token, user = _login(*CREDS["reseller"])
    r = requests.get(f"{API}/companies", headers=_h(token), timeout=15)
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) >= 1
    for c in rows:
        assert c["reseller_id"] == user["reseller_id"]


# ========== Org tree ==========
def test_org_tree_hierarchy():
    token, _ = _login(*CREDS["hr"])
    r = requests.get(f"{API}/org/tree", headers=_h(token), timeout=15)
    assert r.status_code == 200
    tree = r.json()
    assert "regions" in tree and "stats" in tree
    s = tree["stats"]
    assert s["regions"] >= 2 and s["countries"] >= 2 and s["branches"] >= 2
    assert s["departments"] >= 2 and s["employees"] >= 6
    # nested check
    assert any(len(r.get("countries", [])) > 0 for r in tree["regions"])


# ========== Employee filters ==========
def test_employees_filter_wfh():
    token, _ = _login(*CREDS["hr"])
    r = requests.get(f"{API}/employees", params={"employee_type": "wfh"}, headers=_h(token), timeout=15)
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) >= 1
    assert all(e["employee_type"] == "wfh" for e in rows)


def test_employees_filter_search_aisha():
    token, _ = _login(*CREDS["hr"])
    r = requests.get(f"{API}/employees", params={"q": "Aisha"}, headers=_h(token), timeout=15)
    assert r.status_code == 200
    rows = r.json()
    assert any("Aisha" in e["name"] for e in rows)


# ========== Multi-level approval engine: Leave happy path ==========
def test_leave_approval_end_to_end():
    emp_tok, emp_user = _login(*CREDS["employee"])
    # Create leave
    # Use 'earned' leave type which has no seeded workflow => fallback manager-walk-up (mgr + HR)
    r = requests.post(f"{API}/leave", headers=_h(emp_tok), json={
        "leave_type": "earned", "start_date": "2026-02-01",
        "end_date": "2026-02-02", "reason": "TEST_E2E personal work"
    }, timeout=15)
    assert r.status_code == 200, r.text
    leave = r.json()
    approval_id = leave["approval_request_id"]
    assert approval_id, "approval_request_id must be set"

    # Inspect approval request - should have >=2 steps (manager + HR admin)
    mgr_tok, _ = _login(*CREDS["manager"])
    r = requests.get(f"{API}/approvals/{approval_id}", headers=_h(mgr_tok), timeout=15)
    assert r.status_code == 200
    ap = r.json()
    assert len(ap["steps"]) >= 2, f"expected chain with manager+HR, got {ap['steps']}"
    roles = [s["approver_role"] for s in ap["steps"]]
    assert "company_admin" in roles
    assert ap["current_step"] == 1
    assert ap["status"] == "pending"

    # Manager approves
    r = requests.post(f"{API}/approvals/{approval_id}/decide", headers=_h(mgr_tok),
                     json={"decision": "approve", "comment": "TEST ok"}, timeout=15)
    assert r.status_code == 200, r.text
    ap1 = r.json()
    assert ap1["status"] == "pending"
    assert ap1["current_step"] == 2

    # HR approves
    hr_tok, _ = _login(*CREDS["hr"])
    r = requests.post(f"{API}/approvals/{approval_id}/decide", headers=_h(hr_tok),
                     json={"decision": "approve", "comment": "TEST hr ok"}, timeout=15)
    assert r.status_code == 200, r.text
    ap2 = r.json()
    assert ap2["status"] == "approved"

    # Verify leave record is approved
    r = requests.get(f"{API}/leave", headers=_h(emp_tok), timeout=15)
    assert r.status_code == 200
    my_leaves = r.json()
    matched = [lv for lv in my_leaves if lv["id"] == leave["id"]]
    assert matched and matched[0]["status"] == "approved"


def test_leave_rejection_flow():
    emp_tok, _ = _login(*CREDS["employee"])
    r = requests.post(f"{API}/leave", headers=_h(emp_tok), json={
        "leave_type": "sick", "start_date": "2026-03-01",
        "end_date": "2026-03-01", "reason": "TEST_REJ sick day"
    }, timeout=15)
    assert r.status_code == 200
    leave = r.json()
    approval_id = leave["approval_request_id"]

    mgr_tok, _ = _login(*CREDS["manager"])
    r = requests.post(f"{API}/approvals/{approval_id}/decide", headers=_h(mgr_tok),
                     json={"decision": "reject", "comment": "TEST rejected"}, timeout=15)
    assert r.status_code == 200
    ap = r.json()
    assert ap["status"] == "rejected"

    # linked leave updated
    r = requests.get(f"{API}/leave", headers=_h(emp_tok), timeout=15)
    my_leaves = r.json()
    matched = [lv for lv in my_leaves if lv["id"] == leave["id"]]
    assert matched and matched[0]["status"] == "rejected"


def test_approvals_not_your_turn():
    """HR cannot approve until manager does."""
    emp_tok, _ = _login(*CREDS["employee"])
    r = requests.post(f"{API}/leave", headers=_h(emp_tok), json={
        "leave_type": "casual", "start_date": "2026-04-01",
        "end_date": "2026-04-01", "reason": "TEST_NYT"
    }, timeout=15)
    approval_id = r.json()["approval_request_id"]
    hr_tok, _ = _login(*CREDS["hr"])
    r = requests.post(f"{API}/approvals/{approval_id}/decide", headers=_h(hr_tok),
                     json={"decision": "approve"}, timeout=15)
    assert r.status_code == 403


# ========== Attendance ==========
def test_attendance_flow():
    # Use a fresh employee-linked user to avoid state collisions. Create via HR.
    hr_tok, hr_user = _login(*CREDS["hr"])
    unique = uuid.uuid4().hex[:8]
    email = f"test_att_{unique}@acme.io"
    r = requests.post(f"{API}/employees", headers=_h(hr_tok), json={
        "name": f"TEST Att {unique}", "email": email, "job_title": "QA",
        "employee_type": "wfh", "create_login": True, "password": "AttTest@123",
        "role_in_company": "employee",
    }, timeout=15)
    assert r.status_code == 200, r.text

    tok, _ = _login(email, "AttTest@123")
    # checkin
    r = requests.post(f"{API}/attendance/checkin", headers=_h(tok),
                     json={"type": "wfh", "location": "home"}, timeout=15)
    assert r.status_code == 200
    rec = r.json()
    assert rec["check_in"]
    # second checkin fails
    r = requests.post(f"{API}/attendance/checkin", headers=_h(tok),
                     json={"type": "wfh"}, timeout=15)
    assert r.status_code == 400
    # today
    r = requests.get(f"{API}/attendance/today", headers=_h(tok), timeout=15)
    assert r.status_code == 200
    t = r.json()
    assert t and t["check_in"]
    # checkout
    r = requests.post(f"{API}/attendance/checkout", headers=_h(tok), timeout=15)
    assert r.status_code == 200
    out = r.json()
    assert out["check_out"] is not None
    assert out["hours"] is not None and out["hours"] >= 0


# ========== Product/Service requests ==========
def test_product_service_request_creation():
    emp_tok, _ = _login(*CREDS["employee"])
    r = requests.post(f"{API}/requests", headers=_h(emp_tok), json={
        "category": "product", "title": "TEST Laptop", "description": "Dev laptop",
        "quantity": 1, "estimated_cost": 1500, "route_to": "main_branch",
        "urgency": "medium",
    }, timeout=15)
    assert r.status_code == 200, r.text
    psr = r.json()
    assert psr["approval_request_id"]
    # Fetch approval chain
    mgr_tok, _ = _login(*CREDS["manager"])
    r = requests.get(f"{API}/approvals/{psr['approval_request_id']}", headers=_h(mgr_tok), timeout=15)
    assert r.status_code == 200
    ap = r.json()
    assert len(ap["steps"]) >= 1


# ========== Super admin: create reseller + company ==========
def test_super_admin_create_reseller_and_company():
    admin_tok, _ = _login(*CREDS["admin"])
    suffix = uuid.uuid4().hex[:8]
    r_email = f"TEST_reseller_{suffix}@demo.io"
    r = requests.post(f"{API}/resellers", headers=_h(admin_tok), json={
        "name": f"TEST Reseller {suffix}", "company_name": f"TEST LLP {suffix}",
        "contact_email": r_email, "commission_rate": 0.20,
        "admin_password": "TestRes@1234",
    }, timeout=15)
    assert r.status_code == 200, r.text
    reseller = r.json()
    assert reseller["id"]
    assert "_id" not in reseller
    # Linked user should exist - can log in
    rlog = requests.post(f"{API}/auth/login", json={"email": r_email, "password": "TestRes@1234"}, timeout=15)
    assert rlog.status_code == 200

    # Create company under this reseller
    c_admin_email = f"TEST_cadmin_{suffix}@acme.io"
    r = requests.post(f"{API}/companies", headers=_h(admin_tok), json={
        "name": f"TEST Co {suffix}", "reseller_id": reseller["id"], "plan": "growth",
        "admin_email": c_admin_email, "admin_name": "TEST Admin", "admin_password": "TestCo@1234",
    }, timeout=15)
    assert r.status_code == 200, r.text
    company = r.json()
    assert company["reseller_id"] == reseller["id"]
    # Admin can log in
    clog = requests.post(f"{API}/auth/login", json={"email": c_admin_email, "password": "TestCo@1234"}, timeout=15)
    assert clog.status_code == 200


# ========== Leak checks ==========
def test_no_id_or_password_hash_leak_me():
    for key in ("admin", "hr", "employee"):
        tok, _ = _login(*CREDS[key])
        r = requests.get(f"{API}/auth/me", headers=_h(tok), timeout=15)
        assert r.status_code == 200
        body = r.text
        assert '"_id"' not in body
        assert "password_hash" not in body


def test_no_leak_in_employees_list():
    tok, _ = _login(*CREDS["hr"])
    r = requests.get(f"{API}/employees", headers=_h(tok), timeout=15)
    body = r.text
    assert '"_id"' not in body
    assert "password_hash" not in body
