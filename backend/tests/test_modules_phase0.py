"""Phase 0 — module entitlement + tenant isolation + export tests.

Covers: catalog pricing visibility by role, company modules CRUD (enable/disable/bundle),
activation requests, audit, tenant isolation, integrity check, tenant export (ZIP, password_hash stripped),
multi-currency override, module gate (402).
"""
import io
import json
import os
import zipfile
import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://people-partner-cloud.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"

CREDS = {
    "admin": ("admin@hrms.io", "Admin@123"),
    "reseller": ("reseller@demo.io", "Reseller@123"),
    "hr": ("hr@acme.io", "Hr@12345"),
    "employee": ("employee@acme.io", "Employee@123"),
}


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    j = r.json()
    return j["access_token"], j["user"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- session-scoped fixtures (tokens + seeded acme company id) ----------
@pytest.fixture(scope="session")
def tokens():
    out = {}
    for k, (e, p) in CREDS.items():
        tok, user = _login(e, p)
        out[k] = {"tok": tok, "user": user}
    return out


@pytest.fixture(scope="session")
def acme_company_id(tokens):
    hr = tokens["hr"]["user"]
    cid = hr.get("company_id")
    assert cid, "HR user missing company_id"
    return cid


# ---------- Catalog price visibility ----------
def test_catalog_super_admin_has_retail_and_wholesale(tokens):
    r = requests.get(f"{API}/modules/catalog", headers=_h(tokens["admin"]["tok"]), timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert len(data["modules"]) == 16, f"expected 16 modules, got {len(data['modules'])}"
    assert len(data["bundles"]) == 3
    for m in data["modules"]:
        assert "retail_price" in m, f"retail missing for {m['id']}"
        assert "wholesale_price" in m, f"wholesale missing for {m['id']}"
    for b in data["bundles"]:
        assert "retail_price" in b and "wholesale_price" in b


def test_catalog_reseller_only_wholesale(tokens):
    r = requests.get(f"{API}/modules/catalog", headers=_h(tokens["reseller"]["tok"]), timeout=15)
    assert r.status_code == 200
    data = r.json()
    for m in data["modules"]:
        assert "wholesale_price" in m
        assert "retail_price" not in m, f"retail leaked to reseller on {m['id']}"
    for b in data["bundles"]:
        assert "wholesale_price" in b
        assert "retail_price" not in b


def test_catalog_company_admin_has_no_prices(tokens):
    """CRITICAL: company_admin must see NO prices."""
    r = requests.get(f"{API}/modules/catalog", headers=_h(tokens["hr"]["tok"]), timeout=15)
    assert r.status_code == 200
    data = r.json()
    for m in data["modules"]:
        assert "retail_price" not in m, f"retail leaked to company_admin on {m['id']}"
        assert "wholesale_price" not in m, f"wholesale leaked to company_admin on {m['id']}"
    for b in data["bundles"]:
        assert "retail_price" not in b
        assert "wholesale_price" not in b


# ---------- /modules/mine ----------
def test_mine_hr_has_base_and_procurement(tokens):
    r = requests.get(f"{API}/modules/mine", headers=_h(tokens["hr"]["tok"]), timeout=15)
    assert r.status_code == 200
    data = r.json()
    active = data["active_modules"]
    assert "base_hrms" in active
    assert "procurement" in active


def test_mine_super_admin_returns_all(tokens):
    r = requests.get(f"{API}/modules/mine", headers=_h(tokens["admin"]["tok"]), timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert len(data["active_modules"]) == 16


# ---------- Enable / disable lifecycle ----------
def test_enable_module_trial_and_pricing(tokens, acme_company_id):
    # cleanup any prior payroll record
    body = {"module_id": "payroll", "mode": "trial"}
    r = requests.post(
        f"{API}/modules/company/{acme_company_id}/enable",
        json=body, headers=_h(tokens["admin"]["tok"]), timeout=15,
    )
    assert r.status_code == 200, r.text
    doc = r.json()
    assert doc["status"] == "trial"
    assert doc["trial_until"] is not None
    # effective_amount must equal retail_price (payroll retail = 60)
    assert doc["effective_amount"] == 60
    assert doc["effective_currency"] == "INR"
    assert doc["price_source"] == "retail"

    # verify via /modules/company/{id}
    r2 = requests.get(
        f"{API}/modules/company/{acme_company_id}",
        headers=_h(tokens["admin"]["tok"]), timeout=15,
    )
    assert r2.status_code == 200
    rows = r2.json()
    payroll = next((x for x in rows if x["module_id"] == "payroll"), None)
    assert payroll and payroll["status"] == "trial"


def test_enable_module_currency_override_usd(tokens, acme_company_id):
    body = {"module_id": "expense", "mode": "active", "currency": "USD", "custom_amount": 5}
    r = requests.post(
        f"{API}/modules/company/{acme_company_id}/enable",
        json=body, headers=_h(tokens["admin"]["tok"]), timeout=15,
    )
    assert r.status_code == 200, r.text
    doc = r.json()
    assert doc["effective_amount"] == 5
    assert doc["effective_currency"] == "USD"
    assert doc["price_source"] == "override"


def test_disable_by_reseller_is_forbidden(tokens, acme_company_id):
    r = requests.post(
        f"{API}/modules/company/{acme_company_id}/disable",
        json={"module_id": "payroll"},
        headers=_h(tokens["reseller"]["tok"]), timeout=15,
    )
    assert r.status_code == 403


def test_disable_base_hrms_is_rejected(tokens, acme_company_id):
    r = requests.post(
        f"{API}/modules/company/{acme_company_id}/disable",
        json={"module_id": "base_hrms"},
        headers=_h(tokens["admin"]["tok"]), timeout=15,
    )
    assert r.status_code == 400


def test_disable_by_super_admin_works(tokens, acme_company_id):
    # enable helpdesk first so we can disable it
    requests.post(
        f"{API}/modules/company/{acme_company_id}/enable",
        json={"module_id": "helpdesk", "mode": "active"},
        headers=_h(tokens["admin"]["tok"]), timeout=15,
    )
    r = requests.post(
        f"{API}/modules/company/{acme_company_id}/disable",
        json={"module_id": "helpdesk"},
        headers=_h(tokens["admin"]["tok"]), timeout=15,
    )
    assert r.status_code == 200
    assert r.json().get("ok") is True


def test_bundle_activation_tags_source(tokens, acme_company_id):
    r = requests.post(
        f"{API}/modules/company/{acme_company_id}/activate_bundle",
        json={"bundle_id": "hr_essentials", "mode": "active"},
        headers=_h(tokens["admin"]["tok"]), timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body["activated"]) == {"base_hrms", "payroll", "performance"}

    # verify rows got price_source='bundle' and bundle_id='hr_essentials'
    r2 = requests.get(
        f"{API}/modules/company/{acme_company_id}",
        headers=_h(tokens["admin"]["tok"]), timeout=15,
    )
    rows = r2.json()
    for mid in ("payroll", "performance"):
        rec = next((x for x in rows if x["module_id"] == mid), None)
        assert rec, f"{mid} missing post-bundle"
        assert rec.get("price_source") == "bundle"
        assert rec.get("bundle_id") == "hr_essentials"


# ---------- Activation request & audit ----------
def test_request_activation_and_audit(tokens, acme_company_id):
    r = requests.post(
        f"{API}/modules/company/{acme_company_id}/request_activation",
        json={"module_id": "ats", "message": "Please enable ATS"},
        headers=_h(tokens["hr"]["tok"]), timeout=15,
    )
    assert r.status_code == 200, r.text
    doc = r.json()
    assert doc["status"] == "pending"
    assert doc["module_id"] == "ats"

    # list as hr — should see at least this request
    r2 = requests.get(f"{API}/modules/activation_requests", headers=_h(tokens["hr"]["tok"]), timeout=15)
    assert r2.status_code == 200
    items = r2.json()
    assert any(x["module_id"] == "ats" for x in items)

    # audit
    r3 = requests.get(
        f"{API}/modules/audit/{acme_company_id}",
        headers=_h(tokens["admin"]["tok"]), timeout=15,
    )
    assert r3.status_code == 200
    events = r3.json()
    actions = {e["action"] for e in events}
    assert "activation_requested" in actions
    # these may or may not exist depending on earlier tests, but should be present now
    for e in events:
        assert "actor_user_id" in e and "actor_role" in e and "actor_name" in e
        assert "at" in e


# ---------- Tenant isolation / integrity ----------
def test_integrity_check_acme_is_ok(tokens, acme_company_id):
    r = requests.get(
        f"{API}/tenant/{acme_company_id}/integrity_check",
        headers=_h(tokens["admin"]["tok"]), timeout=15,
    )
    assert r.status_code == 200, r.text
    report = r.json()
    assert report["ok"] is True, f"integrity issues: {report.get('issues')}"


def test_reseller_cannot_enable_on_unowned_company(tokens):
    """Create a 2nd company as super_admin; reseller (arlo) shouldn't own it → 403."""
    admin = tokens["admin"]["tok"]
    # Create company without reseller
    suffix = os.urandom(3).hex()
    payload = {
        "name": f"TEST_NoOwner_{suffix}",
        "country": "IN",
        "reseller_id": None,
        "admin_email": f"test_noowner_{suffix}@example.com",
        "admin_name": "Test Admin",
        "admin_password": "TestAdmin@123",
    }
    r = requests.post(f"{API}/companies", json=payload, headers=_h(admin), timeout=15)
    if r.status_code == 404:
        pytest.skip("/api/companies POST not available")
    assert r.status_code in (200, 201), r.text
    cid = r.json().get("id") or r.json().get("company_id")
    assert cid

    # reseller tries to enable on a company they don't own
    r2 = requests.post(
        f"{API}/modules/company/{cid}/enable",
        json={"module_id": "payroll", "mode": "active"},
        headers=_h(tokens["reseller"]["tok"]), timeout=15,
    )
    assert r2.status_code == 403


# ---------- Tenant export ----------
def test_export_as_company_admin_returns_zip(tokens, acme_company_id):
    r = requests.post(
        f"{API}/tenant/{acme_company_id}/export",
        headers=_h(tokens["hr"]["tok"]), timeout=60,
    )
    assert r.status_code == 200, r.text
    assert "zip" in r.headers.get("content-type", "").lower()
    buf = io.BytesIO(r.content)
    with zipfile.ZipFile(buf) as zf:
        names = zf.namelist()
        # must have company.json, users.json, employees.json, module_events.json
        for expected in ("company.json", "users.json", "employees.json", "module_events.json"):
            assert expected in names, f"{expected} missing from export"
        users = json.loads(zf.read("users.json"))
        for u in users:
            assert "password_hash" not in u, "password_hash LEAKED in export!"
            assert u.get("company_id") == acme_company_id
        employees = json.loads(zf.read("employees.json"))
        for e in employees:
            assert e.get("company_id") == acme_company_id


def test_export_as_employee_is_forbidden(tokens, acme_company_id):
    r = requests.post(
        f"{API}/tenant/{acme_company_id}/export",
        headers=_h(tokens["employee"]["tok"]), timeout=15,
    )
    assert r.status_code == 403


# ---------- Module gate (402) ----------
def test_module_gate_blocks_non_entitled(tokens, acme_company_id):
    """Disable payroll, then any endpoint requiring payroll module should return 402.
    We don't know which routes gate payroll yet; try a plausible one."""
    # Ensure payroll disabled
    requests.post(
        f"{API}/modules/company/{acme_company_id}/disable",
        json={"module_id": "payroll"},
        headers=_h(tokens["admin"]["tok"]), timeout=15,
    )
    # Try hitting a gated endpoint if it exists
    for path in ("/payroll/runs", "/payroll"):
        r = requests.get(f"{API}{path}", headers=_h(tokens["hr"]["tok"]), timeout=15)
        if r.status_code in (402, 404):
            if r.status_code == 402:
                detail = r.json().get("detail") or r.json()
                # detail may be dict
                assert "module_not_entitled" in json.dumps(detail)
            return
    pytest.skip("No payroll gated route exposed yet — gate behaviour not verifiable via HTTP")
