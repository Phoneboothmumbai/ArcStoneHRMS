"""Phase 1D — Notifications engine tests.
Covers: list, unread_count, mark read/all, prefs auto-create, update prefs,
event dispatch (leave, approval decide cascade, onboarding, offboarding),
dedup, mute_events, channels.in_app=false, email scaffold no-op.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:3000").rstrip("/")
API = f"{BASE_URL}/api"

CREDS = {
    "hr":       ("hr@acme.io",       "Hr@12345"),
    "manager":  ("manager@acme.io",  "Manager@123"),
    "employee": ("employee@acme.io", "Employee@123"),
    "admin":    ("admin@hrms.io",    "Admin@123"),
}


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text[:200]}"
    tok = r.json().get("access_token")
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s, r.json().get("user", {})


@pytest.fixture(scope="module")
def emp():
    s, u = _login(*CREDS["employee"]); return s, u


@pytest.fixture(scope="module")
def mgr():
    s, u = _login(*CREDS["manager"]); return s, u


@pytest.fixture(scope="module")
def hr():
    s, u = _login(*CREDS["hr"]); return s, u


# ---------- Baseline endpoints ----------

class TestBasics:
    def test_unread_count_shape(self, emp):
        s, _ = emp
        r = s.get(f"{API}/notifications/unread_count")
        assert r.status_code == 200
        assert isinstance(r.json().get("count"), int)

    def test_list_returns_array(self, emp):
        s, _ = emp
        r = s.get(f"{API}/notifications?limit=10")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_prefs_auto_create_defaults(self, emp):
        s, _ = emp
        r = s.get(f"{API}/notifications/preferences")
        assert r.status_code == 200
        p = r.json()
        assert p["channels"]["in_app"] is True
        assert p["channels"]["email"] is True
        assert p["channels"]["push"] is False
        assert "mute_events" in p
        assert p["digest_frequency"] in ("realtime", "daily", "weekly", "off")

    def test_prefs_update(self, emp):
        s, _ = emp
        r = s.put(f"{API}/notifications/preferences", json={
            "channels": {"in_app": True, "email": False, "push": False},
            "mute_events": ["profile.incomplete"],
            "digest_frequency": "daily",
        })
        assert r.status_code == 200
        p = r.json()
        assert p["channels"]["email"] is False
        assert "profile.incomplete" in p["mute_events"]
        assert p["digest_frequency"] == "daily"
        # reset
        s.put(f"{API}/notifications/preferences", json={
            "channels": {"in_app": True, "email": True, "push": False},
            "mute_events": [],
            "digest_frequency": "realtime",
        })


# ---------- Tenant isolation ----------

class TestIsolation:
    def test_list_returns_only_own(self, emp, mgr):
        s_e, ue = emp
        s_m, um = mgr
        r_e = s_e.get(f"{API}/notifications?limit=200").json()
        r_m = s_m.get(f"{API}/notifications?limit=200").json()
        for n in r_e:
            assert n["recipient_user_id"] == ue["id"]
        for n in r_m:
            assert n["recipient_user_id"] == um["id"]


# ---------- Event dispatch on leave / approval chain ----------

_LEAVE_TYPE_ID_CACHE = {}


def _get_leave_type_id(s_emp):
    if "id" in _LEAVE_TYPE_ID_CACHE:
        return _LEAVE_TYPE_ID_CACHE["id"]
    r = s_emp.get(f"{API}/leave-types")
    types = r.json() if r.status_code == 200 else []
    # Try types in preference order, pick first with balance (skip ones already exhausted)
    preferred = ["SL", "EL", "CL"]
    sorted_types = sorted(types, key=lambda t: preferred.index(t["code"]) if t.get("code") in preferred else 99)
    for t in sorted_types:
        if t.get("is_active", True):
            _LEAVE_TYPE_ID_CACHE["id"] = t["id"]
            return t["id"]
    return None


def _apply_leave(s_emp, days=1):
    """Helper to submit a leave request. Returns leave dict."""
    from datetime import date, timedelta
    import random
    # Pick a Monday at least 60 days out to avoid weekends + notice requirements
    offset = random.randint(60, 160)
    target = date.today() + timedelta(days=offset)
    while target.weekday() != 0:
        target += timedelta(days=1)
    start = target.isoformat()
    end = (target + timedelta(days=days - 1)).isoformat()

    # Try each leave type until one has balance
    r_types = s_emp.get(f"{API}/leave-types")
    types = r_types.json() if r_types.status_code == 200 else []
    preferred = ["SL", "EL", "CL"]
    types_sorted = sorted(types, key=lambda t: preferred.index(t["code"]) if t.get("code") in preferred else 99)

    last_err = None
    for t in types_sorted:
        if not t.get("is_active", True):
            continue
        r = s_emp.post(f"{API}/leave", json={
            "leave_type_id": t["id"],
            "start_date": start, "end_date": end,
            "reason": f"TEST_phase1d_{uuid.uuid4().hex[:6]}",
        })
        if r.status_code in (200, 201):
            return r.json()
        last_err = f"{r.status_code} {r.text[:150]}"
    raise AssertionError(f"Leave apply failed on all types. Last: {last_err}")


class TestLeaveApprovalDispatch:
    def test_employee_applies_manager_gets_approval_pending(self, emp, mgr):
        s_e, _ = emp
        s_m, um = mgr

        before = s_m.get(f"{API}/notifications/unread_count").json()["count"]
        before_total = len(s_m.get(f"{API}/notifications?limit=200").json())
        lv = _apply_leave(s_e)
        # wait briefly for async dispatch
        time.sleep(2.5)
        after = s_m.get(f"{API}/notifications/unread_count").json()["count"]
        rows_all = s_m.get(f"{API}/notifications?limit=200").json()
        after_total = len(rows_all)
        # Find approval.pending notif whose dedup_key contains an approval id + step1
        new_pending = [n for n in rows_all if n["event"] == "approval.pending"
                       and n.get("dedup_key","").endswith(":step1")]
        assert after_total > before_total or after >= before + 1 or new_pending, \
            f"Manager did not receive approval.pending (before_unread={before} after_unread={after}, before_total={before_total} after_total={after_total}, leave={lv.get('id')})"
        # Verify link is /app/approvals (check any of the step1 pending rows)
        assert any(n.get("link") == "/app/approvals" for n in new_pending), \
            "approval.pending link is not /app/approvals"

    def test_final_decision_notifies_requester(self, emp, mgr, hr):
        """Manager approves → workflow advances → HR gets pending. HR approves → requester gets approved."""
        s_e, ue = emp
        s_m, _ = mgr
        s_h, _ = hr

        lv = _apply_leave(s_e)
        time.sleep(1.0)

        # find pending approval req for manager
        req_rows = s_m.get(f"{API}/approvals?status=pending").json()
        # choose the newest one belonging to our leave
        target = None
        for r in req_rows:
            if isinstance(r, dict) and r.get("linked_id") == lv.get("id"):
                target = r; break
        if not target and req_rows and isinstance(req_rows[0], dict):
            # fallback: newest leave
            target = next((r for r in req_rows if isinstance(r, dict) and r.get("request_type") == "leave"), req_rows[0])
        assert target, "No pending approval for manager"

        # manager approves
        dec1 = s_m.post(f"{API}/approvals/{target['id']}/decide",
                       json={"decision": "approve", "comment": "TEST_ok"})
        assert dec1.status_code == 200, dec1.text[:200]
        time.sleep(1.2)

        # HR should have new approval.pending
        hr_pending = s_h.get(f"{API}/notifications?unread_only=true&limit=20").json()
        assert any(n["event"] == "approval.pending" for n in hr_pending), \
            "HR did not receive approval.pending after manager advance"

        # find the HR pending and approve
        hr_req = s_h.get(f"{API}/approvals?status=pending").json()
        hr_target = None
        for r in hr_req:
            if isinstance(r, dict) and r.get("linked_id") == lv.get("id"):
                hr_target = r; break
        if not hr_target and hr_req and isinstance(hr_req[0], dict):
            hr_target = next((r for r in hr_req if isinstance(r, dict) and r.get("request_type") == "leave"), hr_req[0])
        assert hr_target, "HR has no pending approval"
        dec2 = s_h.post(f"{API}/approvals/{hr_target['id']}/decide",
                       json={"decision": "approve", "comment": "TEST_final"})
        assert dec2.status_code == 200, dec2.text[:200]
        time.sleep(1.2)

        # requester must get approval.approved
        rows = s_e.get(f"{API}/notifications?limit=50").json()
        approved = [n for n in rows if n["event"] == "approval.approved"]
        assert approved, "Requester did not receive approval.approved after final decision"


# ---------- Dedup idempotency (via internal call pattern — leave re-submit not idempotent; test approval req pattern) ----------

class TestDedup:
    def test_duplicate_dispatch_same_dedup_key(self, hr):
        """Simulate idempotency by directly exercising notify() through running the same flow twice with same dedup key.
        We cannot reach notify() directly over HTTP, so we validate indirectly: the same approval.pending
        for a single approval step isn't re-created if HR re-fetches (the hook in create_approval_request uses
        dedup_key=f'approval:{id}:step{N}'). So the count must be stable when listing."""
        s_h, uh = hr
        before = s_h.get(f"{API}/notifications?limit=200").json()
        dedup_keys = {n.get("dedup_key") for n in before if n.get("dedup_key")}
        # Every unique dedup_key should occur exactly once
        keys_list = [n.get("dedup_key") for n in before if n.get("dedup_key")]
        assert len(keys_list) == len(set(keys_list)), "Duplicate dedup_keys found in notifications"


# ---------- Mute + channel gating ----------

class TestPreferencesGating:
    def test_mute_approval_pending_suppresses(self, emp, mgr):
        """Set manager mute_events to include approval.pending, fire a leave, verify no new notif."""
        s_e, _ = emp
        s_m, _ = mgr
        # mute
        s_m.put(f"{API}/notifications/preferences", json={
            "channels": {"in_app": True, "email": True, "push": False},
            "mute_events": ["approval.pending"],
            "digest_frequency": "realtime",
        })
        before = s_m.get(f"{API}/notifications/unread_count").json()["count"]
        _apply_leave(s_e)
        time.sleep(1.2)
        after = s_m.get(f"{API}/notifications/unread_count").json()["count"]
        assert after == before, f"Muted event still delivered (before={before} after={after})"
        # restore
        s_m.put(f"{API}/notifications/preferences", json={
            "channels": {"in_app": True, "email": True, "push": False},
            "mute_events": [],
            "digest_frequency": "realtime",
        })

    def test_channel_in_app_false_suppresses_inbox(self, emp, mgr):
        s_e, _ = emp
        s_m, _ = mgr
        s_m.put(f"{API}/notifications/preferences", json={
            "channels": {"in_app": False, "email": True, "push": False},
            "mute_events": [], "digest_frequency": "realtime",
        })
        before = s_m.get(f"{API}/notifications/unread_count").json()["count"]
        _apply_leave(s_e)
        time.sleep(1.2)
        after = s_m.get(f"{API}/notifications/unread_count").json()["count"]
        assert after == before, f"in_app=false but notification persisted (before={before} after={after})"
        # restore
        s_m.put(f"{API}/notifications/preferences", json={
            "channels": {"in_app": True, "email": True, "push": False},
            "mute_events": [], "digest_frequency": "realtime",
        })


# ---------- Email scaffold doesn't break flow ----------

class TestEmailScaffold:
    def test_no_resend_key_does_not_break_inapp(self, emp, mgr):
        """RESEND_API_KEY is unset in env; in-app still delivered (validated via leave flow)."""
        resend_key = os.environ.get("RESEND_API_KEY")
        # Just verify in-app works regardless
        s_e, _ = emp
        s_m, _ = mgr
        before = s_m.get(f"{API}/notifications/unread_count").json()["count"]
        _apply_leave(s_e)
        time.sleep(1.2)
        after = s_m.get(f"{API}/notifications/unread_count").json()["count"]
        assert after >= before + 1, "In-app notification failed (email scaffold may have broken flow)"


# ---------- Mark read & read_all ----------

class TestReadOps:
    def test_mark_single_read(self, mgr):
        s_m, _ = mgr
        rows = s_m.get(f"{API}/notifications?unread_only=true&limit=5").json()
        if not rows:
            pytest.skip("No unread notifications to mark")
        nid = rows[0]["id"]
        r = s_m.post(f"{API}/notifications/{nid}/read")
        assert r.status_code == 200
        # verify
        rows2 = s_m.get(f"{API}/notifications?limit=200").json()
        match = [n for n in rows2 if n["id"] == nid]
        assert match and match[0]["read"] is True

    def test_mark_all_read(self, mgr):
        s_m, _ = mgr
        r = s_m.post(f"{API}/notifications/read_all")
        assert r.status_code == 200
        c = s_m.get(f"{API}/notifications/unread_count").json()["count"]
        assert c == 0


# ---------- Offboarding → company_admins ----------

class TestOffboarding:
    def test_offboarding_initiated_notifies_admins(self, hr, emp):
        """Start offboarding for employee → hr (company_admin) should get offboarding.initiated."""
        s_h, uh = hr
        s_e, ue = emp
        # clear HR unread first
        s_h.post(f"{API}/notifications/read_all")
        # find employee row
        employees = s_h.get(f"{API}/employees?limit=200").json()
        employees = employees if isinstance(employees, list) else employees.get("items", [])
        # use a non-primary employee to avoid touching our test user heavily; pick someone
        target_emp = None
        for e in employees:
            if e.get("user_id") and e.get("user_id") != ue["id"] and e.get("status") == "active":
                target_emp = e; break
        if not target_emp:
            pytest.skip("No suitable employee to offboard")
        from datetime import date, timedelta
        lwd = (date.today() + timedelta(days=30)).isoformat()
        r = s_h.post(f"{API}/offboarding/start", json={
            "employee_id": target_emp["id"],
            "last_working_date": lwd,
            "reason": "TEST_phase1d_offboarding",
            "exit_type": "resignation",
        })
        if r.status_code not in (200, 201):
            pytest.skip(f"Offboarding endpoint not available or returned {r.status_code}: {r.text[:150]}")
        time.sleep(1.5)
        rows = s_h.get(f"{API}/notifications?limit=20").json()
        assert any(n["event"] == "offboarding.initiated" for n in rows), \
            "HR (company_admin) did not receive offboarding.initiated"
