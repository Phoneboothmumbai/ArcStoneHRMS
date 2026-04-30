"""Iteration 18: Phase 3 (Branch Ops) + Phase 4 (Joining Kit/Procurement) + Phase 2 (Budgets)

Testing scope:
- Branch Documents CRUD + expiring alerts + 5MB limit
- Recurring Expenses CRUD + run-now idempotency + admin/run-due
- Joining Kit templates + issuances flow (create → issue → sign → return)
- Procurement category catalog
- Budgets CRUD + dashboard + pre-flight check (most-specific match)
"""
from __future__ import annotations
import base64
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://people-partner-cloud.preview.emergentagent.com").rstrip("/")
HR_EMAIL = "hr@acme.io"
HR_PASSWORD = "Hr@12345"
FY = "FY2027"


@pytest.fixture(scope="module")
def hr_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": HR_EMAIL, "password": HR_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"HR login failed: {r.status_code} {r.text[:200]}")
    token = r.json().get("access_token") or r.json().get("token")
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def first_branch(hr_client):
    r = hr_client.get(f"{BASE_URL}/api/org/branches")
    assert r.status_code == 200, r.text
    branches = r.json()
    if not branches:
        pytest.skip("No branches available")
    return branches[0]


# ---------- Branch Documents ----------
class TestBranchDocuments:
    def test_list_seeded_documents(self, hr_client, first_branch):
        r = hr_client.get(f"{BASE_URL}/api/branches/{first_branch['id']}/documents")
        assert r.status_code == 200
        docs = r.json()
        assert isinstance(docs, list)
        # Seed says 9 docs per branch on first 2 branches
        assert len(docs) >= 1, f"Expected seeded docs, got {len(docs)}"

    def test_filter_by_doc_type(self, hr_client, first_branch):
        r = hr_client.get(f"{BASE_URL}/api/branches/{first_branch['id']}/documents?doc_type=utility_bill")
        assert r.status_code == 200
        for d in r.json():
            assert d.get("doc_type") == "utility_bill"

    def test_upload_download_update_delete(self, hr_client, first_branch):
        bid = first_branch["id"]
        small_b64 = base64.b64encode(b"TEST_FILE_CONTENTS").decode()
        payload = {
            "doc_type": "utility_bill",
            "title": "TEST_Electricity_Bill",
            "vendor_name": "TEST Vendor",
            "amount": 1234.5,
            "expiry_date": "2027-12-31",
            "base64_data": small_b64,
            "file_name": "test.txt",
            "content_type": "text/plain",
        }
        r = hr_client.post(f"{BASE_URL}/api/branches/{bid}/documents", json=payload)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["title"] == "TEST_Electricity_Bill"
        assert doc["branch_id"] == bid
        doc_id = doc["id"]

        # Download
        r2 = hr_client.get(f"{BASE_URL}/api/branches/{bid}/documents/{doc_id}/file")
        assert r2.status_code == 200
        assert r2.json()["base64_data"] == small_b64

        # Update
        r3 = hr_client.put(f"{BASE_URL}/api/branches/{bid}/documents/{doc_id}",
                           json={"amount": 4321.0, "title": "TEST_Updated"})
        assert r3.status_code == 200
        assert r3.json()["amount"] == 4321.0
        assert r3.json()["title"] == "TEST_Updated"

        # Delete
        r4 = hr_client.delete(f"{BASE_URL}/api/branches/{bid}/documents/{doc_id}")
        assert r4.status_code == 200

        # Verify removed
        r5 = hr_client.get(f"{BASE_URL}/api/branches/{bid}/documents/{doc_id}/file")
        assert r5.status_code == 404

    def test_upload_oversize_rejected(self, hr_client, first_branch):
        big = base64.b64encode(b"x" * (6 * 1024 * 1024)).decode()  # ~6MB decoded
        payload = {
            "doc_type": "utility_bill", "title": "TEST_TOO_BIG",
            "base64_data": big,
        }
        r = hr_client.post(f"{BASE_URL}/api/branches/{first_branch['id']}/documents", json=payload)
        assert r.status_code == 413, r.status_code

    def test_expiring_endpoint(self, hr_client):
        r = hr_client.get(f"{BASE_URL}/api/branch-documents/expiring?days=365")
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        for r0 in rows:
            assert "days_until_expiry" in r0


# ---------- Recurring Expenses ----------
class TestRecurringExpenses:
    def test_list_seeded(self, hr_client, first_branch):
        r = hr_client.get(f"{BASE_URL}/api/branches/{first_branch['id']}/recurring-expenses")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_validate_update_run_idempotent(self, hr_client, first_branch):
        bid = first_branch["id"]
        # invalid day_of_month (>28) should 422/400
        bad = hr_client.post(f"{BASE_URL}/api/recurring-expenses", json={
            "branch_id": bid, "name": "TEST_Bad", "category": "subscription",
            "amount": 100, "mode": "AUTO_DRAFT", "day_of_month": 31,
        })
        assert bad.status_code in (400, 422)

        good = hr_client.post(f"{BASE_URL}/api/recurring-expenses", json={
            "branch_id": bid, "name": "TEST_Rec", "category": "subscription",
            "amount": 500, "mode": "AUTO_SUBMIT", "day_of_month": 5,
            "vendor_name": "TEST Vendor",
        })
        assert good.status_code == 200, good.text
        tpl = good.json()
        tpl_id = tpl["id"]
        assert tpl["next_run_at"]

        # Update day_of_month → recompute next_run_at
        upd = hr_client.put(f"{BASE_URL}/api/recurring-expenses/{tpl_id}",
                            json={"day_of_month": 10})
        assert upd.status_code == 200
        assert upd.json()["day_of_month"] == 10
        assert upd.json()["next_run_at"] != tpl["next_run_at"]

        # run-now (idempotent on (tpl, period))
        r1 = hr_client.post(f"{BASE_URL}/api/recurring-expenses/{tpl_id}/run-now", json={})
        assert r1.status_code == 200, r1.text
        run1 = r1.json()
        r2 = hr_client.post(f"{BASE_URL}/api/recurring-expenses/{tpl_id}/run-now", json={})
        assert r2.status_code == 200
        run2 = r2.json()
        assert run1.get("id") == run2.get("id"), "run-now should be idempotent"
        assert run1.get("expense_id") == run2.get("expense_id")

        # Runs history
        rh = hr_client.get(f"{BASE_URL}/api/recurring-expenses/{tpl_id}/runs")
        assert rh.status_code == 200
        assert len(rh.json()) >= 1

        # Cleanup
        d = hr_client.delete(f"{BASE_URL}/api/recurring-expenses/{tpl_id}")
        assert d.status_code == 200

    def test_admin_run_due(self, hr_client):
        r = hr_client.post(f"{BASE_URL}/api/recurring-expenses/admin/run-due")
        assert r.status_code == 200, r.text
        body = r.json()
        assert "fired" in body and "count" in body


# ---------- Joining Kit / Procurement ----------
class TestProcurementCatalog:
    def test_category_catalog(self, hr_client):
        r = hr_client.get(f"{BASE_URL}/api/procurement/category-catalog")
        assert r.status_code == 200
        cats = r.json()["categories"]
        assert len(cats) == 8, f"Expected 8 categories, got {len(cats)}"
        for c in cats:
            assert "key" in c or "id" in c or "name" in c


class TestJoiningKit:
    def test_list_templates_seeded(self, hr_client):
        r = hr_client.get(f"{BASE_URL}/api/joining-kit/templates")
        assert r.status_code == 200
        tpls = r.json()
        names = [t["name"] for t in tpls]
        assert len(tpls) >= 2, f"Expected seeded defaults, got {tpls}"
        assert any("Standard" in n for n in names) or any("Engineering" in n for n in names)

    def test_issuance_flow(self, hr_client):
        # Pick a template
        tpls = hr_client.get(f"{BASE_URL}/api/joining-kit/templates").json()
        assert tpls, "No templates"
        tpl = tpls[0]
        # Pick an employee
        emps = hr_client.get(f"{BASE_URL}/api/employees").json()
        if not emps:
            pytest.skip("No employees")
        emp = emps[0]
        # Create issuance
        r = hr_client.post(f"{BASE_URL}/api/joining-kit/issuances", json={
            "employee_id": emp["id"], "template_id": tpl["id"],
        })
        assert r.status_code == 200, r.text
        iss = r.json()
        assert iss["status"] == "draft"
        assert len(iss["items"]) == len(tpl.get("items", []))
        iss_id = iss["id"]

        # Mark issued
        r2 = hr_client.post(f"{BASE_URL}/api/joining-kit/issuances/{iss_id}/issue", json={"serials": {}})
        assert r2.status_code == 200
        assert r2.json()["status"] == "issued"
        for it in r2.json()["items"]:
            assert it.get("issued") is True

        # Sign
        r3 = hr_client.post(f"{BASE_URL}/api/joining-kit/issuances/{iss_id}/sign")
        assert r3.status_code == 200
        assert r3.json()["status"] == "completed"
        assert r3.json().get("employee_signature_at")

        # Return — find any returnable item
        returnable_skus = [it["sku"] for it in r3.json()["items"] if it.get("is_returnable")]
        if returnable_skus:
            r4 = hr_client.post(f"{BASE_URL}/api/joining-kit/issuances/{iss_id}/return",
                                json={"skus": returnable_skus})
            assert r4.status_code == 200
            assert r4.json()["status"] in ("returned", "partial")


# ---------- Budgets ----------
class TestBudgets:
    def test_list_fy2027(self, hr_client):
        r = hr_client.get(f"{BASE_URL}/api/budgets?fiscal_year={FY}")
        assert r.status_code == 200
        envs = r.json()
        assert isinstance(envs, list)
        for e in envs:
            assert "utilized" in e and "remaining" in e and "utilization_pct" in e

    def test_dashboard(self, hr_client):
        r = hr_client.get(f"{BASE_URL}/api/budgets/dashboard?fiscal_year={FY}")
        assert r.status_code == 200
        d = r.json()
        for k in ("envelope_count", "total_amount", "total_utilized", "by_branch"):
            assert k in d
        assert d["fiscal_year"] == FY

    def test_create_get_update_archive(self, hr_client, first_branch):
        # amount must be > 0
        bad = hr_client.post(f"{BASE_URL}/api/budgets", json={
            "name": "TEST_Bad", "branch_id": first_branch["id"],
            "fiscal_year": FY, "amount": 0,
        })
        assert bad.status_code in (400, 422)

        r = hr_client.post(f"{BASE_URL}/api/budgets", json={
            "name": "TEST_Budget_E2E", "branch_id": first_branch["id"],
            "fiscal_year": FY, "amount": 100000, "category": "travel",
        })
        assert r.status_code == 200, r.text
        env = r.json()
        env_id = env["id"]

        # Get
        g = hr_client.get(f"{BASE_URL}/api/budgets/{env_id}")
        assert g.status_code == 200
        assert g.json()["amount"] == 100000

        # Update
        u = hr_client.put(f"{BASE_URL}/api/budgets/{env_id}", json={"amount": 120000})
        assert u.status_code == 200
        assert u.json()["amount"] == 120000

        # Archive
        d = hr_client.delete(f"{BASE_URL}/api/budgets/{env_id}")
        assert d.status_code == 200
        # Get after archive → archived
        g2 = hr_client.get(f"{BASE_URL}/api/budgets/{env_id}")
        assert g2.status_code == 200
        assert g2.json().get("status") == "archived"

    def test_check_preflight(self, hr_client, first_branch):
        # Small amount — should be OK or warn
        r = hr_client.post(f"{BASE_URL}/api/budgets/check", json={
            "branch_id": first_branch["id"], "category": "travel", "amount": 50000,
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert "block" in body and "warn" in body and "matched" in body

        # Huge amount — should trigger block if matched
        r2 = hr_client.post(f"{BASE_URL}/api/budgets/check", json={
            "branch_id": first_branch["id"], "category": "travel", "amount": 99999999,
        })
        assert r2.status_code == 200
        b2 = r2.json()
        if b2["matched"]:
            assert b2["block"] is True
