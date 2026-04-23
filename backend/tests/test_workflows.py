"""Workflow CRUD + matching engine regression tests (iteration 2).

Covers the configurable approval workflow feature added on top of the MVP:
- CRUD on /api/workflows (list, create, update, toggle, delete)
- RBAC and tenant isolation
- Matching engine for leave (type, days range) and product_service
  (item_category, cost range) and fallback walk-up
- /api/approvals/preview
- Full decision flow using the matched 1-step casual workflow
- Leak checks (_id, password_hash)
"""
import os
import uuid
from datetime import date, timedelta
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://people-partner-cloud.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CREDS = {
    "admin": ("admin@hrms.io", "Admin@123"),
    "hr": ("hr@acme.io", "Hr@12345"),
    "manager": ("manager@acme.io", "Manager@123"),
    "employee": ("employee@acme.io", "Employee@123"),
}


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed {email}: {r.text}"
    return r.json()["access_token"], r.json()["user"]


def _h(token):
    return {"Authorization": f"Bearer {token}"}


# Leave type cache (v2 API: POST /api/leave requires leave_type_id UUID, not string)
_LEAVE_TYPE_CACHE = {}

def _resolve_leave_type_id(tok, logical):
    """Translate legacy leave_type string (casual/sick/earned/unpaid) -> leave_type_id UUID."""
    if logical in _LEAVE_TYPE_CACHE:
        return _LEAVE_TYPE_CACHE[logical]
    mapping = {"casual": "CL", "sick": "SL", "earned": "EL", "unpaid": "LOP"}
    code = mapping.get(logical.lower(), logical.upper())
    r = requests.get(f"{API}/leave-types", headers=_h(tok), timeout=15)
    assert r.status_code == 200
    lt = next(x for x in r.json() if x["code"] == code)
    _LEAVE_TYPE_CACHE[logical] = lt["id"]
    return lt["id"]


def _leave_payload(tok, leave_type, start, end, reason, **extra):
    """Build a POST /api/leave v2 payload from legacy (string) leave_type."""
    return {"leave_type_id": _resolve_leave_type_id(tok, leave_type),
            "start_date": start, "end_date": end, "reason": reason, **extra}


def _future_weekday(offset_days):
    """Return an ISO date that's at least `offset_days` away and a Mon-Sat."""
    d = date.today() + timedelta(days=offset_days)
    while d.weekday() == 6:
        d += timedelta(days=1)
    return d.isoformat()


# Module-level autouse cleanup — cancel any TEST-prefixed pending/approved leaves from prior runs
# to keep the demo employee's CL/SL/EL balance healthy across the regression suite.
import pytest

@pytest.fixture(scope="module", autouse=True)
def _reset_test_leaves_workflows():
    emp_tok, _ = _login(*CREDS["employee"])
    r = requests.get(f"{API}/leave", headers=_h(emp_tok), timeout=15)
    if r.status_code == 200:
        for lv in r.json():
            reason = (lv.get("reason") or "")
            if (reason.startswith("TEST ") or reason.startswith("TEST_")) and lv.get("status") in ("pending", "approved"):
                requests.post(f"{API}/leave/cancel/{lv['id']}", headers=_h(emp_tok), timeout=15)
    yield


def _assert_no_leak(obj):
    body = str(obj)
    assert "'_id'" not in body and '"_id"' not in body, f"_id leaked: {body[:200]}"
    assert "password_hash" not in body, f"password_hash leaked: {body[:200]}"


# =========================================================================
# Workflow CRUD
# =========================================================================
def test_hr_lists_seeded_workflows():
    tok, _ = _login(*CREDS["hr"])
    r = requests.get(f"{API}/workflows", headers=_h(tok), timeout=15)
    assert r.status_code == 200
    rows = r.json()
    _assert_no_leak(rows)
    names = [w["name"] for w in rows]
    assert "Computer purchase — 5 levels" in names
    assert "Stationery — 2 levels" in names
    assert "High-value service >$5k — 4 levels" in names
    assert "Casual leave ≤3d — manager only" in names
    assert "Unpaid leave — 3 levels" in names
    # at least 5 seeded
    assert len(rows) >= 5


def test_filter_workflows_by_request_type():
    tok, _ = _login(*CREDS["hr"])
    r = requests.get(f"{API}/workflows?request_type=product_service", headers=_h(tok), timeout=15)
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) >= 3
    assert all(w["request_type"] == "product_service" for w in rows)

    r2 = requests.get(f"{API}/workflows?request_type=leave", headers=_h(tok), timeout=15)
    assert r2.status_code == 200
    leave_rows = r2.json()
    assert len(leave_rows) >= 2
    assert all(w["request_type"] == "leave" for w in leave_rows)


def test_create_workflow_persists_and_returned_on_get():
    tok, _ = _login(*CREDS["hr"])
    suffix = uuid.uuid4().hex[:6]
    body = {
        "name": f"TEST_Furniture_{suffix}",
        "request_type": "product_service",
        "match_item_category": "furniture",
        "priority": 90,
        "is_active": True,
        "steps": [
            {"order": 1, "resolver": "manager", "label": "Direct Manager"},
            {"order": 2, "resolver": "branch_manager", "label": "Branch Manager"},
            {"order": 3, "resolver": "role", "label": "HR Ops", "role": "company_admin"},
            {"order": 4, "resolver": "company_admin", "label": "Final HR"},
        ],
    }
    r = requests.post(f"{API}/workflows", headers=_h(tok), json=body, timeout=15)
    assert r.status_code == 200, r.text
    wf = r.json()
    _assert_no_leak(wf)
    assert wf["id"]
    assert wf["match_item_category"] == "furniture"
    assert len(wf["steps"]) == 4
    wf_id = wf["id"]

    # Verify persistence on GET
    r2 = requests.get(f"{API}/workflows/{wf_id}", headers=_h(tok), timeout=15)
    assert r2.status_code == 200
    fetched = r2.json()
    assert fetched["name"] == body["name"]
    assert len(fetched["steps"]) == 4

    # cleanup
    requests.delete(f"{API}/workflows/{wf_id}", headers=_h(tok), timeout=15)


def test_update_workflow_replaces_steps():
    tok, _ = _login(*CREDS["hr"])
    suffix = uuid.uuid4().hex[:6]
    body = {
        "name": f"TEST_UpdateWF_{suffix}",
        "request_type": "product_service",
        "match_item_category": "monitor",
        "priority": 50,
        "is_active": True,
        "steps": [{"order": 1, "resolver": "manager", "label": "Mgr"}],
    }
    r = requests.post(f"{API}/workflows", headers=_h(tok), json=body, timeout=15)
    wf_id = r.json()["id"]

    updated = {
        **body,
        "name": f"TEST_UpdateWF_{suffix}_v2",
        "steps": [
            {"order": 1, "resolver": "manager", "label": "Mgr"},
            {"order": 2, "resolver": "branch_manager", "label": "BranchMgr"},
            {"order": 3, "resolver": "company_admin", "label": "HR"},
        ],
    }
    r = requests.put(f"{API}/workflows/{wf_id}", headers=_h(tok), json=updated, timeout=15)
    assert r.status_code == 200, r.text
    result = r.json()
    assert result["name"] == updated["name"]
    assert len(result["steps"]) == 3

    # GET verifies persistence
    r2 = requests.get(f"{API}/workflows/{wf_id}", headers=_h(tok), timeout=15)
    fetched = r2.json()
    assert fetched["name"].endswith("_v2")
    assert len(fetched["steps"]) == 3

    # cleanup
    requests.delete(f"{API}/workflows/{wf_id}", headers=_h(tok), timeout=15)


def test_toggle_workflow_flips_active_flag():
    tok, _ = _login(*CREDS["hr"])
    suffix = uuid.uuid4().hex[:6]
    body = {
        "name": f"TEST_Toggle_{suffix}",
        "request_type": "leave",
        "match_leave_type": "other",
        "priority": 10,
        "is_active": True,
        "steps": [{"order": 1, "resolver": "manager", "label": "Mgr"}],
    }
    r = requests.post(f"{API}/workflows", headers=_h(tok), json=body, timeout=15)
    wf_id = r.json()["id"]

    r = requests.post(f"{API}/workflows/{wf_id}/toggle", headers=_h(tok), timeout=15)
    assert r.status_code == 200
    assert r.json()["is_active"] is False

    r = requests.post(f"{API}/workflows/{wf_id}/toggle", headers=_h(tok), timeout=15)
    assert r.json()["is_active"] is True

    requests.delete(f"{API}/workflows/{wf_id}", headers=_h(tok), timeout=15)


def test_delete_workflow_and_verify_404():
    tok, _ = _login(*CREDS["hr"])
    suffix = uuid.uuid4().hex[:6]
    body = {
        "name": f"TEST_Del_{suffix}",
        "request_type": "product_service",
        "match_item_category": "phone",
        "priority": 10, "is_active": True,
        "steps": [{"order": 1, "resolver": "manager", "label": "Mgr"}],
    }
    r = requests.post(f"{API}/workflows", headers=_h(tok), json=body, timeout=15)
    wf_id = r.json()["id"]

    r = requests.delete(f"{API}/workflows/{wf_id}", headers=_h(tok), timeout=15)
    assert r.status_code == 200

    r = requests.get(f"{API}/workflows/{wf_id}", headers=_h(tok), timeout=15)
    assert r.status_code == 404


# =========================================================================
# RBAC
# =========================================================================
def test_employee_cannot_create_workflow():
    tok, _ = _login(*CREDS["employee"])
    body = {
        "name": "TEST_EmpAttempt", "request_type": "leave",
        "match_leave_type": "casual", "priority": 10, "is_active": True,
        "steps": [{"order": 1, "resolver": "manager", "label": "Mgr"}],
    }
    r = requests.post(f"{API}/workflows", headers=_h(tok), json=body, timeout=15)
    assert r.status_code == 403


def test_tenant_isolation_hr_only_sees_own_company_workflows():
    tok, user = _login(*CREDS["hr"])
    r = requests.get(f"{API}/workflows", headers=_h(tok), timeout=15)
    assert r.status_code == 200
    rows = r.json()
    for w in rows:
        assert w["company_id"] == user["company_id"], "foreign company workflow leaked"


# =========================================================================
# Matching engine — Leave
# =========================================================================
def test_matching_engine_casual_leave_manager_only():
    emp_tok, _ = _login(*CREDS["employee"])
    r = requests.post(f"{API}/leave", headers=_h(emp_tok), json=_leave_payload(
        emp_tok, "casual", _future_weekday(60), _future_weekday(61), "TEST casual 2d",
    ), timeout=15)
    assert r.status_code == 200, r.text
    approval_id = r.json()["approval_request_id"]

    r = requests.get(f"{API}/approvals/{approval_id}", headers=_h(emp_tok), timeout=15)
    assert r.status_code == 200
    ap = r.json()
    assert ap["workflow_name"] == "Casual leave ≤3d — manager only"
    # Exactly 1 step — manager (Rahul Verma)
    assert len(ap["steps"]) == 1
    assert ap["steps"][0]["approver_name"] == "Rahul Verma"


def test_matching_engine_unpaid_leave_3_levels():
    emp_tok, _ = _login(*CREDS["employee"])
    r = requests.post(f"{API}/leave", headers=_h(emp_tok), json=_leave_payload(
        emp_tok, "unpaid", _future_weekday(70), _future_weekday(80), "TEST unpaid",
    ), timeout=15)
    assert r.status_code == 200
    approval_id = r.json()["approval_request_id"]

    ap = requests.get(f"{API}/approvals/{approval_id}", headers=_h(emp_tok), timeout=15).json()
    assert ap["workflow_name"] == "Unpaid leave — 3 levels"


# =========================================================================
# Matching engine — Product/Service
# =========================================================================
def test_matching_engine_stationery_2_levels():
    tok, _ = _login(*CREDS["employee"])
    r = requests.post(f"{API}/requests", headers=_h(tok), json={
        "category": "product", "item_category": "stationery",
        "title": "TEST Pens", "description": "Pack of pens",
        "quantity": 10, "estimated_cost": 50,
        "route_to": "main_branch", "urgency": "low",
    }, timeout=15)
    assert r.status_code == 200, r.text
    approval_id = r.json()["approval_request_id"]

    ap = requests.get(f"{API}/approvals/{approval_id}", headers=_h(tok), timeout=15).json()
    assert ap["workflow_name"] == "Stationery — 2 levels"


def test_matching_engine_computer_purchase_5_levels():
    tok, _ = _login(*CREDS["employee"])
    r = requests.post(f"{API}/requests", headers=_h(tok), json={
        "category": "product", "item_category": "computer",
        "title": "TEST Laptop", "description": "Dev laptop",
        "quantity": 1, "estimated_cost": 2500,
        "route_to": "main_branch", "urgency": "medium",
    }, timeout=15)
    assert r.status_code == 200
    approval_id = r.json()["approval_request_id"]

    ap = requests.get(f"{API}/approvals/{approval_id}", headers=_h(tok), timeout=15).json()
    assert ap["workflow_name"] == "Computer purchase — 5 levels"


def test_matching_engine_highvalue_service_catchall():
    tok, _ = _login(*CREDS["employee"])
    r = requests.post(f"{API}/requests", headers=_h(tok), json={
        "category": "service", "item_category": "other_thing",
        "title": "TEST Consulting", "description": "Enterprise consulting",
        "quantity": 1, "estimated_cost": 6000,
        "route_to": "vendor", "urgency": "high",
    }, timeout=15)
    assert r.status_code == 200
    approval_id = r.json()["approval_request_id"]

    ap = requests.get(f"{API}/approvals/{approval_id}", headers=_h(tok), timeout=15).json()
    assert ap["workflow_name"] == "High-value service >$5k — 4 levels"


def test_matching_engine_fallback_when_no_match():
    tok, _ = _login(*CREDS["employee"])
    r = requests.post(f"{API}/requests", headers=_h(tok), json={
        "category": "product", "item_category": "random_thing_nothing_matches",
        "title": "TEST Random", "description": "no wf",
        "quantity": 1, "estimated_cost": 100,
        "route_to": "main_branch", "urgency": "low",
    }, timeout=15)
    assert r.status_code == 200
    approval_id = r.json()["approval_request_id"]

    ap = requests.get(f"{API}/approvals/{approval_id}", headers=_h(tok), timeout=15).json()
    # no workflow matched -> workflow_name is None AND still has fallback steps (>=1, includes manager)
    assert ap["workflow_name"] is None
    assert len(ap["steps"]) >= 1


# =========================================================================
# Preview endpoint
# =========================================================================
def test_preview_workflow_computer():
    tok, _ = _login(*CREDS["hr"])
    body = {"request_type": "product_service", "item_category": "computer", "cost": 2500}
    r = requests.post(f"{API}/approvals/preview", headers=_h(tok), json=body, timeout=15)
    assert r.status_code == 200
    res = r.json()
    assert res["matched"] is True
    assert res["workflow"]["name"] == "Computer purchase — 5 levels"


def test_preview_workflow_no_match_fallback():
    tok, _ = _login(*CREDS["hr"])
    body = {"request_type": "product_service", "item_category": "no_match_anywhere", "cost": 10}
    r = requests.post(f"{API}/approvals/preview", headers=_h(tok), json=body, timeout=15)
    assert r.status_code == 200
    res = r.json()
    assert res["matched"] is False
    assert res["fallback"] == "manager_walk_up"


# =========================================================================
# Full decision flow using matched 1-step casual workflow
# =========================================================================
def test_casual_leave_single_step_full_decision_flow():
    emp_tok, _ = _login(*CREDS["employee"])
    r = requests.post(f"{API}/leave", headers=_h(emp_tok), json=_leave_payload(
        emp_tok, "casual", _future_weekday(90), _future_weekday(91), "TEST 1step casual",
    ), timeout=15)
    assert r.status_code == 200
    leave = r.json()
    approval_id = leave["approval_request_id"]

    mgr_tok, _ = _login(*CREDS["manager"])
    ap = requests.get(f"{API}/approvals/{approval_id}", headers=_h(mgr_tok), timeout=15).json()
    assert ap["workflow_name"] == "Casual leave ≤3d — manager only"
    assert len(ap["steps"]) == 1

    # Manager approves -> overall approved
    r = requests.post(f"{API}/approvals/{approval_id}/decide", headers=_h(mgr_tok),
                     json={"decision": "approve", "comment": "TEST ok"}, timeout=15)
    assert r.status_code == 200
    result = r.json()
    assert result["status"] == "approved"

    # Linked leave status is approved
    my = requests.get(f"{API}/leave", headers=_h(emp_tok), timeout=15).json()
    matched = [lv for lv in my if lv["id"] == leave["id"]]
    assert matched and matched[0]["status"] == "approved"


# =========================================================================
# Leak checks
# =========================================================================
def test_no_leak_in_workflow_list():
    tok, _ = _login(*CREDS["hr"])
    r = requests.get(f"{API}/workflows", headers=_h(tok), timeout=15)
    body = r.text
    assert '"_id"' not in body
    assert "password_hash" not in body


def test_no_leak_in_preview():
    tok, _ = _login(*CREDS["hr"])
    r = requests.post(f"{API}/approvals/preview", headers=_h(tok), json={
        "request_type": "product_service", "item_category": "computer", "cost": 2500,
    }, timeout=15)
    body = r.text
    assert '"_id"' not in body
    assert "password_hash" not in body
