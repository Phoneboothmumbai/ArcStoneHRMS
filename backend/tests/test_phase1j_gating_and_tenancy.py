"""Phase 1J — Module gating (402) + Tenant isolation for Performance endpoints.

Covers the review-request items:
- All /api/review-cycles, /api/goals, /api/reviews, /api/nine-box, /api/pips
  must return 402 when `performance` module is disabled for the company.
- Every list endpoint must filter by company_id; no cross-tenant data leak.
"""
import os
import uuid

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

SUPER = {"email": "admin@hrms.io", "password": "Admin@123"}
HR = {"email": "hr@acme.io", "password": "Hr@12345"}
RESELLER = {"email": "reseller@demo.io", "password": "Reseller@123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def super_tok():
    return _login(SUPER)


@pytest.fixture(scope="module")
def hr_tok():
    return _login(HR)


@pytest.fixture(scope="module")
def acme_id(super_tok):
    rows = requests.get(f"{API}/companies", headers=_h(super_tok), timeout=15).json()
    acme = next((c for c in rows if c.get("name") == "ACME Global"), None)
    assert acme, "ACME Global must exist in seed"
    return acme["id"]


# ---------------------------------------------------------------------------
# Module gating — 402 when performance disabled
# ---------------------------------------------------------------------------
class TestModuleGating:
    """Disable the performance module then verify every sub-router returns 402."""

    @pytest.fixture(autouse=True)
    def _toggle(self, super_tok, acme_id):
        # Disable
        r = requests.post(
            f"{API}/modules/company/{acme_id}/disable",
            headers=_h(super_tok),
            json={"module_id": "performance"},
            timeout=15,
        )
        assert r.status_code in (200, 204), r.text
        yield
        # Re-enable so rest of suite is unaffected
        requests.post(
            f"{API}/modules/company/{acme_id}/enable",
            headers=_h(super_tok),
            json={"module_id": "performance", "mode": "active"},
            timeout=15,
        )

    def test_cycles_gated(self, hr_tok):
        r = requests.get(f"{API}/review-cycles", headers=_h(hr_tok), timeout=15)
        assert r.status_code == 402, f"expected 402, got {r.status_code}: {r.text}"

    def test_goals_gated(self, hr_tok):
        r = requests.get(f"{API}/goals", headers=_h(hr_tok), timeout=15)
        assert r.status_code == 402

    def test_reviews_gated(self, hr_tok):
        r = requests.get(f"{API}/reviews", headers=_h(hr_tok), timeout=15)
        assert r.status_code == 402

    def test_ninebox_gated(self, hr_tok):
        r = requests.get(f"{API}/nine-box", headers=_h(hr_tok), timeout=15)
        assert r.status_code == 402

    def test_pips_gated(self, hr_tok):
        r = requests.get(f"{API}/pips", headers=_h(hr_tok), timeout=15)
        assert r.status_code == 402


# ---------------------------------------------------------------------------
# Tenant isolation — cross-tenant reads must NOT leak
# ---------------------------------------------------------------------------
class TestTenantIsolation:
    """Create a second company under the same reseller; attempt cross-tenant read."""

    @pytest.fixture(scope="class")
    def second_company_and_admin(self, super_tok):
        # Ensure performance module is active for ACME for the rest of the class
        # (re-enable defensively in case prior test class order leaves it off).
        rows = requests.get(f"{API}/companies", headers=_h(super_tok), timeout=15).json()
        acme = next((c for c in rows if c.get("name") == "ACME Global"), None)
        if acme:
            requests.post(
                f"{API}/modules/company/{acme['id']}/enable",
                headers=_h(super_tok),
                json={"module_id": "performance", "mode": "active"},
                timeout=15,
            )

        tag = uuid.uuid4().hex[:6]
        admin_email = f"hr2_{tag}@test.io"
        admin_pwd = "Hr2@12345"

        # Reseller creates a second company (API requires admin_email/name/password)
        rtok = _login(RESELLER)
        rc = requests.post(
            f"{API}/companies",
            headers=_h(rtok),
            json={
                "name": f"TEST Co {tag}",
                "slug": f"test-co-{tag}",
                "admin_email": admin_email,
                "admin_name": "Co2 HR",
                "admin_password": admin_pwd,
            },
            timeout=15,
        )
        if rc.status_code != 200:
            pytest.skip(f"Reseller cannot create company in this env: {rc.status_code} {rc.text}")
        co = rc.json()
        # Some envs return {"company": {...}, "admin": {...}}; normalize
        if "id" not in co and "company" in co:
            co = co["company"]

        # Enable performance for the new company (super admin)
        requests.post(
            f"{API}/modules/company/{co['id']}/enable",
            headers=_h(super_tok),
            json={"module_id": "performance", "mode": "active"},
            timeout=15,
        )

        tok2 = _login({"email": admin_email, "password": admin_pwd})
        # Create a cycle inside co2 so there's tenant-specific data to test
        rc2 = requests.post(
            f"{API}/review-cycles",
            headers=_h(tok2),
            json={
                "name": f"Co2 Cycle {tag}",
                "cadence": "quarterly",
                "period_start": "2026-04-01",
                "period_end": "2026-06-30",
            },
            timeout=15,
        )
        assert rc2.status_code == 200, rc2.text
        cycle2 = rc2.json()
        yield {"company": co, "tok": tok2, "cycle": cycle2}

    def test_cycles_list_isolated(self, hr_tok, second_company_and_admin):
        co2_cycle_id = second_company_and_admin["cycle"]["id"]
        rows = requests.get(f"{API}/review-cycles", headers=_h(hr_tok), timeout=15).json()
        assert not any(c["id"] == co2_cycle_id for c in rows), (
            f"ACME HR can see Co2 cycle {co2_cycle_id} — tenant leak"
        )

    def test_cycles_reverse_isolated(self, hr_tok, second_company_and_admin):
        # Grab an ACME cycle and make sure co2 HR cannot see it
        acme_rows = requests.get(f"{API}/review-cycles", headers=_h(hr_tok), timeout=15).json()
        if not acme_rows:
            pytest.skip("No ACME cycles available")
        acme_cycle_id = acme_rows[0]["id"]
        co2_rows = requests.get(
            f"{API}/review-cycles",
            headers=_h(second_company_and_admin["tok"]),
            timeout=15,
        ).json()
        assert not any(c["id"] == acme_cycle_id for c in co2_rows), (
            "Co2 HR can see ACME cycle — tenant leak"
        )

    def test_goals_list_isolated(self, hr_tok, second_company_and_admin):
        acme_goals = requests.get(f"{API}/goals", headers=_h(hr_tok), timeout=15).json()
        co2_goals = requests.get(
            f"{API}/goals", headers=_h(second_company_and_admin["tok"]), timeout=15
        ).json()
        acme_ids = {g["id"] for g in acme_goals}
        co2_ids = {g["id"] for g in co2_goals}
        assert acme_ids.isdisjoint(co2_ids), "Goals list leaks across tenants"

    def test_ninebox_list_isolated(self, hr_tok, second_company_and_admin):
        co2_cycle_id = second_company_and_admin["cycle"]["id"]
        # ACME HR querying with Co2 cycle_id must not return Co2 placements
        r = requests.get(
            f"{API}/nine-box?cycle_id={co2_cycle_id}", headers=_h(hr_tok), timeout=15
        )
        assert r.status_code == 200
        assert r.json()["placements"] == [], (
            "ACME HR can read nine-box placements tied to Co2 cycle — tenant leak"
        )
