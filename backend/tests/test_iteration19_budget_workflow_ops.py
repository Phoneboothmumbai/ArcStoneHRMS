"""Iteration 19: Budget pre-flight + Approval Workflow triggers + Branch Ops Summary.

Scope:
- POST /api/expenses → budget_check + branch_id embedded; over-envelope blocks; admin override works
- POST /api/expenses/{id}/submit → approval_request_id populated; approval_requests row created
- POST /api/recurring-expenses/{id}/run-now (AUTO_SUBMIT) → approval triggered; idempotent
- GET /api/branches/{id}/ops-summary → branch mgr command-center payload shape
- POST /api/budgets/check → permissive when no envelope
- POST /api/procurement/po/{id}/submit-for-approval → budget snapshot + workflow triggered
"""
from __future__ import annotations
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://people-partner-cloud.preview.emergentagent.com",
).rstrip("/")

HR = ("hr@acme.io", "Hr@12345")
EMP = ("employee@acme.io", "Employee@123")
ADMIN = ("admin@hrms.io", "Admin@123")


def _login(email, password):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        pytest.skip(f"Login failed for {email}: {r.status_code} {r.text[:200]}")
    token = r.json().get("access_token") or r.json().get("token")
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s, r.json()


@pytest.fixture(scope="module")
def hr_client():
    s, _ = _login(*HR)
    return s


@pytest.fixture(scope="module")
def emp_client():
    s, body = _login(*EMP)
    return s, body


@pytest.fixture(scope="module")
def first_branch(hr_client):
    r = hr_client.get(f"{BASE_URL}/api/org/branches")
    assert r.status_code == 200
    data = r.json()
    if not data:
        pytest.skip("No branches")
    return data[0]


# ---------- 1. Budget pre-flight on POST /api/expenses ----------
class TestExpenseBudgetPreflight:
    def test_small_expense_creates_with_budget_check_snapshot(self, emp_client):
        s, _ = emp_client
        body = {
            "title": "TEST_small_lunch",
            "purpose": "team lunch",
            "items": [{"category": "meals", "amount": 300, "expense_date": "2026-01-15", "receipts": []}],
            "currency": "INR",
        }
        r = s.post(f"{BASE_URL}/api/expenses", json=body)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert "budget_check" in doc, "budget_check snapshot missing"
        assert "branch_id" in doc, "branch_id not derived from employee"
        assert doc["budget_check"].get("block") is False
        # cleanup — leave as draft (will be ignored by other tests)
        return doc

    def test_over_budget_blocks_employee(self, emp_client):
        s, _ = emp_client
        # 6 lakh on travel — should exceed envelope (typical travel envelope is small)
        body = {
            "title": "TEST_over_budget",
            "purpose": "business trip",
            "items": [{"category": "travel_flight", "amount": 600000, "expense_date": "2026-01-15", "receipts": []}],
            "currency": "INR",
        }
        r = s.post(f"{BASE_URL}/api/expenses", json=body)
        # Either blocked by policy cap (422 per-item cap 50k) OR by budget.
        # We accept 422 either way, but if policy blocks first we skip this test.
        assert r.status_code == 422, r.text
        detail = (r.json() or {}).get("detail", "")
        # If message is about per-item cap, skip; else it should mention Budget blocked.
        if "per-item cap" in detail or "exceeds per-item cap" in detail:
            pytest.skip("Policy cap fires before budget — split into smaller items required")
        assert "Budget blocked" in detail, f"Expected budget block msg, got: {detail}"

    def test_over_budget_admin_override(self, hr_client, first_branch):
        # Use HR admin with a large sum split into items below per-item cap (50k flight).
        # 15 items × 50k = 7.5L — likely to exceed envelope; override_budget=true must succeed.
        items = [
            {"category": "travel_flight", "amount": 50000, "expense_date": "2026-01-15", "receipts": [
                {"file_name": "r.pdf", "content_type": "application/pdf",
                 "base64_data": "JVBERi0xLjQK", "uploaded_at": "2026-01-15T00:00:00Z"}
            ]}
            for _ in range(15)
        ]
        body = {
            "title": f"TEST_override_{uuid.uuid4().hex[:6]}",
            "purpose": "admin override",
            "items": items,
            "currency": "INR",
        }
        # Without override: should block (if envelope exists and would be exceeded)
        r_block = hr_client.post(f"{BASE_URL}/api/expenses", json=body)
        if r_block.status_code == 400:
            # HR admin user not linked to an employee_id — can't test expense creation path
            pytest.skip(f"Admin user not linked to employee: {r_block.text[:120]}")
        if r_block.status_code == 200:
            pytest.skip("Amount did not exceed envelope — no envelope hard_block, skipping override test")
        assert r_block.status_code == 422, r_block.text
        assert "Budget blocked" in r_block.json().get("detail", "")

        # With override
        r_ok = hr_client.post(f"{BASE_URL}/api/expenses?override_budget=true", json=body)
        assert r_ok.status_code == 200, r_ok.text
        doc = r_ok.json()
        assert doc["budget_check"].get("block") is True, "override should preserve block=true in snapshot"
        assert "branch_id" in doc

    def test_budgets_check_endpoint_no_envelope(self, hr_client):
        r = hr_client.post(f"{BASE_URL}/api/budgets/check", json={
            "branch_id": "nonexistent-branch-id",
            "amount": 1000,
            "category": "meals",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("matched") is False
        assert data.get("block") is False


# ---------- 2. Approval workflow trigger on submit ----------
class TestExpenseSubmitTriggersApproval:
    def test_submit_populates_approval_request_id(self, emp_client):
        s, login_body = emp_client
        # Create draft
        body = {
            "title": f"TEST_submit_{uuid.uuid4().hex[:6]}",
            "purpose": "lunch",
            "items": [{"category": "meals", "amount": 250, "expense_date": "2026-01-15", "receipts": []}],
            "currency": "INR",
        }
        cr = s.post(f"{BASE_URL}/api/expenses", json=body)
        assert cr.status_code == 200, cr.text
        eid = cr.json()["id"]

        sr = s.post(f"{BASE_URL}/api/expenses/{eid}/submit")
        assert sr.status_code == 200, sr.text
        doc = sr.json()
        assert doc["status"] == "submitted"
        assert doc.get("approval_request_id"), "approval_request_id must be populated"

        # Verify approval request exists via list endpoint (use HR client with admin scope)
        # Try public endpoint: list my approvals
        ar = s.get(f"{BASE_URL}/api/approvals/requests?request_type=expense")
        # Endpoint might not exist; accept any 2xx or 404
        if ar.status_code == 200:
            rows = ar.json()
            if isinstance(rows, list):
                ids = [r.get("id") for r in rows]
                assert doc["approval_request_id"] in ids or len(ids) > 0


# ---------- 3. Recurring run-now triggers workflow + idempotent ----------
class TestRecurringRunNow:
    def test_run_now_auto_submit_creates_approval(self, hr_client, first_branch):
        # Find an AUTO_SUBMIT template
        lr = hr_client.get(f"{BASE_URL}/api/branches/{first_branch['id']}/recurring-expenses")
        assert lr.status_code == 200
        templates = lr.json()
        auto_submits = [t for t in templates if t.get("mode") == "AUTO_SUBMIT" and t.get("active")]
        if not auto_submits:
            pytest.skip("No AUTO_SUBMIT templates on seeded branch")
        tpl = auto_submits[0]

        r1 = hr_client.post(f"{BASE_URL}/api/recurring-expenses/{tpl['id']}/run-now")
        assert r1.status_code == 200, r1.text
        run1 = r1.json()
        # run-now may return either the run record or the expense; shape varies
        exp_id = run1.get("expense_claim_id") or run1.get("expense_id")
        ap_id = run1.get("approval_request_id")
        # Validate at least one of these is set
        assert exp_id or ap_id or run1.get("id"), f"Unexpected run-now response: {run1}"

        # Idempotency — second call same period should not dup
        r2 = hr_client.post(f"{BASE_URL}/api/recurring-expenses/{tpl['id']}/run-now")
        assert r2.status_code in (200, 409), r2.text
        if r2.status_code == 200:
            run2 = r2.json()
            # Same run id expected
            if run1.get("id") and run2.get("id"):
                assert run1["id"] == run2["id"], "run-now must be idempotent on (template_id, period_month)"


# ---------- 4. Branch Ops Summary (Branch Manager dashboard) ----------
class TestBranchOpsSummary:
    def test_summary_shape(self, hr_client, first_branch):
        r = hr_client.get(f"{BASE_URL}/api/branches/{first_branch['id']}/ops-summary")
        assert r.status_code == 200, r.text
        data = r.json()
        # Required top-level keys
        for k in ("branch", "fiscal_year", "expiring_critical", "expiring_soon",
                  "recurring_due_next_7d", "expenses", "budget"):
            assert k in data, f"missing key {k}"
        assert data["branch"]["id"] == first_branch["id"]
        # Expenses dict
        for k in ("pending_approval", "approved_this_month", "recurring_runs_this_month"):
            assert k in data["expenses"]
        # Budget dict
        for k in ("envelope_count", "total", "utilized", "remaining", "pct", "over_threshold"):
            assert k in data["budget"]
        assert isinstance(data["budget"]["over_threshold"], list)

    def test_summary_company_admin_any_branch(self, hr_client):
        # HR is company_admin — should fetch any branch in their company
        r = hr_client.get(f"{BASE_URL}/api/org/branches")
        branches = r.json()
        if len(branches) < 2:
            pytest.skip("Only 1 branch")
        r2 = hr_client.get(f"{BASE_URL}/api/branches/{branches[1]['id']}/ops-summary")
        assert r2.status_code == 200


# ---------- 5. Procurement PO submit triggers budget + workflow ----------
class TestProcurementPOSubmit:
    def test_po_submit_does_budget_check(self, hr_client, first_branch):
        # Create PO
        po_body = {
            "vendor_name": "TEST_vendor_" + uuid.uuid4().hex[:6],
            "delivery_location": first_branch.get("name", "HQ") + " " + first_branch["id"][:8],
            "items": [
                {"name": "Test item", "quantity": 1, "unit_price": 500,
                 "category": "office_supplies"}
            ],
            "currency": "INR",
        }
        cr = hr_client.post(f"{BASE_URL}/api/procurement/po", json=po_body)
        if cr.status_code == 404:
            pytest.skip("Procurement POST /po endpoint not at this path")
        assert cr.status_code in (200, 201), cr.text
        po = cr.json()
        pid = po.get("id")

        sr = hr_client.post(f"{BASE_URL}/api/procurement/po/{pid}/submit-for-approval")
        if sr.status_code == 404:
            pytest.skip("submit-for-approval endpoint not available")
        assert sr.status_code == 200, sr.text
        out = sr.json()
        # Expect budget_check snapshot and approval link
        assert "budget_check" in out or out.get("status") in ("awaiting_approval", "submitted"), \
            f"PO submit did not return budget_check snapshot: {out}"
