"""Iteration 16 — Org Chart templates, Branches, Projects, Employee patch (cycle protection)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://people-partner-cloud.preview.emergentagent.com").rstrip("/")
HR_EMAIL = "hr@acme.io"
HR_PASS = "Hr@12345"


@pytest.fixture(scope="module")
def hr_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": HR_EMAIL, "password": HR_PASS})
    assert r.status_code == 200, f"HR login failed: {r.status_code} {r.text}"
    s.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    return s


@pytest.fixture(scope="module")
def employees(hr_client):
    r = hr_client.get(f"{BASE_URL}/api/employees")
    assert r.status_code == 200
    return r.json()


# ------------------- ORG CHART TEMPLATES -------------------
class TestOrgChart:
    def test_reporting_template(self, hr_client):
        r = hr_client.get(f"{BASE_URL}/api/org/chart?template=reporting")
        assert r.status_code == 200
        d = r.json()
        assert d["template"] == "reporting"
        assert isinstance(d["roots"], list)
        assert "stats" in d and "employees" in d["stats"]
        # No cycles: walk and ensure no node is its own ancestor
        seen_ids = set()
        def walk(n, ancestors):
            assert n["id"] not in ancestors, f"Cycle detected at {n['id']}"
            ancestors.add(n["id"])
            seen_ids.add(n["id"])
            for c in n.get("children", []):
                walk(c, set(ancestors))
            # Required keys
            for k in ("id", "name", "job_title", "manager_id", "children"):
                assert k in n
        for r0 in d["roots"]:
            walk(r0, set())
        assert d["stats"]["employees"] >= 1

    def test_functional_template(self, hr_client):
        r = hr_client.get(f"{BASE_URL}/api/org/chart?template=functional")
        assert r.status_code == 200
        d = r.json()
        assert d["template"] == "functional"
        assert isinstance(d["groups"], list)
        for g in d["groups"]:
            assert g["group_kind"] == "department"
            assert "group_id" in g and "group_name" in g
            assert "count" in g and "roots" in g
        assert "departments" in d["stats"] and "employees" in d["stats"]

    def test_location_template(self, hr_client):
        r = hr_client.get(f"{BASE_URL}/api/org/chart?template=location")
        assert r.status_code == 200
        d = r.json()
        assert d["template"] == "location"
        for g in d["groups"]:
            assert g["group_kind"] == "branch"
            # state_code key is exposed (may be None) and is_head_office key is exposed for branch groups
            if g["group_id"] != "_unassigned":
                assert "state_code" in g
                assert "is_head_office" in g

    def test_project_template(self, hr_client):
        # Create a project first
        proj = {"name": "TEST_iter16_project_chart", "code": "T16C", "member_ids": []}
        r = hr_client.post(f"{BASE_URL}/api/org/projects", json=proj)
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        try:
            r = hr_client.get(f"{BASE_URL}/api/org/chart?template=project")
            assert r.status_code == 200
            d = r.json()
            assert d["template"] == "project"
            assert any(g["group_id"] == pid for g in d["groups"])
        finally:
            hr_client.delete(f"{BASE_URL}/api/org/projects/{pid}")

    def test_invalid_template(self, hr_client):
        r = hr_client.get(f"{BASE_URL}/api/org/chart?template=invalid")
        assert r.status_code == 400


# ------------------- EMPLOYEE PATCH -------------------
class TestEmployeePatch:
    def test_patch_basic(self, hr_client, employees):
        emp = employees[0]
        r = hr_client.patch(f"{BASE_URL}/api/employees/{emp['id']}", json={"job_title": "TEST_iter16_title"})
        assert r.status_code == 200
        assert r.json()["job_title"] == "TEST_iter16_title"

    def test_self_management_rejected(self, hr_client, employees):
        emp = employees[0]
        r = hr_client.patch(f"{BASE_URL}/api/employees/{emp['id']}", json={"manager_id": emp["id"]})
        assert r.status_code == 400
        assert "own manager" in r.json().get("detail", "").lower()

    def test_cycle_creation_rejected(self, hr_client, employees):
        # Find an emp who has a subordinate (someone whose manager_id == emp.id)
        emp_with_report = None
        report = None
        for e in employees:
            if e.get("manager_id"):
                # e reports to e['manager_id']; setting e['manager_id']'s manager to e creates cycle
                emp_with_report = next((x for x in employees if x["id"] == e["manager_id"]), None)
                report = e
                if emp_with_report:
                    break
        if not emp_with_report or not report:
            pytest.skip("No manager-report pair in seed data to test cycle")
        # Try to set the manager's manager to its own report — should be rejected
        r = hr_client.patch(f"{BASE_URL}/api/employees/{emp_with_report['id']}",
                            json={"manager_id": report["id"]})
        assert r.status_code == 400
        assert "cycle" in r.json().get("detail", "").lower()

    def test_whitelist_only(self, hr_client, employees):
        emp = employees[0]
        # Try to update a non-allowed field
        r = hr_client.patch(f"{BASE_URL}/api/employees/{emp['id']}",
                            json={"email": "hacked@x.com", "company_id": "FAKE"})
        # Should be 400 (no allowed fields) — silently ignored means no allowed fields => 400
        assert r.status_code == 400

    def test_denormalize_dept_branch(self, hr_client, employees):
        # Pick first employee, set department to one that exists
        depts = hr_client.get(f"{BASE_URL}/api/org/departments").json()
        branches = hr_client.get(f"{BASE_URL}/api/org/branches").json()
        if not depts or not branches:
            pytest.skip("Need dept+branch")
        emp = employees[0]
        r = hr_client.patch(f"{BASE_URL}/api/employees/{emp['id']}", json={
            "department_id": depts[0]["id"], "branch_id": branches[0]["id"]
        })
        assert r.status_code == 200
        body = r.json()
        assert body["department_name"] == depts[0]["name"]
        assert body["branch_name"] == branches[0]["name"]


# ------------------- PROJECTS CRUD -------------------
class TestProjects:
    def test_crud(self, hr_client, employees):
        # CREATE
        member = employees[0]["id"]
        r = hr_client.post(f"{BASE_URL}/api/org/projects",
                           json={"name": "TEST_iter16_proj", "code": "tp16", "member_ids": [member]})
        assert r.status_code == 200
        pid = r.json()["id"]
        assert r.json()["code"] == "TP16"  # uppercased
        # GET list
        r = hr_client.get(f"{BASE_URL}/api/org/projects")
        assert r.status_code == 200
        assert any(p["id"] == pid for p in r.json())
        # PUT
        r = hr_client.put(f"{BASE_URL}/api/org/projects/{pid}",
                          json={"name": "TEST_iter16_proj_v2", "status": "completed"})
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_iter16_proj_v2"
        # Tag employee with project_ids via PATCH
        r = hr_client.patch(f"{BASE_URL}/api/employees/{member}", json={"project_ids": [pid]})
        assert r.status_code == 200
        assert pid in r.json().get("project_ids", [])
        # DELETE (soft)
        r = hr_client.delete(f"{BASE_URL}/api/org/projects/{pid}")
        assert r.status_code == 200
        # Untag emp
        hr_client.patch(f"{BASE_URL}/api/employees/{member}", json={"project_ids": []})


# ------------------- BRANCHES CRUD -------------------
class TestBranches:
    def test_branch_update_and_hq_singleton(self, hr_client):
        branches = hr_client.get(f"{BASE_URL}/api/org/branches").json()
        if len(branches) < 1:
            pytest.skip("No branches")
        target = branches[0]
        original_hq = target.get("is_head_office", False)
        # Update with state code + HQ
        r = hr_client.put(f"{BASE_URL}/api/org/branches/{target['id']}", json={
            "state_code": "IN-MH", "state_name": "Maharashtra",
            "pincode": "400001", "phone": "+91-9999999999", "is_head_office": True
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["state_code"] == "IN-MH"
        assert d["pincode"] == "400001"
        assert d["is_head_office"] is True
        # Verify only one HQ across company
        all_b = hr_client.get(f"{BASE_URL}/api/org/branches").json()
        hq_count = sum(1 for b in all_b if b.get("is_head_office"))
        assert hq_count == 1
        # Restore prior
        if not original_hq:
            hr_client.put(f"{BASE_URL}/api/org/branches/{target['id']}", json={"is_head_office": False})

    def test_branch_delete_blocked_if_in_use(self, hr_client):
        # Find a branch with employees attached
        branches = hr_client.get(f"{BASE_URL}/api/org/branches").json()
        for b in branches:
            emps_in_b = hr_client.get(f"{BASE_URL}/api/employees?branch_id={b['id']}").json()
            if emps_in_b:
                r = hr_client.delete(f"{BASE_URL}/api/org/branches/{b['id']}")
                assert r.status_code == 400
                assert "still assigned" in r.json().get("detail", "").lower() or \
                       "employees" in r.json().get("detail", "").lower()
                return
        pytest.skip("No branch with employees to test deletion block")


# ------------------- EMPLOYEE LIST FILTERS -------------------
class TestEmployeeFilters:
    def test_filter_by_branch(self, hr_client):
        branches = hr_client.get(f"{BASE_URL}/api/org/branches").json()
        if not branches:
            pytest.skip("No branches")
        bid = branches[0]["id"]
        r = hr_client.get(f"{BASE_URL}/api/employees?branch_id={bid}")
        assert r.status_code == 200
        for e in r.json():
            assert e.get("branch_id") == bid

    def test_filter_by_department(self, hr_client):
        depts = hr_client.get(f"{BASE_URL}/api/org/departments").json()
        if not depts:
            pytest.skip("No depts")
        did = depts[0]["id"]
        r = hr_client.get(f"{BASE_URL}/api/employees?department_id={did}")
        assert r.status_code == 200
        for e in r.json():
            assert e.get("department_id") == did

    def test_filter_q_search(self, hr_client, employees):
        if not employees:
            pytest.skip("no emps")
        name_part = (employees[0]["name"] or "")[:3]
        if not name_part:
            pytest.skip("empty name")
        r = hr_client.get(f"{BASE_URL}/api/employees?q={name_part}")
        assert r.status_code == 200
        rows = r.json()
        assert any(name_part.lower() in (e["name"] or "").lower() for e in rows)

    def test_filter_by_employee_type(self, hr_client, employees):
        # find a type that exists
        types = {e.get("employee_type") for e in employees if e.get("employee_type")}
        if not types:
            pytest.skip("no employee types")
        t = next(iter(types))
        r = hr_client.get(f"{BASE_URL}/api/employees?employee_type={t}")
        assert r.status_code == 200
        for e in r.json():
            assert e["employee_type"] == t
