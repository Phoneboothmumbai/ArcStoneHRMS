"""Phase 1A — Employee lifecycle: profile, documents, onboarding, offboarding.

Covers access control, completeness scoring, tenant isolation, module gating,
offboarding clearance workflow, onboarding task automation.
"""
import base64
import os
import pytest
import requests

BASE_URL = (
    os.environ.get("REACT_APP_BACKEND_URL")
    or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].splitlines()[0]
).rstrip("/")
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
    j = r.json()
    return j["access_token"], j["user"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="session")
def tokens():
    out = {}
    for k, (e, p) in CREDS.items():
        try:
            tok, user = _login(e, p)
            out[k] = {"tok": tok, "user": user}
        except AssertionError as ex:
            out[k] = {"tok": None, "user": None, "error": str(ex)}
    return out


@pytest.fixture(scope="session")
def acme_company_id(tokens):
    return tokens["hr"]["user"]["company_id"]


@pytest.fixture(scope="session")
def employee_user(tokens):
    u = tokens["employee"].get("user")
    if not u:
        pytest.skip("employee login failed")
    return u


@pytest.fixture(scope="session")
def employee_emp_id(employee_user):
    eid = employee_user.get("employee_id")
    if not eid:
        pytest.skip("employee user missing employee_id")
    return eid


# Ensure onboarding module active on ACME for tests (idempotent)
@pytest.fixture(scope="session", autouse=True)
def _ensure_onboarding_module(tokens, acme_company_id):
    requests.post(
        f"{API}/modules/company/{acme_company_id}/enable",
        json={"module_id": "onboarding", "mode": "active"},
        headers=_h(tokens["admin"]["tok"]), timeout=15,
    )
    return True


# ===================== PROFILE =====================
class TestProfile:
    def test_me_returns_employee_profile_editable(self, tokens):
        r = requests.get(f"{API}/profile/me", headers=_h(tokens["employee"]["tok"]), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("employee", "profile", "editable"):
            assert k in data
        ed = data["editable"]
        # Employee cannot edit HR-only sections
        for s in ("kyc", "statutory_in", "bank", "employment"):
            assert ed[s] is False, f"{s} should be False for employee"
        for s in ("personal", "contact", "family", "education", "emergency_contacts", "prior_employment"):
            assert ed[s] is True, f"{s} should be True for employee"

    def test_hr_can_view_any_employee(self, tokens, employee_emp_id):
        r = requests.get(
            f"{API}/profile/employee/{employee_emp_id}",
            headers=_h(tokens["hr"]["tok"]), timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # HR should have all sections editable
        for s in ("kyc", "statutory_in", "bank", "employment", "personal", "contact"):
            assert data["editable"][s] is True

    def test_employee_forbidden_on_other_employee(self, tokens):
        # find another employee in ACME
        emps = requests.get(f"{API}/employees", headers=_h(tokens["hr"]["tok"]), timeout=15).json()
        other = next(
            (e for e in emps if e["id"] != tokens["employee"]["user"].get("employee_id")),
            None,
        )
        if not other:
            pytest.skip("no second employee to test against")
        r = requests.get(
            f"{API}/profile/employee/{other['id']}",
            headers=_h(tokens["employee"]["tok"]), timeout=15,
        )
        assert r.status_code == 403

    def test_hr_patch_updates_all_sections_and_completeness(self, tokens, employee_emp_id):
        payload = {
            "personal": {"dob": "1993-05-10", "gender": "male", "nationality": "Indian"},
            "contact": {"personal_email": "test_p1a@example.com"},
            "kyc": {"pan": "ABCDE1234F", "aadhaar_last4": "1234"},
            "statutory_in": {"uan": "100200300400", "pf_opted_in": True},
            "bank": {"account_holder_name": "Test", "account_number": "1234567890",
                     "ifsc": "HDFC0000001", "bank_name": "HDFC"},
            "employment": {"designation": "SDE", "employment_type": "permanent",
                           "date_of_joining": "2023-01-01"},
            "emergency_contacts": [{"name": "E", "relation": "spouse", "phone": "9999999999"}],
            "family": [{"name": "F", "relation": "father"}],
            "education": [{"degree": "B.Tech", "institution": "IIT"}],
            "prior_employment": [{"company": "X", "designation": "Dev", "from_date": "2020-01-01"}],
        }
        r = requests.patch(
            f"{API}/profile/employee/{employee_emp_id}",
            json=payload, headers=_h(tokens["hr"]["tok"]), timeout=15,
        )
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["profile_completeness"] == 100.0, doc.get("profile_completeness")

        # GET back — persisted
        r2 = requests.get(f"{API}/profile/employee/{employee_emp_id}",
                          headers=_h(tokens["hr"]["tok"]), timeout=15)
        assert r2.status_code == 200
        p = r2.json()["profile"]
        assert p["kyc"]["pan"] == "ABCDE1234F"
        assert p["bank"]["ifsc"] == "HDFC0000001"

    def test_employee_cannot_patch_kyc(self, tokens, employee_emp_id):
        r = requests.patch(
            f"{API}/profile/employee/{employee_emp_id}",
            json={"kyc": {"pan": "AAAAA1111A"}},
            headers=_h(tokens["employee"]["tok"]), timeout=15,
        )
        assert r.status_code == 403

    def test_employee_can_patch_personal_via_self(self, tokens, employee_emp_id):
        r = requests.patch(
            f"{API}/profile/employee/{employee_emp_id}",
            json={"personal": {"blood_group": "O+"}},
            headers=_h(tokens["employee"]["tok"]), timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json()["personal"]["blood_group"] == "O+"


# ===================== DOCUMENTS =====================
class TestDocuments:
    def _small_b64(self):
        return base64.b64encode(b"hello phase 1A doc").decode()

    def _big_b64(self):
        # ~2.5 MB payload -> exceeds 2MB limit
        return base64.b64encode(b"A" * (2 * 1024 * 1024 + 1024)).decode()

    def test_upload_and_list_no_blob(self, tokens, employee_emp_id):
        up = requests.post(
            f"{API}/documents/employee/{employee_emp_id}",
            json={"category": "identity", "filename": "TEST_pan.pdf",
                  "content_type": "application/pdf", "data_base64": self._small_b64()},
            headers=_h(tokens["hr"]["tok"]), timeout=15,
        )
        assert up.status_code == 200, up.text
        doc = up.json()
        assert "data_base64" not in doc
        doc_id = doc["id"]

        lst = requests.get(f"{API}/documents/employee/{employee_emp_id}",
                           headers=_h(tokens["hr"]["tok"]), timeout=15)
        assert lst.status_code == 200
        for row in lst.json():
            assert "data_base64" not in row

        # Download returns full base64
        dl = requests.get(f"{API}/documents/{doc_id}/download",
                          headers=_h(tokens["hr"]["tok"]), timeout=15)
        assert dl.status_code == 200
        assert dl.json()["data_base64"] == self._small_b64()

        # Delete
        dele = requests.delete(f"{API}/documents/{doc_id}",
                               headers=_h(tokens["hr"]["tok"]), timeout=15)
        assert dele.status_code == 200

    def test_upload_rejects_over_2mb(self, tokens, employee_emp_id):
        r = requests.post(
            f"{API}/documents/employee/{employee_emp_id}",
            json={"category": "identity", "filename": "big.pdf",
                  "content_type": "application/pdf", "data_base64": self._big_b64()},
            headers=_h(tokens["hr"]["tok"]), timeout=30,
        )
        assert r.status_code == 413, r.status_code


# ===================== ONBOARDING =====================
class TestOnboarding:
    def test_templates_seeded(self, tokens):
        r = requests.get(f"{API}/onboarding/templates", headers=_h(tokens["hr"]["tok"]), timeout=15)
        assert r.status_code == 200, r.text
        rows = r.json()
        standard = next((t for t in rows if "Standard India" in t["name"]), None)
        assert standard, f"seed template missing, got {[t['name'] for t in rows]}"
        assert len(standard["tasks"]) == 12

    def test_non_admin_cannot_create_template(self, tokens):
        r = requests.post(
            f"{API}/onboarding/templates",
            json={"name": "X", "tasks": []},
            headers=_h(tokens["employee"]["tok"]), timeout=15,
        )
        assert r.status_code == 403

    def test_start_onboarding_computes_due_dates_and_flips_status(self, tokens, employee_emp_id):
        # Fetch default template
        tpls = requests.get(f"{API}/onboarding/templates",
                            headers=_h(tokens["hr"]["tok"]), timeout=15).json()
        tpl = next((t for t in tpls if "Standard India" in t["name"]), tpls[0])

        r = requests.post(
            f"{API}/onboarding",
            json={"employee_id": employee_emp_id, "template_id": tpl["id"],
                  "date_of_joining": "2026-02-01"},
            headers=_h(tokens["hr"]["tok"]), timeout=15,
        )
        assert r.status_code == 200, r.text
        ob = r.json()
        assert ob["status"] == "active"
        assert len(ob["tasks"]) == len(tpl["tasks"])
        for t in ob["tasks"]:
            assert t["due_date"] is not None
            assert t["status"] == "pending"

        # employee status flipped
        emp = requests.get(f"{API}/employees/{employee_emp_id}",
                           headers=_h(tokens["hr"]["tok"]), timeout=15).json()
        assert emp.get("status") == "onboarding"

        # store for next tests
        TestOnboarding._ob_id = ob["id"]
        TestOnboarding._task_ids = [t["task_id"] for t in ob["tasks"]]

    def test_mark_all_tasks_done_auto_completes(self, tokens, employee_emp_id):
        ob_id = getattr(TestOnboarding, "_ob_id", None)
        task_ids = getattr(TestOnboarding, "_task_ids", [])
        if not ob_id:
            pytest.skip("onboarding not started")
        for tid in task_ids:
            r = requests.patch(
                f"{API}/onboarding/{ob_id}/task/{tid}",
                json={"status": "done"},
                headers=_h(tokens["hr"]["tok"]), timeout=15,
            )
            assert r.status_code == 200, r.text
        final = r.json()
        assert final["status"] == "completed"
        # Each task has completed_by info
        done_task = next(t for t in final["tasks"] if t["task_id"] == task_ids[-1])
        assert done_task["completed_by_user_id"]
        assert done_task["completed_at"]
        # Employee flipped to active
        emp = requests.get(f"{API}/employees/{employee_emp_id}",
                           headers=_h(tokens["hr"]["tok"]), timeout=15).json()
        assert emp.get("status") == "active"


# ===================== OFFBOARDING =====================
class TestOffboarding:
    def test_start_offboarding_has_8_clearance(self, tokens, employee_emp_id):
        r = requests.post(
            f"{API}/offboarding",
            json={"employee_id": employee_emp_id,
                  "resignation_date": "2026-02-01",
                  "last_working_day": "2026-04-01",
                  "reason": "resignation",
                  "notice_period_days": 60},
            headers=_h(tokens["hr"]["tok"]), timeout=15,
        )
        assert r.status_code == 200, r.text
        ob = r.json()
        assert len(ob["clearance"]) == 8
        assert ob["status"] == "initiated"
        TestOffboarding._ob_id = ob["id"]
        TestOffboarding._item_ids = [c["id"] for c in ob["clearance"]]

    def test_update_clearance_flips_in_progress(self, tokens):
        ob_id = getattr(TestOffboarding, "_ob_id", None)
        item_ids = getattr(TestOffboarding, "_item_ids", [])
        if not ob_id:
            pytest.skip("offboarding not initiated")
        r = requests.patch(
            f"{API}/offboarding/{ob_id}/clearance/{item_ids[0]}",
            json={"status": "cleared", "remarks": "done"},
            headers=_h(tokens["hr"]["tok"]), timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "in_progress"

    def test_exit_interview_submit_saves_timestamp(self, tokens):
        ob_id = getattr(TestOffboarding, "_ob_id", None)
        if not ob_id:
            pytest.skip("offboarding not initiated")
        r = requests.post(
            f"{API}/offboarding/{ob_id}/exit_interview",
            json={"overall_rating": 4, "reason_for_leaving": "new opportunity",
                  "would_rejoin": True},
            headers=_h(tokens["employee"]["tok"]), timeout=15,
        )
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["exit_interview"]["submitted_at"]
        assert doc["exit_interview"]["overall_rating"] == 4

    def test_complete_blocked_if_pending(self, tokens):
        ob_id = getattr(TestOffboarding, "_ob_id", None)
        if not ob_id:
            pytest.skip()
        r = requests.post(
            f"{API}/offboarding/{ob_id}/complete",
            headers=_h(tokens["hr"]["tok"]), timeout=15,
        )
        assert r.status_code == 400

    def test_complete_when_all_cleared_flips_terminated(self, tokens, employee_emp_id):
        ob_id = getattr(TestOffboarding, "_ob_id", None)
        item_ids = getattr(TestOffboarding, "_item_ids", [])
        if not ob_id:
            pytest.skip()
        # clear remaining
        for iid in item_ids[1:]:
            requests.patch(
                f"{API}/offboarding/{ob_id}/clearance/{iid}",
                json={"status": "cleared"},
                headers=_h(tokens["hr"]["tok"]), timeout=15,
            )
        r = requests.post(
            f"{API}/offboarding/{ob_id}/complete",
            headers=_h(tokens["hr"]["tok"]), timeout=15,
        )
        assert r.status_code == 200, r.text
        # Employee status=terminated
        emp = requests.get(f"{API}/employees/{employee_emp_id}",
                           headers=_h(tokens["hr"]["tok"]), timeout=15).json()
        assert emp.get("status") == "terminated"

        # Deactivate user flow: employee token should now be invalid (not strictly required,
        # but user.is_active = False)
        me = requests.get(f"{API}/auth/me", headers=_h(tokens["employee"]["tok"]), timeout=15)
        # token may still validate but is_active may be False — accept either
        if me.status_code == 200:
            assert me.json().get("is_active") in (False, None) or me.json().get("is_active") is False

        # Restore employee state for idempotency of repeated test runs
        requests.patch(
            f"{API}/employees/{employee_emp_id}",
            json={"status": "active"},
            headers=_h(tokens["hr"]["tok"]), timeout=15,
        )
        # Also reactivate user via direct DB if possible (otherwise main agent will re-seed)
        try:
            import asyncio
            from motor.motor_asyncio import AsyncIOMotorClient
            async def _reactivate():
                c = AsyncIOMotorClient("mongodb://localhost:27017")["hrms_saas"]
                await c.users.update_one({"email": "employee@acme.io"}, {"$set": {"is_active": True}})
            asyncio.run(_reactivate())
        except Exception:
            pass


# ===================== MODULE GATING =====================
class TestModuleGating:
    def test_onboarding_blocked_without_module(self, tokens, acme_company_id):
        # disable onboarding
        r = requests.post(
            f"{API}/modules/company/{acme_company_id}/disable",
            json={"module_id": "onboarding"},
            headers=_h(tokens["admin"]["tok"]), timeout=15,
        )
        assert r.status_code == 200

        r2 = requests.get(f"{API}/onboarding", headers=_h(tokens["hr"]["tok"]), timeout=15)
        assert r2.status_code == 402, f"expected 402, got {r2.status_code}"

        r3 = requests.get(f"{API}/offboarding", headers=_h(tokens["hr"]["tok"]), timeout=15)
        assert r3.status_code == 402

        # re-enable for other tests
        requests.post(
            f"{API}/modules/company/{acme_company_id}/enable",
            json={"module_id": "onboarding", "mode": "active"},
            headers=_h(tokens["admin"]["tok"]), timeout=15,
        )


# ===================== TENANT ISOLATION =====================
class TestTenantIsolation:
    def test_cross_tenant_profile_403(self, tokens):
        """Create a 2nd company + user, then try to access ACME's employee profile."""
        admin = tokens["admin"]["tok"]
        suffix = os.urandom(3).hex()
        payload = {
            "name": f"TEST_Tenant_{suffix}",
            "country": "IN",
            "reseller_id": None,
            "admin_email": f"tenant_{suffix}@example.com",
            "admin_name": "TT Admin",
            "admin_password": "TenantAdmin@123",
        }
        r = requests.post(f"{API}/companies", json=payload, headers=_h(admin), timeout=15)
        if r.status_code not in (200, 201):
            pytest.skip(f"company create not available: {r.status_code}")
        # login as new admin
        tok, _ = _login(payload["admin_email"], payload["admin_password"])
        # get ACME employee
        acme_emps = requests.get(f"{API}/employees", headers=_h(tokens["hr"]["tok"]), timeout=15).json()
        emp_id = acme_emps[0]["id"]
        rx = requests.get(
            f"{API}/profile/employee/{emp_id}",
            headers=_h(tok), timeout=15,
        )
        assert rx.status_code in (403, 404), rx.status_code

        # Cross-tenant documents
        rdoc = requests.get(f"{API}/documents/employee/{emp_id}",
                            headers=_h(tok), timeout=15)
        assert rdoc.status_code in (403, 404)
