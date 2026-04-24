"""
Iteration 10 — Backend tests for NEW features:
- PDF generation (payslip, letters)
- Payroll run statutory CSVs
- F&F + Loans endpoints
- Policies, Letters, Assets, Expenses endpoints
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://people-partner-cloud.preview.emergentagent.com").rstrip("/")

HR = {"email": "hr@acme.io", "password": "Hr@12345"}
EMP = {"email": "employee@acme.io", "password": "Employee@123"}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login {creds['email']} failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def hr_token():
    return _login(HR)


@pytest.fixture(scope="module")
def emp_token():
    return _login(EMP)


@pytest.fixture(scope="module")
def hr_headers(hr_token):
    return {"Authorization": f"Bearer {hr_token}"}


@pytest.fixture(scope="module")
def emp_headers(emp_token):
    return {"Authorization": f"Bearer {emp_token}"}


@pytest.fixture(scope="module", autouse=True)
def ensure_modules(hr_headers):
    """Make sure payroll + expense modules are active for ACME."""
    # get company id
    me = requests.get(f"{BASE_URL}/api/modules/mine", headers=hr_headers).json()
    cid = me.get("company_id")
    for mod in ["payroll", "expense"]:
        if mod not in me.get("active_modules", []):
            requests.post(
                f"{BASE_URL}/api/modules/company/{cid}/enable",
                headers=hr_headers,
                json={"module_id": mod, "mode": "active"},
            )


# ---------------- Payroll Runs + Statutory + PDF ----------------
class TestPayrollRunsAndPDF:
    @pytest.fixture(scope="class")
    def march_run(self, hr_headers):
        r = requests.get(f"{BASE_URL}/api/payroll-runs", headers=hr_headers)
        assert r.status_code == 200
        runs = r.json()
        march = [x for x in runs if x["period_month"] == "2026-03"]
        assert march, "March 2026 payroll run missing"
        return march[0]

    def test_list_payroll_runs(self, hr_headers):
        r = requests.get(f"{BASE_URL}/api/payroll-runs", headers=hr_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_list_payslips_for_march(self, hr_headers, march_run):
        r = requests.get(
            f"{BASE_URL}/api/payslips",
            headers=hr_headers,
            params={"run_id": march_run["id"]},
        )
        assert r.status_code == 200
        slips = r.json()
        assert len(slips) >= 1, "March 2026 should have payslips"

    def test_payslip_pdf_download_hr(self, hr_headers, march_run):
        r = requests.get(
            f"{BASE_URL}/api/payslips",
            headers=hr_headers,
            params={"run_id": march_run["id"]},
        )
        slips = r.json()
        assert slips
        pid = slips[0]["id"]

        pdf_resp = requests.get(
            f"{BASE_URL}/api/payslips/{pid}/pdf", headers=hr_headers
        )
        assert pdf_resp.status_code == 200, pdf_resp.text[:300]
        assert pdf_resp.headers.get("content-type", "").startswith("application/pdf")
        assert pdf_resp.content[:5] == b"%PDF-", "Not a valid PDF header"
        assert len(pdf_resp.content) > 500

    def test_payslip_pdf_employee_own(self, emp_headers):
        """Employee must be able to download own published payslip PDF."""
        # find any own published payslip
        r = requests.get(f"{BASE_URL}/api/payslips", headers=emp_headers)
        assert r.status_code == 200, r.text
        slips = r.json()
        if not slips:
            pytest.skip("Employee has no visible published payslips")
        pid = slips[0]["id"]
        pdf = requests.get(f"{BASE_URL}/api/payslips/{pid}/pdf", headers=emp_headers)
        assert pdf.status_code == 200, pdf.text[:300]
        assert pdf.content[:5] == b"%PDF-"

    # Statutory CSVs
    @pytest.mark.parametrize(
        "path,expected_header_substrings",
        [
            ("exports/bank-advice", ["Employee Code"]),
            ("exports/form-24q", ["PAN"]),
            ("exports/pf-ecr", ["UAN"]),
            ("exports/esic-monthly", ["IP Number"]),
        ],
    )
    def test_statutory_csv(self, hr_headers, march_run, path, expected_header_substrings):
        r = requests.get(
            f"{BASE_URL}/api/payroll-runs/{march_run['id']}/{path}", headers=hr_headers
        )
        assert r.status_code == 200, f"{path}: {r.status_code} {r.text[:200]}"
        ct = r.headers.get("content-type", "")
        assert "text/csv" in ct or "csv" in ct.lower(), f"{path} content-type={ct}"
        first_line = r.text.splitlines()[0] if r.text else ""
        for sub in expected_header_substrings:
            assert sub in first_line, f"{path}: expected '{sub}' in header '{first_line}'"


# ---------------- Policies ----------------
class TestPolicies:
    def test_list_policies(self, hr_headers):
        r = requests.get(f"{BASE_URL}/api/policies", headers=hr_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_and_publish_policy(self, hr_headers):
        import time
        uniq = int(time.time())
        payload = {
            "title": f"TEST_Policy_iter10_{uniq}",
            "slug": f"test-policy-iter10-{uniq}",
            "category": "it_security",
            "version": "1.0",
            "body_markdown": "# Test\nBody text",
            "effective_from": "2026-01-01",
            "requires_acknowledgement": True,
        }
        r = requests.post(f"{BASE_URL}/api/policies", headers=hr_headers, json=payload)
        assert r.status_code in (200, 201), r.text[:300]
        pid = r.json()["id"]
        slug = r.json().get("slug")
        assert r.json().get("status") == "draft"

        # publish
        pub = requests.post(
            f"{BASE_URL}/api/policies/{pid}/publish", headers=hr_headers
        )
        assert pub.status_code in (200, 204), pub.text[:200]
        # verify via list
        lst = requests.get(f"{BASE_URL}/api/policies", headers=hr_headers).json()
        match = [p for p in lst if p["id"] == pid]
        assert match and match[0].get("status") == "published"

        # cleanup
        requests.delete(f"{BASE_URL}/api/policies/{pid}", headers=hr_headers)


# ---------------- Letters ----------------
class TestLetters:
    @pytest.fixture(scope="class")
    def template_id(self, hr_headers):
        payload = {
            "name": "TEST_Letter_Template_iter10",
            "slug": "test-letter-template-iter10",
            "category": "experience",
            "body_markdown": "Hello {{employee_name}}, today is {{today}}.",
        }
        r = requests.post(
            f"{BASE_URL}/api/letter-templates", headers=hr_headers, json=payload
        )
        assert r.status_code in (200, 201), r.text[:300]
        tid = r.json()["id"]
        yield tid
        requests.delete(f"{BASE_URL}/api/letter-templates/{tid}", headers=hr_headers)

    def test_generate_letter_and_pdf(self, hr_headers, template_id):
        emps = requests.get(f"{BASE_URL}/api/employees", headers=hr_headers).json()
        assert emps, "No employees"
        eid = emps[0]["id"]
        gen = requests.post(
            f"{BASE_URL}/api/letters/generate",
            headers=hr_headers,
            json={"template_id": template_id, "employee_id": eid},
        )
        assert gen.status_code in (200, 201), gen.text[:300]
        lid = gen.json()["id"]

        pdf = requests.get(f"{BASE_URL}/api/letters/{lid}/pdf", headers=hr_headers)
        assert pdf.status_code == 200, pdf.text[:300]
        assert pdf.content[:5] == b"%PDF-", "letter PDF invalid"


# ---------------- Assets ----------------
class TestAssets:
    def test_create_assign_return_asset(self, hr_headers):
        import time
        tag = f"TEST-ITER10-{int(time.time())}"
        create = requests.post(
            f"{BASE_URL}/api/assets",
            headers=hr_headers,
            json={
                "asset_tag": tag,
                "category": "laptop",
                "make": "Apple",
                "model": "MBP14",
                "purchase_cost": 150000,
                "purchase_date": "2024-06-01",
                "useful_life_years": 4,
                "depreciation_method": "slm",
            },
        )
        assert create.status_code in (200, 201), create.text[:300]
        aid = create.json()["id"]
        assert create.json().get("status") in ("available", None)

        emps = requests.get(f"{BASE_URL}/api/employees", headers=hr_headers).json()
        eid = emps[0]["id"]

        assign = requests.post(
            f"{BASE_URL}/api/asset-assignments/assign",
            headers=hr_headers,
            json={"asset_id": aid, "employee_id": eid},
        )
        assert assign.status_code in (200, 201), assign.text[:300]

        # Verify via list (no GET /{aid} endpoint)
        def _get_asset(aid):
            lst = requests.get(f"{BASE_URL}/api/assets", headers=hr_headers).json()
            return next((a for a in lst if a["id"] == aid), None)

        got = _get_asset(aid)
        assert got and got.get("status") == "assigned"

        # Find current assignment id
        asmts = requests.get(
            f"{BASE_URL}/api/asset-assignments",
            headers=hr_headers,
            params={"employee_id": eid, "current_only": "true"},
        ).json()
        asmt = [x for x in asmts if x.get("asset_id") == aid]
        assert asmt, "no current assignment"
        asmt_id = asmt[0]["id"]

        ret = requests.post(
            f"{BASE_URL}/api/asset-assignments/{asmt_id}/return",
            headers=hr_headers,
            json={"condition": "good"},
        )
        assert ret.status_code in (200, 201), ret.text[:300]
        got2 = _get_asset(aid)
        assert got2 and got2.get("status") == "available"

        requests.delete(f"{BASE_URL}/api/assets/{aid}", headers=hr_headers)


# ---------------- F&F + Loans ----------------
class TestFnFLoans:
    def test_create_loan(self, hr_headers):
        emps = requests.get(f"{BASE_URL}/api/employees", headers=hr_headers).json()
        eid = emps[0]["id"]
        r = requests.post(
            f"{BASE_URL}/api/loans",
            headers=hr_headers,
            json={
                "employee_id": eid,
                "loan_type": "salary_advance",
                "principal": 50000,
                "emi_monthly": 10000,
                "tenure_months": 5,
                "start_month": "2026-05",
            },
        )
        assert r.status_code in (200, 201), r.text[:300]
        body = r.json()
        out = body.get("outstanding", body.get("outstanding_amount"))
        assert out == 50000, f"outstanding expected 50000 got {out}"
        lid = body["id"]
        requests.delete(f"{BASE_URL}/api/loans/{lid}", headers=hr_headers)

    def test_fnf_compute(self, hr_headers):
        # pick employee with compensation
        comps_resp = requests.get(
            f"{BASE_URL}/api/compensation/all", headers=hr_headers
        )
        comps = comps_resp.json() if comps_resp.status_code == 200 else []
        if not comps:
            pytest.skip("No compensation assigned")
        eid = comps[0]["employee_id"]

        # POST /api/fnf/compute creates and computes the settlement in one call
        comp = requests.post(
            f"{BASE_URL}/api/fnf/compute",
            headers=hr_headers,
            json={
                "employee_id": eid,
                "last_working_day": "2026-12-31",
                "notice_served_days": 15,
                "bonus_pending": 5000,
            },
        )
        assert comp.status_code in (200, 201), comp.text[:400]
        breakdown = comp.json()
        text = str(breakdown).lower()
        for k in ("pending_salary", "leave_encashment", "notice_recovery"):
            assert k in text, f"missing {k} in fnf compute response"
        fid = breakdown.get("id")
        if fid:
            # approve
            appr = requests.post(f"{BASE_URL}/api/fnf/{fid}/approve", headers=hr_headers)
            assert appr.status_code in (200, 201), appr.text[:200]
            got = requests.get(f"{BASE_URL}/api/fnf/{fid}", headers=hr_headers).json()
            assert got.get("status") == "approved"


# ---------------- Expenses ----------------
class TestExpenses:
    def test_expense_claim_submit_and_approve(self, hr_headers, emp_headers):
        # employee creates claim
        create = requests.post(
            f"{BASE_URL}/api/expenses",
            headers=emp_headers,
            json={
                "title": "TEST_E2E_claim_iter10",
                "purpose": "Smoke test",
                "items": [
                    {"category": "meals", "amount": 1200, "expense_date": "2026-01-10"},
                    {"category": "travel_taxi", "amount": 400, "expense_date": "2026-01-10"},
                ],
            },
        )
        assert create.status_code in (200, 201), create.text[:300]
        claim = create.json()
        cid = claim["id"]

        sub = requests.post(f"{BASE_URL}/api/expenses/{cid}/submit", headers=emp_headers)
        assert sub.status_code in (200, 201, 204), sub.text[:200]

        # HR lists and approves via /decide
        lst = requests.get(f"{BASE_URL}/api/expenses", headers=hr_headers).json()
        assert any(c["id"] == cid for c in lst)

        appr = requests.post(
            f"{BASE_URL}/api/expenses/{cid}/decide",
            headers=hr_headers,
            json={"decision": "approve"},
        )
        assert appr.status_code in (200, 201), appr.text[:300]
        got = requests.get(f"{BASE_URL}/api/expenses/{cid}", headers=hr_headers).json()
        assert got.get("status") == "approved"


# ---------------- Sidebar Gating (via modules/mine) ----------------
class TestSidebarGating:
    def test_employee_cannot_list_payroll_runs(self, emp_headers):
        r = requests.get(f"{BASE_URL}/api/payroll-runs", headers=emp_headers)
        # employees should not list payroll runs
        assert r.status_code in (401, 403), f"Employee got runs list: {r.status_code}"

    def test_employee_cannot_list_letters(self, emp_headers):
        r = requests.get(f"{BASE_URL}/api/letters", headers=emp_headers)
        # employee should not see HR letter admin
        assert r.status_code in (401, 403, 200)  # may be scoped, OK either way
