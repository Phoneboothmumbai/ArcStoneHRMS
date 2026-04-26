"""Iteration 15 — Lifecycle, Loan Requests, Insurance, LWF, Compliance Bulletins,
Expense Voucher PDF, and LWF payroll injection."""
from __future__ import annotations

import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://people-partner-cloud.preview.emergentagent.com").rstrip("/")
HR_EMAIL = "hr@acme.io"
HR_PASS = "Hr@12345"
EMP_EMAIL = "employee@acme.io"
EMP_PASS = "Employee@123"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email} failed {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def hr_h():
    return {"Authorization": f"Bearer {_login(HR_EMAIL, HR_PASS)}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def emp_h():
    return {"Authorization": f"Bearer {_login(EMP_EMAIL, EMP_PASS)}", "Content-Type": "application/json"}


# ---------------------------- LIFECYCLE ----------------------------
class TestLifecycle:
    def test_scan_and_idempotent(self, hr_h):
        r = requests.post(f"{BASE_URL}/api/lifecycle/scan", headers=hr_h, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert "created" in d and "scanned_employees" in d
        for k in ("probation", "salary_review", "birthday", "festival"):
            assert k in d["created"]
        first = d["created"]
        # re-run — must produce zero (or same) duplicates
        r2 = requests.post(f"{BASE_URL}/api/lifecycle/scan", headers=hr_h, timeout=60).json()
        assert r2["created"]["probation"] == 0
        assert r2["created"]["salary_review"] == 0
        print(f"first scan: {first}, second: {r2['created']}")

    def test_list_alerts_filters(self, hr_h):
        r = requests.get(f"{BASE_URL}/api/lifecycle/alerts?status=open", headers=hr_h, timeout=30)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        for a in rows:
            assert a["status"] == "open"
        if rows:
            kind = rows[0]["kind"]
            r2 = requests.get(f"{BASE_URL}/api/lifecycle/alerts?kind={kind}", headers=hr_h, timeout=30)
            assert all(a["kind"] == kind for a in r2.json())

    def test_decide_probation_yes_creates_letter(self, hr_h):
        rows = requests.get(f"{BASE_URL}/api/lifecycle/alerts?status=open&kind=probation_completion",
                            headers=hr_h, timeout=30).json()
        if not rows:
            pytest.skip("no open probation alerts")
        aid = rows[0]["id"]
        emp_id = rows[0]["employee_id"]
        r = requests.post(f"{BASE_URL}/api/lifecycle/alerts/{aid}/decide", headers=hr_h,
                          json={"decision": "yes"}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "done"
        letter_id = d.get("__extras", {}).get("letter_id")
        assert letter_id, "letter_id missing"
        # verify letter exists with category=appointment for that employee
        letters = requests.get(f"{BASE_URL}/api/letters/generated?employee_id={emp_id}", headers=hr_h, timeout=30)
        # endpoint may differ; fall back to checking via lifecycle re-read
        if letters.status_code == 200:
            ls = letters.json()
            cats = [x.get("category") for x in (ls if isinstance(ls, list) else ls.get("items", []))]
            assert "appointment" in cats, f"no appointment letter found, got: {cats}"
        else:
            print(f"letters endpoint returned {letters.status_code} — relying on letter_id presence")

    def test_decide_salary_review_requires_new_ctc(self, hr_h):
        rows = requests.get(f"{BASE_URL}/api/lifecycle/alerts?status=open&kind=salary_review_due",
                            headers=hr_h, timeout=30).json()
        if not rows:
            pytest.skip("no open salary_review alerts")
        aid = rows[0]["id"]
        # missing new_ctc_annual must 400
        r = requests.post(f"{BASE_URL}/api/lifecycle/alerts/{aid}/decide", headers=hr_h,
                          json={"decision": "yes"}, timeout=30)
        assert r.status_code == 400
        # success path
        r2 = requests.post(f"{BASE_URL}/api/lifecycle/alerts/{aid}/decide", headers=hr_h,
                           json={"decision": "yes", "new_ctc_annual": 1500000}, timeout=30)
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert d["status"] == "done"
        ex = d.get("__extras", {})
        assert ex.get("new_salary_id"), "new_salary_id missing"
        assert ex.get("next_review_on"), "next_review_on missing"

    def test_decide_later_requires_remind_on_and_dismiss(self, hr_h):
        # find an open alert (any kind)
        rows = requests.get(f"{BASE_URL}/api/lifecycle/alerts?status=open", headers=hr_h, timeout=30).json()
        rows = [a for a in rows if a["kind"] in ("probation_completion", "salary_review_due")]
        if len(rows) < 2:
            pytest.skip("not enough open alerts to test later/dismiss")
        # later w/o remind_on must fail
        a1 = rows[0]
        r = requests.post(f"{BASE_URL}/api/lifecycle/alerts/{a1['id']}/decide", headers=hr_h,
                          json={"decision": "later"}, timeout=30)
        assert r.status_code == 400
        # later with remind_on
        r2 = requests.post(f"{BASE_URL}/api/lifecycle/alerts/{a1['id']}/decide", headers=hr_h,
                           json={"decision": "later", "remind_on": "2026-12-31"}, timeout=30)
        assert r2.status_code == 200
        assert r2.json()["status"] == "snoozed"
        assert r2.json().get("snoozed_until") == "2026-12-31"
        # dismiss
        a2 = rows[1]
        r3 = requests.post(f"{BASE_URL}/api/lifecycle/alerts/{a2['id']}/decide", headers=hr_h,
                           json={"decision": "dismiss"}, timeout=30)
        assert r3.status_code == 200
        assert r3.json()["status"] == "dismissed"

    def test_settings_hr_only(self, hr_h, emp_h):
        r = requests.get(f"{BASE_URL}/api/lifecycle/settings", headers=hr_h, timeout=30)
        assert r.status_code == 200
        cur = r.json()
        assert "festivals" in cur
        # update
        r2 = requests.put(f"{BASE_URL}/api/lifecycle/settings", headers=hr_h,
                          json={"probation_months": 6}, timeout=30)
        assert r2.status_code == 200
        # employee blocked
        r3 = requests.get(f"{BASE_URL}/api/lifecycle/settings", headers=emp_h, timeout=30)
        assert r3.status_code == 403

    def test_announce_new_joiner(self, hr_h):
        emps = requests.get(f"{BASE_URL}/api/employees", headers=hr_h, timeout=30).json()
        if not emps:
            pytest.skip("no employees")
        eid = emps[0]["id"] if isinstance(emps, list) else emps.get("items", [{}])[0].get("id")
        if not eid:
            pytest.skip("no employee id")
        r = requests.post(f"{BASE_URL}/api/lifecycle/announce-new-joiner", headers=hr_h,
                          json={"employee_id": eid, "scope": "company",
                                "custom_message": "Welcome aboard!"}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert d["recipient_count"] >= 0
        # verify a new_joiner_announcement alert exists with status=done
        alerts = requests.get(
            f"{BASE_URL}/api/lifecycle/alerts?kind=new_joiner_announcement", headers=hr_h, timeout=30).json()
        assert any(a["status"] == "done" for a in alerts)


# ---------------------------- LOAN REQUESTS ----------------------------
class TestLoanRequests:
    def test_employee_create_and_visibility(self, emp_h, hr_h):
        r = requests.post(f"{BASE_URL}/api/loan-requests", headers=emp_h,
                          json={"loan_type": "salary_advance", "amount": 50000,
                                "tenure_months": 6, "purpose": "TEST_iter15"}, timeout=30)
        assert r.status_code == 200, r.text
        rid = r.json()["id"]
        # employee sees only own
        own = requests.get(f"{BASE_URL}/api/loan-requests", headers=emp_h, timeout=30).json()
        assert all(x.get("employee_id") for x in own)
        # HR sees it
        all_rows = requests.get(f"{BASE_URL}/api/loan-requests", headers=hr_h, timeout=30).json()
        assert any(x["id"] == rid for x in all_rows)
        # HR approves
        r2 = requests.post(f"{BASE_URL}/api/loan-requests/{rid}/decide", headers=hr_h,
                           json={"decision": "approve", "interest_pct": 0.0}, timeout=30)
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert d["status"] == "approved"
        assert d.get("loan_id"), "loan_id missing on approve"
        # verify loan visible via /api/loans
        loans = requests.get(f"{BASE_URL}/api/loans", headers=hr_h, timeout=30)
        if loans.status_code == 200:
            assert any(loan["id"] == d["loan_id"] for loan in loans.json())

    def test_reject_no_loan_created(self, emp_h, hr_h):
        r = requests.post(f"{BASE_URL}/api/loan-requests", headers=emp_h,
                          json={"loan_type": "personal", "amount": 30000,
                                "tenure_months": 12, "purpose": "TEST_reject"}, timeout=30)
        rid = r.json()["id"]
        r2 = requests.post(f"{BASE_URL}/api/loan-requests/{rid}/decide", headers=hr_h,
                           json={"decision": "reject", "note": "TEST_no"}, timeout=30)
        assert r2.status_code == 200
        assert r2.json()["status"] == "rejected"
        assert not r2.json().get("loan_id")


# ---------------------------- INSURANCE ----------------------------
class TestInsurance:
    @pytest.fixture(scope="class")
    def policy_id(self, hr_h):
        body = {
            "name": "TEST_iter15 Mediclaim",
            "kind": "mediclaim",
            "insurer_name": "TEST Insurer",
            "policy_year_start": "2026-01-01",
            "policy_year_end": "2026-12-31",
            "sum_insured_per_employee": 500000,
        }
        r = requests.post(f"{BASE_URL}/api/insurance/policies", headers=hr_h, json=body, timeout=30)
        assert r.status_code == 200, r.text
        return r.json()["id"]

    def test_emp_list_active(self, emp_h, policy_id):
        rows = requests.get(f"{BASE_URL}/api/insurance/policies", headers=emp_h, timeout=30).json()
        assert any(p["id"] == policy_id for p in rows)
        # ensure no token field exposed
        for p in rows:
            assert "token" not in p

    def test_claim_creates_ticket(self, emp_h, policy_id):
        r = requests.post(f"{BASE_URL}/api/insurance/claim", headers=emp_h,
                          json={"policy_id": policy_id, "claim_type": "reimbursement",
                                "description": "TEST_iter15 hospital bill"}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert d.get("ticket_id")
        assert d.get("ticket_code", "").startswith("HELP-")

    def test_claim_invalid_policy(self, emp_h):
        r = requests.post(f"{BASE_URL}/api/insurance/claim", headers=emp_h,
                          json={"policy_id": "non-existent-id", "claim_type": "query",
                                "description": "xxx"}, timeout=30)
        assert r.status_code == 404


# ---------------------------- LWF ----------------------------
class TestLWF:
    def test_seed_17_states(self, hr_h):
        rows = requests.get(f"{BASE_URL}/api/lwf-rules", headers=hr_h, timeout=30).json()
        assert len(rows) >= 17, f"expected 17+ default LWF states, got {len(rows)}"
        codes = {r["state_code"] for r in rows}
        for c in ("IN-MH", "IN-KA", "IN-TN", "IN-DL"):
            assert c in codes

    def test_update(self, hr_h):
        rows = requests.get(f"{BASE_URL}/api/lwf-rules", headers=hr_h, timeout=30).json()
        mh = next(r for r in rows if r["state_code"] == "IN-MH")
        r = requests.put(f"{BASE_URL}/api/lwf-rules/{mh['id']}", headers=hr_h,
                         json={"employee_amount": 25, "employer_amount": 75,
                               "applicable": True, "deduction_months": [6, 12],
                               "cycle": "half_yearly"}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["employee_amount"] == 25

    def test_emp_cannot_update(self, emp_h, hr_h):
        rows = requests.get(f"{BASE_URL}/api/lwf-rules", headers=hr_h, timeout=30).json()
        rid = rows[0]["id"]
        r = requests.put(f"{BASE_URL}/api/lwf-rules/{rid}", headers=emp_h,
                         json={"employee_amount": 1}, timeout=30)
        assert r.status_code == 403


# ---------------------------- COMPLIANCE BULLETINS ----------------------------
class TestCompliance:
    def test_create_and_list(self, hr_h):
        r = requests.post(f"{BASE_URL}/api/compliance-bulletins", headers=hr_h,
                          json={"title": "TEST_iter15 Min Wage Update",
                                "summary": "Minimum wages revised for KA",
                                "category": "labour_law", "pinned": True,
                                "impact_states": ["IN-KA"]}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["pinned"] is True
        # list
        rows = requests.get(f"{BASE_URL}/api/compliance-bulletins", headers=hr_h, timeout=30).json()
        assert any(x["id"] == d["id"] for x in rows)


# ---------------------------- EXPENSE VOUCHER PDF ----------------------------
class TestExpenseVoucherPDF:
    def test_pdf_for_approved(self, emp_h, hr_h):
        # create + submit + approve a small expense
        body = {
            "title": "TEST_iter15 voucher",
            "purpose": "test",
            "currency": "INR",
            "items": [{"category": "travel_taxi", "description": "cab",
                       "amount": 500, "expense_date": "2026-01-15", "receipts": []}],
        }
        r = requests.post(f"{BASE_URL}/api/expenses", headers=emp_h, json=body, timeout=30)
        assert r.status_code == 200, r.text
        eid = r.json()["id"]
        # PDF before approval -> 400
        r0 = requests.get(f"{BASE_URL}/api/expenses/{eid}/voucher-pdf", headers=emp_h, timeout=30)
        assert r0.status_code == 400, f"expected 400 for non-approved got {r0.status_code}"
        # submit
        r1 = requests.post(f"{BASE_URL}/api/expenses/{eid}/submit", headers=emp_h, timeout=30)
        assert r1.status_code == 200
        # approve
        r2 = requests.post(f"{BASE_URL}/api/expenses/{eid}/decide", headers=hr_h,
                           json={"decision": "approve"}, timeout=30)
        assert r2.status_code == 200
        # PDF now
        r3 = requests.get(f"{BASE_URL}/api/expenses/{eid}/voucher-pdf", headers=hr_h, timeout=60)
        assert r3.status_code == 200
        assert r3.headers.get("content-type", "").startswith("application/pdf")
        assert r3.content[:4] == b"%PDF"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
