"""Iteration 20 — Pre-launch wiring audit.
Tests the 4 NEW frontend-wired backend feature surfaces:
  - Comp-Off (/api/comp-off/credits)
  - Investment Declarations (/api/declarations/me)
  - Bulk Employee Import (/api/employees/bulk-import/*)
  - Audit Log (/api/audit/events)
Plus smoke-login for the 4 roles used in the route sweep.
"""
import io
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://people-partner-cloud.preview.emergentagent.com").rstrip("/")

CREDS = {
    "super":    ("admin@hrms.io",      "Admin@123"),
    "hr":       ("hr@acme.io",         "Hr@12345"),
    "manager":  ("manager@acme.io",    "Manager@123"),
    "employee": ("employee@acme.io",   "Employee@123"),
}


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text[:200]}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def tokens():
    return {k: _login(*v) for k, v in CREDS.items()}


def H(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ----------------- Login smoke -----------------
class TestAuthSmoke:
    @pytest.mark.parametrize("role", list(CREDS.keys()))
    def test_login(self, role):
        email, pw = CREDS[role]
        tok = _login(email, pw)
        assert tok and isinstance(tok, str) and len(tok) > 20


# ----------------- Comp-Off -----------------
class TestCompOff:
    def test_list_as_employee(self, tokens):
        r = requests.get(f"{BASE_URL}/api/comp-off/credits",
                         headers=H(tokens["employee"]), timeout=15)
        assert r.status_code == 200, r.text[:200]
        assert isinstance(r.json(), list)

    def test_list_admin_queue(self, tokens):
        r = requests.get(f"{BASE_URL}/api/comp-off/credits?status=pending",
                         headers=H(tokens["hr"]), timeout=15)
        assert r.status_code == 200, r.text[:200]

    def test_request_and_approve_flow(self, tokens):
        # Employee creates request — use unique far-future date to avoid 409 from prior runs
        import uuid, datetime as dt
        # use a deterministic-ish unique date (within next 2 years)
        days = abs(hash(uuid.uuid4().hex)) % 720 + 30
        work_date = (dt.date.today() - dt.timedelta(days=days)).isoformat()
        payload = {"work_date": work_date, "reason": f"TEST_iter20 {uuid.uuid4().hex[:6]}"}
        r = requests.post(f"{BASE_URL}/api/comp-off/credits",
                          headers=H(tokens["employee"]), json=payload, timeout=15)
        assert r.status_code in (200, 201), f"create: {r.status_code} {r.text[:200]}"
        created = r.json()
        assert created.get("status") == "pending"
        assert "id" in created
        assert "expires_on" in created, "should have 90-day expiry"
        cid = created["id"]

        # HR approves
        r2 = requests.post(f"{BASE_URL}/api/comp-off/credits/{cid}/approve",
                           headers=H(tokens["hr"]), json={"reason": "ok"}, timeout=15)
        assert r2.status_code in (200, 204), f"approve: {r2.status_code} {r2.text[:200]}"

        # Verify state persisted
        r3 = requests.get(f"{BASE_URL}/api/comp-off/credits",
                          headers=H(tokens["employee"]), timeout=15)
        assert r3.status_code == 200
        items = [x for x in r3.json() if x.get("id") == cid]
        assert items and items[0]["status"] == "approved"

    def test_request_validation(self, tokens):
        r = requests.post(f"{BASE_URL}/api/comp-off/credits",
                          headers=H(tokens["employee"]), json={}, timeout=15)
        assert r.status_code in (400, 422)


# ----------------- Investment Declarations -----------------
class TestDeclarations:
    FY = "2026-2027"

    def test_get_me_autocreates(self, tokens):
        r = requests.get(f"{BASE_URL}/api/declarations/me?financial_year={self.FY}",
                         headers=H(tokens["employee"]), timeout=15)
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        assert d.get("financial_year") == self.FY
        assert "items" in d

    def test_save_and_persistence(self, tokens):
        payload = {
            "financial_year": self.FY,
            "tax_regime": "old",
            "items": [
                {"section": "80C", "label": "TEST_LIC #9999", "declared_amount": 75000, "proof_attached": False},
                {"section": "80D", "label": "TEST_Health ins",  "declared_amount": 12000, "proof_attached": True},
            ],
            "rent_monthly": 22000,
            "metro_city": True,
            "notes": "TEST_iteration20",
        }
        r = requests.post(f"{BASE_URL}/api/declarations/me",
                          headers=H(tokens["employee"]), json=payload, timeout=15)
        assert r.status_code in (200, 201), f"save: {r.status_code} {r.text[:200]}"

        r2 = requests.get(f"{BASE_URL}/api/declarations/me?financial_year={self.FY}",
                          headers=H(tokens["employee"]), timeout=15)
        assert r2.status_code == 200
        d = r2.json()
        assert d["rent_monthly"] == 22000
        assert d["tax_regime"] == "old"
        assert len(d["items"]) == 2
        labels = sorted(it["label"] for it in d["items"])
        assert labels == ["TEST_Health ins", "TEST_LIC #9999"]

    def test_submit(self, tokens):
        r = requests.post(f"{BASE_URL}/api/declarations/me/submit?financial_year={self.FY}",
                          headers=H(tokens["employee"]), timeout=15)
        assert r.status_code in (200, 204), f"submit: {r.status_code} {r.text[:200]}"
        # Verify status flipped
        r2 = requests.get(f"{BASE_URL}/api/declarations/me?financial_year={self.FY}",
                          headers=H(tokens["employee"]), timeout=15)
        assert r2.json().get("status") in ("submitted", "approved")


# ----------------- Bulk Import -----------------
class TestBulkImport:
    GOOD_CSV = (
        "email,name,employee_code,designation,department,branch_code,"
        "employee_type,phone,date_of_joining,ctc_annual,manager_email\n"
        "test_zoe_bi@acme.io,TEST_Zoe Import,TEST_BI1,SE,Engg,BLR-HQ,"
        "wfo,9999999999,2026-01-15,1200000,manager@acme.io\n"
    )
    BAD_CSV = "email\nnot-an-email\n"  # missing 'name' column

    def test_dry_run_good(self, tokens):
        files = {"file": ("good.csv", io.BytesIO(self.GOOD_CSV.encode()), "text/csv")}
        r = requests.post(f"{BASE_URL}/api/employees/bulk-import/dry-run",
                          headers={"Authorization": f"Bearer {tokens['hr']}"}, files=files, timeout=20)
        assert r.status_code == 200, f"dry-run: {r.status_code} {r.text[:300]}"
        body = r.json()
        assert any(k in body for k in ("row_count", "valid_rows", "validRows", "total_rows", "new_rows"))
        assert "errors" in body

    def test_dry_run_bad(self, tokens):
        files = {"file": ("bad.csv", io.BytesIO(self.BAD_CSV.encode()), "text/csv")}
        r = requests.post(f"{BASE_URL}/api/employees/bulk-import/dry-run",
                          headers={"Authorization": f"Bearer {tokens['hr']}"}, files=files, timeout=20)
        # Missing required column returns 422 — that is correct
        assert r.status_code in (200, 400, 422), r.text[:200]
        if r.status_code == 200:
            body = r.json()
            errs = body.get("errors") or body.get("row_errors") or []
            assert errs or body.get("valid_rows", 0) == 0

    def test_employee_cannot_dry_run(self, tokens):
        files = {"file": ("x.csv", io.BytesIO(self.GOOD_CSV.encode()), "text/csv")}
        r = requests.post(f"{BASE_URL}/api/employees/bulk-import/dry-run",
                          headers={"Authorization": f"Bearer {tokens['employee']}"}, files=files, timeout=15)
        assert r.status_code in (401, 403), f"employee must be blocked: {r.status_code}"


# ----------------- Audit Log -----------------
class TestAudit:
    def test_list_as_hr(self, tokens):
        r = requests.get(f"{BASE_URL}/api/audit/events?limit=50",
                         headers=H(tokens["hr"]), timeout=15)
        assert r.status_code == 200, f"audit list: {r.status_code} {r.text[:200]}"
        body = r.json()
        assert isinstance(body, (list, dict))

    def test_list_200_limit(self, tokens):
        r = requests.get(f"{BASE_URL}/api/audit/events?limit=200",
                         headers=H(tokens["hr"]), timeout=15)
        assert r.status_code == 200

    def test_employee_forbidden(self, tokens):
        r = requests.get(f"{BASE_URL}/api/audit/events?limit=10",
                         headers=H(tokens["employee"]), timeout=15)
        assert r.status_code in (401, 403), f"employee must not access audit: {r.status_code}"
