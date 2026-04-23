"""Phase 1M — Knowledge Base tests: categories, articles list/search/filter,
article detail + view_count increment, admin CRUD with role gating, seed idempotency."""
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
    "hr": ("hr@acme.io", "Hr@12345"),
    "employee": ("employee@acme.io", "Employee@123"),
}

SEED_SLUGS = {
    "welcome-to-arcstone",
    "how-to-add-first-employee",
    "india-statutory-pf-esic-pt",
    "kyc-documents-employee",
    "how-onboarding-works",
    "employee-exit-clearance",
    "how-approval-workflows-work",
    "modules-and-billing",
}


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="session")
def tokens():
    out = {}
    for k, (e, p) in CREDS.items():
        try:
            out[k] = _login(e, p)
        except AssertionError:
            out[k] = None
    # Re-activate employee if disabled from previous phase1a run
    if out.get("employee") is None:
        try:
            import asyncio
            from motor.motor_asyncio import AsyncIOMotorClient
            mongo = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
            dbname = os.environ.get("DB_NAME", "hrms_saas")
            async def _reactivate():
                c = AsyncIOMotorClient(mongo)[dbname]
                await c.users.update_one({"email": "employee@acme.io"}, {"$set": {"is_active": True}})
            asyncio.run(_reactivate())
            out["employee"] = _login(*CREDS["employee"])
        except Exception:
            pass
    return out


# --------- Categories ---------
class TestCategories:
    def test_categories_returns_9_with_counts(self, tokens):
        r = requests.get(f"{API}/kb/categories", headers=_h(tokens["hr"]), timeout=15)
        assert r.status_code == 200, r.text
        cats = r.json()
        assert isinstance(cats, list)
        assert len(cats) == 9, [c["name"] for c in cats]
        names = {c["name"] for c in cats}
        assert "Getting Started" in names
        assert "India Statutory (PF, ESIC, PT)" in names
        # Each category has name + count, counts are ints >= 0
        for c in cats:
            assert "name" in c and "count" in c
            assert isinstance(c["count"], int)
        # Total counts across categories should be >= 8 (seed)
        assert sum(c["count"] for c in cats) >= 8


# --------- Articles list/search/filter ---------
class TestArticlesList:
    def test_list_published_excludes_body(self, tokens):
        r = requests.get(f"{API}/kb/articles", headers=_h(tokens["hr"]), timeout=15)
        assert r.status_code == 200, r.text
        rows = r.json()
        assert len(rows) >= 8
        slugs = {a["slug"] for a in rows}
        assert SEED_SLUGS.issubset(slugs), f"missing: {SEED_SLUGS - slugs}"
        # content excluded
        for a in rows:
            assert "content" not in a
            assert "_id" not in a
            assert a.get("is_published") is True
            for k in ("title", "slug", "category", "excerpt"):
                assert k in a

    def test_search_q_free_text(self, tokens):
        r = requests.get(f"{API}/kb/articles", params={"q": "UAN"}, headers=_h(tokens["hr"]), timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert any(a["slug"] == "india-statutory-pf-esic-pt" for a in rows)

    def test_category_exact_filter(self, tokens):
        r = requests.get(
            f"{API}/kb/articles",
            params={"category": "India Statutory (PF, ESIC, PT)"},
            headers=_h(tokens["hr"]), timeout=15,
        )
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) == 1
        assert rows[0]["slug"] == "india-statutory-pf-esic-pt"

    def test_related_page_filter(self, tokens):
        r = requests.get(
            f"{API}/kb/articles",
            params={"related_page": "profile.kyc"},
            headers=_h(tokens["hr"]), timeout=15,
        )
        assert r.status_code == 200
        rows = r.json()
        assert any(a["slug"] == "kyc-documents-employee" for a in rows)

    def test_articles_require_auth(self):
        r = requests.get(f"{API}/kb/articles", timeout=15)
        assert r.status_code in (401, 403)


# --------- Article detail ---------
class TestArticleDetail:
    def test_get_by_slug_returns_full_and_increments_view_count(self, tokens):
        slug = "india-statutory-pf-esic-pt"
        before = requests.get(f"{API}/kb/articles/{slug}", headers=_h(tokens["hr"]), timeout=15).json()
        after = requests.get(f"{API}/kb/articles/{slug}", headers=_h(tokens["hr"]), timeout=15).json()
        assert "content" in before and before["content"]
        assert "_id" not in before
        assert after["view_count"] == before["view_count"] + 1

    def test_non_existent_slug_404(self, tokens):
        r = requests.get(f"{API}/kb/articles/non-existent-slug", headers=_h(tokens["hr"]), timeout=15)
        assert r.status_code == 404


# --------- Admin CRUD ---------
class TestAdminCRUD:
    created_id = None

    def test_non_super_admin_forbidden_create(self, tokens):
        r = requests.post(
            f"{API}/kb/admin/articles",
            json={"title": "TEST_X", "category": "Getting Started", "content": "body"},
            headers=_h(tokens["hr"]), timeout=15,
        )
        assert r.status_code == 403

    def test_create_auto_slug(self, tokens):
        r = requests.post(
            f"{API}/kb/admin/articles",
            json={
                "title": "TEST_ Phase1M Auto Slug Article",
                "category": "Getting Started",
                "excerpt": "ex",
                "content": "# Hello",
                "tags": ["test"],
                "related_page": "test",
            },
            headers=_h(tokens["admin"]), timeout=15,
        )
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["slug"] == "test-phase1m-auto-slug-article"
        assert doc["is_published"] is True
        assert doc["author_name"]
        assert "_id" not in doc
        TestAdminCRUD.created_id = doc["id"]
        # GET back verifies persistence + appears in list
        got = requests.get(f"{API}/kb/articles/{doc['slug']}", headers=_h(tokens["hr"]), timeout=15)
        assert got.status_code == 200
        assert got.json()["title"] == "TEST_ Phase1M Auto Slug Article"

    def test_duplicate_slug_400(self, tokens):
        r = requests.post(
            f"{API}/kb/admin/articles",
            json={"title": "dup", "slug": "welcome-to-arcstone", "category": "Getting Started", "content": "x"},
            headers=_h(tokens["admin"]), timeout=15,
        )
        assert r.status_code == 400

    def test_invalid_category_400(self, tokens):
        r = requests.post(
            f"{API}/kb/admin/articles",
            json={"title": "TEST_bad", "category": "Not A Category", "content": "x"},
            headers=_h(tokens["admin"]), timeout=15,
        )
        assert r.status_code == 400

    def test_update_fields_and_slug_collision(self, tokens):
        aid = TestAdminCRUD.created_id
        if not aid:
            pytest.skip("create failed")
        # Update content
        r = requests.put(
            f"{API}/kb/admin/articles/{aid}",
            json={"excerpt": "updated excerpt"},
            headers=_h(tokens["admin"]), timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json()["excerpt"] == "updated excerpt"

        # Slug collision
        r2 = requests.put(
            f"{API}/kb/admin/articles/{aid}",
            json={"slug": "welcome-to-arcstone"},
            headers=_h(tokens["admin"]), timeout=15,
        )
        assert r2.status_code == 400

    def test_delete_super_admin_only(self, tokens):
        aid = TestAdminCRUD.created_id
        if not aid:
            pytest.skip()
        # hr forbidden
        r = requests.delete(f"{API}/kb/admin/articles/{aid}", headers=_h(tokens["hr"]), timeout=15)
        assert r.status_code == 403
        # admin ok
        r2 = requests.delete(f"{API}/kb/admin/articles/{aid}", headers=_h(tokens["admin"]), timeout=15)
        assert r2.status_code == 200


# --------- Seed correctness & idempotency ---------
class TestSeed:
    def test_8_starter_slugs_present(self, tokens):
        r = requests.get(f"{API}/kb/admin/articles", headers=_h(tokens["admin"]), timeout=15)
        assert r.status_code == 200
        slugs = {a["slug"] for a in r.json()}
        assert SEED_SLUGS.issubset(slugs), f"missing: {SEED_SLUGS - slugs}"

    def test_seed_idempotent_no_duplicates(self, tokens):
        r = requests.get(f"{API}/kb/admin/articles", headers=_h(tokens["admin"]), timeout=15)
        slugs = [a["slug"] for a in r.json()]
        for s in SEED_SLUGS:
            assert slugs.count(s) == 1, f"duplicate slug: {s}"
