"""Phase 2B / 2C / 2D smoke tests — payroll run, exports, F&F settlement."""
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
def _ensure_modules_active():
    """Ensure `payroll` and `expense` modules are active for ACME so Phase 2/1H tests run.
    test_modules_phase0.py toggles them off during its runs."""
    tok = _login({"email": "admin@hrms.io", "password": "Admin@123"})
    # Find ACME company
    rows = requests.get(f"{API}/companies", headers=_h(tok), timeout=15).json()
    acme = next((c for c in rows if c.get("name") == "ACME Global"), rows[0] if rows else None)
    if not acme:
        return
    cid = acme["id"]
    for mid in ("payroll", "expense"):
        requests.post(
            f"{API}/modules/company/{cid}/enable",
            headers=_h(tok),
            json={"module_id": mid, "mode": "active"},
            timeout=15,
        )
    yield


@pytest.fixture(scope="module")
def hr_tok():
    return _login(HR)


@pytest.fixture(scope="module")
def emp_tok():
    return _login(EMP)


# ---------------------------------------------------------------------------
# Phase 2B — payroll run lifecycle
# ---------------------------------------------------------------------------
class TestPayrollRun:
    def _next_month(self):
        """Pick a YYYY-MM that isn't already present."""
        existing = {r["period_month"] for r in requests.get(f"{API}/payroll-runs", headers=_h(_login(HR))).json()}
        # Start 6 months ahead and walk forward
        t = date.today().replace(day=1)
        for offset in range(6, 24):
            y = t.year + (t.month + offset - 1) // 12
            m = (t.month + offset - 1) % 12 + 1
            ym = f"{y:04d}-{m:02d}"
            if ym not in existing:
                return ym
        raise RuntimeError("No free month")

    def test_create_compute_finalise_publish(self, hr_tok):
        ym = self._next_month()
        r = requests.post(f"{API}/payroll-runs", headers=_h(hr_tok),
                          json={"period_month": ym}, timeout=15)
        assert r.status_code == 200, r.text
        run = r.json()
        assert run["status"] == "draft"
        assert run["working_days"] > 0
        rid = run["id"]

        # Duplicate month blocked
        r2 = requests.post(f"{API}/payroll-runs", headers=_h(hr_tok),
                           json={"period_month": ym}, timeout=15)
        assert r2.status_code == 400

        # Finalise-before-compute blocked
        r3 = requests.post(f"{API}/payroll-runs/{rid}/finalise", headers=_h(hr_tok), timeout=15)
        assert r3.status_code == 400

        # Compute
        r4 = requests.post(f"{API}/payroll-runs/{rid}/compute", headers=_h(hr_tok), timeout=30)
        assert r4.status_code == 200, r4.text
        computed = r4.json()
        assert computed["status"] == "computed"
        assert computed["total_employees"] >= 1

        # Payslips listed
        r5 = requests.get(f"{API}/payslips?run_id={rid}", headers=_h(hr_tok), timeout=15)
        assert r5.status_code == 200
        slips = r5.json()
        assert len(slips) == computed["total_employees"]
        s0 = slips[0]
        for key in ("actual_gross", "actual_net", "paid_days", "lop_days", "working_days", "prorata_factor"):
            assert key in s0

        # Finalise then publish
        r6 = requests.post(f"{API}/payroll-runs/{rid}/finalise", headers=_h(hr_tok), timeout=15)
        assert r6.status_code == 200 and r6.json()["status"] == "finalised"

        r7 = requests.post(f"{API}/payroll-runs/{rid}/publish", headers=_h(hr_tok), timeout=15)
        assert r7.status_code == 200 and r7.json()["status"] == "published"

        # Re-compute blocked when locked
        r8 = requests.post(f"{API}/payroll-runs/{rid}/compute", headers=_h(hr_tok), timeout=10)
        assert r8.status_code == 400


class TestPayrollExports:
    def test_bank_advice_and_24q_download(self, hr_tok):
        runs = requests.get(f"{API}/payroll-runs", headers=_h(hr_tok), timeout=15).json()
        assert runs, "Need at least one payroll run"
        rid = runs[0]["id"]
        r = requests.get(f"{API}/payroll-runs/{rid}/exports/bank-advice", headers=_h(hr_tok), timeout=15)
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/csv")
        assert "Employee Code" in r.text and "IFSC" in r.text

        r2 = requests.get(f"{API}/payroll-runs/{rid}/exports/form-24q", headers=_h(hr_tok), timeout=15)
        assert r2.status_code == 200
        assert "PAN" in r2.text and "Taxable Income" in r2.text

        r3 = requests.get(f"{API}/payroll-runs/{rid}/exports/pf-ecr", headers=_h(hr_tok), timeout=15)
        assert r3.status_code == 200
        assert "UAN" in r3.text and "EPF Wages" in r3.text


# ---------------------------------------------------------------------------
# Phase 2C — investment declarations
# ---------------------------------------------------------------------------
class TestDeclarations:
    def test_employee_auto_create_and_submit(self, emp_tok):
        r = requests.get(f"{API}/declarations/me", headers=_h(emp_tok), timeout=15)
        assert r.status_code == 200
        d = r.json()
        fy = d["financial_year"]
        # status may be draft or submitted from a prior test run; approved blocks edits, so just ensure not that
        assert d["status"] != "approved"

        # Upsert some items
        payload = {
            "financial_year": fy, "tax_regime": "old",
            "items": [
                {"section": "80C", "label": "LIC premium", "declared_amount": 50000, "proof_attached": False},
                {"section": "80D", "label": "Health insurance", "declared_amount": 20000, "proof_attached": False},
            ],
            "rent_monthly": 25000, "metro_city": True,
        }
        r2 = requests.post(f"{API}/declarations/me", headers=_h(emp_tok), json=payload, timeout=15)
        assert r2.status_code == 200
        upd = r2.json()
        assert upd["total_declared"] == 70000
        assert upd["rent_monthly"] == 25000

        # Submit
        r3 = requests.post(f"{API}/declarations/me/submit?financial_year={fy}",
                           headers=_h(emp_tok), timeout=15)
        assert r3.status_code == 200


# ---------------------------------------------------------------------------
# Phase 2D — F&F settlement + loans
# ---------------------------------------------------------------------------
class TestFnF:
    def test_loan_create_and_fnf_settlement(self, hr_tok):
        # Pick first employee with current CTC
        comps = requests.get(f"{API}/compensation/all", headers=_h(hr_tok), timeout=15).json()
        assert comps, "Need an employee with current CTC"
        emp_id = comps[0]["employee_id"]

        # Create a loan
        r = requests.post(f"{API}/loans", headers=_h(hr_tok), json={
            "employee_id": emp_id, "loan_type": "salary_advance",
            "principal": 50000, "emi_monthly": 10000, "tenure_months": 5,
            "interest_pct": 0, "start_month": "2026-04",
        }, timeout=15)
        assert r.status_code == 200, r.text
        loan = r.json()
        assert loan["outstanding"] == 50000
        assert len(loan["schedule"]) == 5

        # Compute F&F with notice served
        lwd = "2026-12-31"
        r2 = requests.post(f"{API}/fnf/compute", headers=_h(hr_tok), json={
            "employee_id": emp_id, "last_working_day": lwd,
            "notice_served_days": 30, "bonus_pending": 10000,
        }, timeout=15)
        assert r2.status_code == 200, r2.text
        fnf = r2.json()
        assert fnf["status"] == "computed"
        assert fnf["loan_recovery"] == 50000
        assert fnf["total_earnings"] > 0
        assert fnf["bonus_pending"] == 10000
        assert fnf["net_payable"] == fnf["total_earnings"] - fnf["total_deductions"]
        fid = fnf["id"]

        # Approve
        r3 = requests.post(f"{API}/fnf/{fid}/approve", headers=_h(hr_tok), timeout=15)
        assert r3.status_code == 200 and r3.json()["status"] == "approved"

        # Mark paid → loan should auto-close
        r4 = requests.post(f"{API}/fnf/{fid}/mark-paid", headers=_h(hr_tok),
                           json={"payment_reference": "NEFT-TEST-001"}, timeout=15)
        assert r4.status_code == 200 and r4.json()["status"] == "paid"
        loans = requests.get(f"{API}/loans?employee_id={emp_id}", headers=_h(hr_tok), timeout=15).json()
        # All active loans for that employee should now be closed
        assert all(l["status"] != "active" for l in loans), f"Loans still active: {loans}"


# ---------------------------------------------------------------------------
# Phase 1E — Policies + settings
# ---------------------------------------------------------------------------
class TestPolicyAndSettings:
    def test_policy_crud_ack_flow(self, hr_tok, emp_tok):
        slug = f"test-policy-{date.today().isoformat()}"
        r = requests.post(f"{API}/policies", headers=_h(hr_tok), json={
            "title": "Test Policy", "slug": slug, "category": "it_security",
            "version": "1.0", "body_markdown": "# Test\nBody here.",
            "effective_from": date.today().isoformat(), "requires_acknowledgement": True,
        }, timeout=15)
        # Slug may collide across reruns → accept either creation or dup
        if r.status_code == 400 and "already" in r.text:
            rows = requests.get(f"{API}/policies", headers=_h(hr_tok), timeout=15).json()
            pol = next(p for p in rows if p["slug"] == slug)
        else:
            assert r.status_code == 200, r.text
            pol = r.json()

        if pol["status"] == "draft":
            rp = requests.post(f"{API}/policies/{pol['id']}/publish",
                               headers=_h(hr_tok), timeout=15)
            assert rp.status_code == 200

        # Employee sees it
        rlist = requests.get(f"{API}/policies", headers=_h(emp_tok), timeout=15)
        assert rlist.status_code == 200
        assert any(p["slug"] == slug for p in rlist.json())

        # Employee acknowledges
        rack = requests.post(f"{API}/policies/{slug}/acknowledge",
                             headers=_h(emp_tok), timeout=15)
        assert rack.status_code == 200

    def test_settings_fiscal_year(self, hr_tok, emp_tok):
        r = requests.get(f"{API}/company-settings/fiscal-year",
                         headers=_h(emp_tok), timeout=15)
        assert r.status_code == 200
        fy = r.json()
        assert fy["financial_year"] and "-" in fy["financial_year"]


# ---------------------------------------------------------------------------
# Phase 1G — Assets
# ---------------------------------------------------------------------------
class TestAssets:
    def test_asset_lifecycle(self, hr_tok):
        tag = f"TEST-LT-{date.today().isoformat().replace('-','')}"
        # Create
        r = requests.post(f"{API}/assets", headers=_h(hr_tok), json={
            "asset_tag": tag, "category": "laptop", "make": "Dell",
            "model": "XPS 15", "purchase_cost": 150000, "purchase_date": "2025-01-15",
            "useful_life_years": 4,
        }, timeout=15)
        if r.status_code == 400:
            r = requests.get(f"{API}/assets", headers=_h(hr_tok), timeout=15)
            asset = next(a for a in r.json() if a["asset_tag"] == tag)
        else:
            assert r.status_code == 200, r.text
            asset = r.json()
        assert asset["status"] in ("available", "assigned")

        # Assign to first employee
        employees = requests.get(f"{API}/employees", headers=_h(hr_tok), timeout=15).json()
        emp = next((e for e in employees if "hr@acme.io" not in e.get("email", "")), employees[0])
        if asset["status"] == "available":
            r2 = requests.post(f"{API}/asset-assignments/assign", headers=_h(hr_tok), json={
                "asset_id": asset["id"], "employee_id": emp["id"],
            }, timeout=15)
            assert r2.status_code == 200, r2.text
            assignment_id = r2.json()["id"]

            # Return
            r3 = requests.post(f"{API}/asset-assignments/{assignment_id}/return",
                               headers=_h(hr_tok),
                               json={"condition": "good"}, timeout=15)
            assert r3.status_code == 200


# ---------------------------------------------------------------------------
# Phase 1H — Expenses
# ---------------------------------------------------------------------------
class TestExpenses:
    def test_expense_create_submit_approve_flow(self, emp_tok, hr_tok):
        r = requests.post(f"{API}/expenses", headers=_h(emp_tok), json={
            "title": "TEST expense claim",
            "items": [
                {"category": "meals", "expense_date": date.today().isoformat(), "amount": 1500},
                {"category": "travel_taxi", "expense_date": date.today().isoformat(), "amount": 600},
            ],
        }, timeout=15)
        assert r.status_code == 200, r.text
        exp = r.json()
        assert exp["total_amount"] == 2100
        eid = exp["id"]

        r2 = requests.post(f"{API}/expenses/{eid}/submit", headers=_h(emp_tok), timeout=15)
        assert r2.status_code == 200
        assert r2.json()["status"] == "submitted"

        r3 = requests.post(f"{API}/expenses/{eid}/decide", headers=_h(hr_tok),
                           json={"decision": "approve"}, timeout=15)
        assert r3.status_code == 200
        assert r3.json()["status"] == "approved"

    def test_travel_request_submit_and_approve(self, emp_tok, hr_tok):
        r = requests.post(f"{API}/travel-requests", headers=_h(emp_tok), json={
            "purpose": "TEST client visit", "destinations": ["Mumbai"],
            "start_date": (date.today() + timedelta(days=10)).isoformat(),
            "end_date": (date.today() + timedelta(days=12)).isoformat(),
            "mode": "flight", "accommodation": True, "estimated_cost": 45000,
        }, timeout=15)
        assert r.status_code == 200, r.text
        tid = r.json()["id"]

        r2 = requests.post(f"{API}/travel-requests/{tid}/submit",
                           headers=_h(emp_tok), timeout=15)
        assert r2.status_code == 200

        r3 = requests.post(f"{API}/travel-requests/{tid}/decide",
                           headers=_h(hr_tok), json={"decision": "approve"}, timeout=15)
        assert r3.status_code == 200 and r3.json()["status"] == "approved"


# ---------------------------------------------------------------------------
# Phase 1F — Letters
# ---------------------------------------------------------------------------
class TestLetters:
    def test_template_create_generate_and_sign(self, hr_tok, emp_tok):
        slug = f"test-letter-{date.today().isoformat()}"
        r = requests.post(f"{API}/letter-templates", headers=_h(hr_tok), json={
            "name": "Test Letter", "slug": slug, "category": "other",
            "body_markdown": "Hello {{employee_name}}, today is {{today}}.",
        }, timeout=15)
        if r.status_code == 400:
            rows = requests.get(f"{API}/letter-templates", headers=_h(hr_tok), timeout=15).json()
            tpl = next(t for t in rows if t["slug"] == slug)
        else:
            assert r.status_code == 200, r.text
            tpl = r.json()

        employees = requests.get(f"{API}/employees", headers=_h(hr_tok), timeout=15).json()
        emp = next((e for e in employees if "employee@acme.io" in e.get("email", "")), employees[0])

        r2 = requests.post(f"{API}/letters/generate", headers=_h(hr_tok), json={
            "template_id": tpl["id"], "employee_id": emp["id"],
        }, timeout=15)
        assert r2.status_code == 200, r2.text
        letter = r2.json()
        assert emp["name"] in letter["rendered_markdown"]
        assert "today is" in letter["rendered_markdown"]
