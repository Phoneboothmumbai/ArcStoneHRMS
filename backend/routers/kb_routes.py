"""Knowledge Base — platform-wide articles with categories, search, view counters.
MVP scope: platform-authored articles (super_admin only). Reseller/company overrides deferred.

ROLE-BASED VISIBILITY (added later): each article carries a `visible_roles` list
defining who can read it. Empty / missing list means "everyone" (legacy behaviour).
super_admin and company_admin always see every article so they can curate it."""
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from auth import get_current_user, require_roles
from db import get_db
from models import BaseDoc, Role, now_iso, uid

router = APIRouter(prefix="/api/kb", tags=["kb"])


# Roles that can curate KB content. Always allowed to read EVERY article.
KB_CURATOR_ROLES = {"super_admin", "company_admin", "reseller"}

# All non-curator roles. Used as defaults when an admin says "visible to all".
ALL_AUDIENCE_ROLES = [
    "country_head", "region_head",
    "branch_manager", "sub_manager", "assistant_manager",
    "employee",
]


KB_CATEGORIES = [
    "Getting Started",
    "Employees & Profile",
    "Onboarding",
    "Offboarding & Exit",
    "Leave & Attendance",
    "Approvals & Workflows",
    "Admin & Modules",
    "India Statutory (PF, ESIC, PT)",
    "Troubleshooting",
]


class KBArticle(BaseDoc):
    title: str
    slug: str  # URL-friendly unique key
    category: str
    excerpt: Optional[str] = None
    content: str  # markdown
    tags: List[str] = Field(default_factory=list)
    related_page: Optional[str] = None  # e.g. "onboarding", "profile.kyc" — used for contextual filtering
    author_name: str
    is_published: bool = True
    view_count: int = 0
    # Empty list / missing == visible to all (legacy compatibility).
    visible_roles: List[str] = Field(default_factory=list)


class KBArticleCreate(BaseModel):
    title: str
    slug: Optional[str] = None  # auto-generated if missing
    category: str
    excerpt: Optional[str] = None
    content: str
    tags: List[str] = Field(default_factory=list)
    related_page: Optional[str] = None
    is_published: bool = True
    visible_roles: List[str] = Field(default_factory=list)


class KBArticleUpdate(BaseModel):
    title: Optional[str] = None
    slug: Optional[str] = None
    category: Optional[str] = None
    excerpt: Optional[str] = None
    content: Optional[str] = None
    tags: Optional[List[str]] = None
    related_page: Optional[str] = None
    is_published: Optional[bool] = None
    visible_roles: Optional[List[str]] = None


def _slugify(text: str) -> str:
    import re
    s = re.sub(r"[^a-zA-Z0-9\s-]", "", text.lower()).strip()
    s = re.sub(r"\s+", "-", s)
    return s[:80] or "article"


def _audience_filter(user: dict) -> dict:
    """Return a Mongo sub-query that restricts to articles visible to `user`.

    Curators (super_admin / company_admin / reseller) bypass all filters.
    Everyone else only sees articles where:
      - visible_roles is missing/empty (legacy = visible to all), OR
      - their role is explicitly in visible_roles.
    """
    role = user.get("role")
    if role in KB_CURATOR_ROLES:
        return {}
    return {
        "$or": [
            {"visible_roles": {"$exists": False}},
            {"visible_roles": {"$size": 0}},
            {"visible_roles": role},
        ]
    }


@router.get("/categories")
async def list_categories(user=Depends(get_current_user)):
    db = get_db()
    counts = {}
    pipeline = [
        {"$match": {"is_published": True, **_audience_filter(user)}},
        {"$group": {"_id": "$category", "count": {"$sum": 1}}},
    ]
    async for row in db.kb_articles.aggregate(pipeline):
        counts[row["_id"]] = row["count"]
    return [{"name": c, "count": counts.get(c, 0)} for c in KB_CATEGORIES]


@router.get("/articles")
async def list_articles(
    q: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    related_page: Optional[str] = Query(None),
    user=Depends(get_current_user),  # any logged-in user — but filtered by role
):
    db = get_db()
    flt = {"is_published": True, **_audience_filter(user)}
    if category:
        flt["category"] = category
    if related_page:
        flt["related_page"] = related_page
    if q:
        flt["$and"] = [{"$or": [
            {"title": {"$regex": q, "$options": "i"}},
            {"excerpt": {"$regex": q, "$options": "i"}},
            {"content": {"$regex": q, "$options": "i"}},
            {"tags": {"$regex": q, "$options": "i"}},
        ]}]
    rows = await db.kb_articles.find(flt, {"_id": 0, "content": 0}).sort("view_count", -1).to_list(500)
    return rows


@router.get("/articles/{slug}")
async def get_article(slug: str, user=Depends(get_current_user)):
    db = get_db()
    flt = {"slug": slug, "is_published": True, **_audience_filter(user)}
    art = await db.kb_articles.find_one(flt, {"_id": 0})
    if not art:
        raise HTTPException(404, "Article not found")
    await db.kb_articles.update_one({"slug": slug}, {"$inc": {"view_count": 1}})
    return art


# ---------- Admin (super_admin + company_admin can curate) ----------
_CURATORS = ("super_admin", "company_admin")


@router.get("/admin/roles")
async def list_audience_roles(user=Depends(require_roles(*_CURATORS))):
    """Roles available in the visible_roles multiselect on the admin form.
    Excludes super_admin / reseller / company_admin from the list because
    they always see everything (they're curators, not audience)."""
    return [
        {"value": r, "label": r.replace("_", " ").title()}
        for r in ALL_AUDIENCE_ROLES
    ]


@router.get("/admin/articles")
async def admin_list(user=Depends(require_roles(*_CURATORS))):
    db = get_db()
    rows = await db.kb_articles.find({}, {"_id": 0, "content": 0}).sort("created_at", -1).to_list(1000)
    return rows


@router.post("/admin/articles")
async def admin_create(body: KBArticleCreate, user=Depends(require_roles(*_CURATORS))):
    db = get_db()
    if body.category not in KB_CATEGORIES:
        raise HTTPException(400, f"Invalid category. Must be one of: {KB_CATEGORIES}")
    # Reject any role that isn't on the allowed audience list (prevents
    # someone smuggling 'super_admin' in via the API to lock out curators).
    bad = [r for r in body.visible_roles if r not in ALL_AUDIENCE_ROLES]
    if bad:
        raise HTTPException(400, f"Unknown role(s): {bad}. Allowed: {ALL_AUDIENCE_ROLES}")
    slug = body.slug or _slugify(body.title)
    if await db.kb_articles.find_one({"slug": slug}):
        raise HTTPException(400, "Slug already exists")
    art = KBArticle(
        **body.model_dump(exclude={"slug"}), slug=slug, author_name=user.get("name") or user.get("email"),
    ).model_dump()
    await db.kb_articles.insert_one(art)
    art.pop("_id", None)
    return art


@router.put("/admin/articles/{aid}")
async def admin_update(aid: str, body: KBArticleUpdate, user=Depends(require_roles(*_CURATORS))):
    db = get_db()
    art = await db.kb_articles.find_one({"id": aid}, {"_id": 0})
    if not art:
        raise HTTPException(404, "Not found")
    data = body.model_dump(exclude_none=True)
    if "category" in data and data["category"] not in KB_CATEGORIES:
        raise HTTPException(400, "Invalid category")
    if "visible_roles" in data:
        bad = [r for r in data["visible_roles"] if r not in ALL_AUDIENCE_ROLES]
        if bad:
            raise HTTPException(400, f"Unknown role(s): {bad}")
    if "slug" in data and data["slug"] != art["slug"]:
        if await db.kb_articles.find_one({"slug": data["slug"]}):
            raise HTTPException(400, "Slug already exists")
    data["updated_at"] = now_iso()
    await db.kb_articles.update_one({"id": aid}, {"$set": data})
    return await db.kb_articles.find_one({"id": aid}, {"_id": 0})


@router.delete("/admin/articles/{aid}")
async def admin_delete(aid: str, user=Depends(require_roles(*_CURATORS))):
    db = get_db()
    await db.kb_articles.delete_one({"id": aid})
    return {"ok": True}
