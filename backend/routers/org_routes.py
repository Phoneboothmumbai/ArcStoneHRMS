"""Organization hierarchy: regions, countries, branches, departments + tree."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from auth import get_current_user, require_roles
from db import get_db
from models import OrgNodeCreate, now_iso, uid

router = APIRouter(prefix="/api/org", tags=["org"])


def _scope(user) -> str:
    if user["role"] in ("super_admin",):
        return None  # can pass company_id in query
    cid = user.get("company_id")
    if not cid:
        raise HTTPException(403, "No company scope")
    return cid


@router.get("/tree")
async def org_tree(company_id: str = None, user=Depends(get_current_user)):
    db = get_db()
    cid = company_id or user.get("company_id")
    if not cid:
        raise HTTPException(400, "company_id required")
    if user["role"] not in ("super_admin",) and user.get("company_id") != cid:
        raise HTTPException(403, "Forbidden")
    regions = await db.regions.find({"company_id": cid}, {"_id": 0}).to_list(1000)
    countries = await db.countries.find({"company_id": cid}, {"_id": 0}).to_list(1000)
    branches = await db.branches.find({"company_id": cid}, {"_id": 0}).to_list(1000)
    departments = await db.departments.find({"company_id": cid}, {"_id": 0}).to_list(1000)
    employees = await db.employees.find({"company_id": cid}, {"_id": 0}).to_list(5000)

    # Build hierarchy
    for r in regions:
        r["countries"] = []
    for c in countries:
        c["branches"] = []
        rg = next((r for r in regions if r["id"] == c["region_id"]), None)
        if rg:
            rg["countries"].append(c)
    for b in branches:
        b["departments"] = []
        b["employees"] = [e for e in employees if e.get("branch_id") == b["id"]]
        co = next((c for c in countries if c["id"] == b["country_id"]), None)
        if co:
            co["branches"].append(b)
    for d in departments:
        br = next((b for b in branches if b["id"] == d.get("branch_id")), None)
        if br:
            br["departments"].append(d)
    return {"regions": regions, "stats": {
        "regions": len(regions), "countries": len(countries), "branches": len(branches),
        "departments": len(departments), "employees": len(employees),
    }}


@router.get("/regions")
async def list_regions(user=Depends(get_current_user)):
    db = get_db()
    cid = user.get("company_id")
    return await db.regions.find({"company_id": cid}, {"_id": 0}).to_list(500)


@router.post("/regions")
async def create_region(body: OrgNodeCreate, user=Depends(require_roles("super_admin", "company_admin"))):
    db = get_db()
    cid = user.get("company_id")
    if not cid:
        raise HTTPException(400, "company scope required")
    doc = {"id": uid(), "company_id": cid, "name": body.name, "head_user_id": None,
           "created_at": now_iso(), "updated_at": now_iso()}
    await db.regions.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/countries")
async def list_countries(user=Depends(get_current_user)):
    db = get_db()
    return await db.countries.find({"company_id": user.get("company_id")}, {"_id": 0}).to_list(1000)


@router.post("/countries")
async def create_country(body: OrgNodeCreate, user=Depends(require_roles("super_admin", "company_admin"))):
    db = get_db()
    if not body.parent_id:
        raise HTTPException(400, "parent_id (region_id) required")
    doc = {"id": uid(), "company_id": user.get("company_id"), "region_id": body.parent_id,
           "name": body.name, "iso_code": body.iso_code or "", "head_user_id": None,
           "created_at": now_iso(), "updated_at": now_iso()}
    await db.countries.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/branches")
async def list_branches(user=Depends(get_current_user)):
    db = get_db()
    return await db.branches.find({"company_id": user.get("company_id")}, {"_id": 0}).to_list(1000)


@router.post("/branches")
async def create_branch(body: OrgNodeCreate, user=Depends(require_roles("super_admin", "company_admin"))):
    db = get_db()
    if not body.parent_id:
        raise HTTPException(400, "parent_id (country_id) required")
    doc = {"id": uid(), "company_id": user.get("company_id"), "country_id": body.parent_id,
           "name": body.name, "city": body.city or "", "address": body.address,
           "manager_user_id": None, "created_at": now_iso(), "updated_at": now_iso()}
    await db.branches.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/departments")
async def list_departments(user=Depends(get_current_user)):
    db = get_db()
    return await db.departments.find({"company_id": user.get("company_id")}, {"_id": 0}).to_list(1000)


@router.post("/departments")
async def create_department(body: OrgNodeCreate, user=Depends(require_roles("super_admin", "company_admin"))):
    db = get_db()
    doc = {"id": uid(), "company_id": user.get("company_id"), "branch_id": body.parent_id,
           "name": body.name, "head_user_id": None,
           "created_at": now_iso(), "updated_at": now_iso()}
    await db.departments.insert_one(doc)
    doc.pop("_id", None)
    return doc


# =========================================================================
# Chart templates — reporting / functional / location / project
# =========================================================================
HR_ROLES = ("super_admin", "company_admin", "country_head", "region_head", "branch_manager")


@router.get("/chart-pdf")
async def chart_pdf(
    template: str = "reporting",
    search: Optional[str] = Query(None),
    user=Depends(get_current_user),
):
    """Render the current org-chart view to a print-ready PDF."""
    chart_data = await chart(template=template, user=user)  # reuse the in-process function below
    db = get_db()
    company = await db.companies.find_one({"id": user.get("company_id")}, {"_id": 0}) or {}
    from pdf_render import render_orgchart_pdf
    pdf = render_orgchart_pdf(chart_data, company.get("name", "Company"), search=search)
    fname = f"orgchart_{template}.pdf"
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename={fname}"})


@router.get("/chart")
async def chart(
    template: str = "reporting",
    user=Depends(get_current_user),
):
    """Return a hierarchy in the requested chart template."""
    db = get_db()
    cid = user.get("company_id")
    if not cid:
        raise HTTPException(400, "company scope required")
    if template not in ("reporting", "functional", "location", "project"):
        raise HTTPException(400, "Unknown template")

    employees = await db.employees.find(
        {"company_id": cid, "status": {"$ne": "terminated"}}, {"_id": 0},
    ).to_list(5000)
    branches = await db.branches.find({"company_id": cid}, {"_id": 0}).to_list(500)
    departments = await db.departments.find({"company_id": cid}, {"_id": 0}).to_list(500)
    projects = await db.projects.find({"company_id": cid, "is_active": True}, {"_id": 0}).to_list(500)

    by_id = {e["id"]: e for e in employees}

    def card(emp):
        return {
            "id": emp["id"], "name": emp.get("name"), "employee_code": emp.get("employee_code"),
            "job_title": emp.get("job_title"), "manager_id": emp.get("manager_id"),
            "department_id": emp.get("department_id"), "department_name": emp.get("department_name"),
            "branch_id": emp.get("branch_id"), "branch_name": emp.get("branch_name"),
            "employee_type": emp.get("employee_type"), "email": emp.get("email"),
            "avatar_url": emp.get("avatar_url"),
            "project_ids": emp.get("project_ids", []),
            "children": [],
        }

    if template == "reporting":
        # Build tree by manager_id
        nodes = {e["id"]: card(e) for e in employees}
        roots = []
        for e in employees:
            mgr = e.get("manager_id")
            if mgr and mgr in nodes:
                nodes[mgr]["children"].append(nodes[e["id"]])
            else:
                roots.append(nodes[e["id"]])
        # Sort children by name for stability
        def sort_tree(n):
            n["children"].sort(key=lambda x: (x.get("name") or "").lower())
            for c in n["children"]:
                sort_tree(c)
        for r in roots:
            sort_tree(r)
        return {"template": "reporting", "roots": roots, "stats": {"employees": len(employees)}}

    if template == "functional":
        # Group by department first, then reporting hierarchy inside each dept
        groups = []
        for d in sorted(departments, key=lambda x: (x.get("name") or "").lower()):
            dept_emps = [e for e in employees if e.get("department_id") == d["id"]]
            nodes = {e["id"]: card(e) for e in dept_emps}
            roots = []
            for e in dept_emps:
                mgr = e.get("manager_id")
                if mgr and mgr in nodes:
                    nodes[mgr]["children"].append(nodes[e["id"]])
                else:
                    roots.append(nodes[e["id"]])
            groups.append({
                "group_id": d["id"], "group_name": d["name"],
                "group_kind": "department",
                "head_user_id": d.get("head_user_id"),
                "count": len(dept_emps), "roots": roots,
            })
        # Unassigned bucket
        unassigned = [e for e in employees if not e.get("department_id")]
        if unassigned:
            groups.append({
                "group_id": "_unassigned", "group_name": "Unassigned",
                "group_kind": "department", "count": len(unassigned),
                "roots": [card(e) for e in unassigned],
            })
        return {"template": "functional", "groups": groups, "stats": {"employees": len(employees), "departments": len(departments)}}

    if template == "location":
        groups = []
        for b in sorted(branches, key=lambda x: (x.get("name") or "").lower()):
            br_emps = [e for e in employees if e.get("branch_id") == b["id"]]
            nodes = {e["id"]: card(e) for e in br_emps}
            roots = []
            for e in br_emps:
                mgr = e.get("manager_id")
                if mgr and mgr in nodes:
                    nodes[mgr]["children"].append(nodes[e["id"]])
                else:
                    roots.append(nodes[e["id"]])
            groups.append({
                "group_id": b["id"], "group_name": f"{b['name']} · {b.get('city','')}".strip(" ·"),
                "group_kind": "branch", "state_code": b.get("state_code"),
                "is_head_office": b.get("is_head_office", False),
                "count": len(br_emps), "roots": roots,
            })
        unassigned = [e for e in employees if not e.get("branch_id")]
        if unassigned:
            groups.append({
                "group_id": "_unassigned", "group_name": "No branch",
                "group_kind": "branch", "count": len(unassigned),
                "roots": [card(e) for e in unassigned],
            })
        return {"template": "location", "groups": groups,
                "stats": {"employees": len(employees), "branches": len(branches)}}

    # project
    groups = []
    emp_to_card = {e["id"]: card(e) for e in employees}
    for p in sorted(projects, key=lambda x: (x.get("name") or "").lower()):
        members = [emp_to_card[mid] for mid in (p.get("member_ids") or []) if mid in emp_to_card]
        # Also pick employees with project_ids containing p.id
        for e in employees:
            if p["id"] in (e.get("project_ids") or []) and e["id"] not in (p.get("member_ids") or []):
                members.append(emp_to_card[e["id"]])
        # lead is shown as the only "root" with the rest as children (flat hierarchy)
        lead_id = p.get("lead_user_id_emp")
        roots = []
        if lead_id and lead_id in emp_to_card:
            head = card(by_id[lead_id])
            head["children"] = [m for m in members if m["id"] != lead_id]
            roots = [head]
        else:
            roots = members
        groups.append({
            "group_id": p["id"], "group_name": p["name"], "group_kind": "project",
            "code": p.get("code"), "status": p.get("status"),
            "count": len(members), "roots": roots,
        })
    return {"template": "project", "groups": groups, "stats": {"employees": len(employees), "projects": len(projects)}}


# =========================================================================
# Branch CRUD enhancements (multi-location with state)
# =========================================================================
@router.put("/branches/{branch_id}")
async def update_branch(branch_id: str, body: dict, user=Depends(require_roles(*HR_ROLES))):
    db = get_db()
    cid = user.get("company_id")
    allowed = {"name", "city", "address", "state_code", "state_name", "pincode",
               "phone", "is_head_office", "manager_user_id"}
    patch = {k: v for k, v in body.items() if k in allowed}
    if not patch:
        raise HTTPException(400, "Nothing to update")
    patch["updated_at"] = now_iso()
    if patch.get("is_head_office"):
        # Only one head office per company
        await db.branches.update_many({"company_id": cid, "is_head_office": True},
                                       {"$set": {"is_head_office": False}})
    r = await db.branches.update_one({"id": branch_id, "company_id": cid}, {"$set": patch})
    if r.matched_count == 0:
        raise HTTPException(404, "Branch not found")
    return await db.branches.find_one({"id": branch_id}, {"_id": 0})


@router.delete("/branches/{branch_id}")
async def delete_branch(branch_id: str, user=Depends(require_roles("super_admin", "company_admin"))):
    db = get_db()
    cid = user.get("company_id")
    # Prevent delete if employees still attached
    in_use = await db.employees.count_documents({"company_id": cid, "branch_id": branch_id})
    if in_use:
        raise HTTPException(400, f"{in_use} employees still assigned to this branch")
    await db.branches.delete_one({"id": branch_id, "company_id": cid})
    return {"ok": True}


# =========================================================================
# Projects (for project-mode org chart)
# =========================================================================
@router.get("/projects")
async def list_projects(user=Depends(get_current_user)):
    db = get_db()
    return await db.projects.find({"company_id": user.get("company_id")}, {"_id": 0}).sort("name", 1).to_list(500)


@router.post("/projects")
async def create_project(body: dict, user=Depends(require_roles(*HR_ROLES))):
    db = get_db()
    cid = user.get("company_id")
    if not body.get("name"):
        raise HTTPException(400, "Project name required")
    doc = {
        "id": uid(), "company_id": cid,
        "name": body["name"],
        "code": (body.get("code") or "").upper() or None,
        "description": body.get("description"),
        "lead_user_id_emp": body.get("lead_user_id_emp"),  # employee_id of project lead
        "member_ids": body.get("member_ids") or [],
        "status": body.get("status") or "active",
        "is_active": True,
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.projects.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/projects/{pid}")
async def update_project(pid: str, body: dict, user=Depends(require_roles(*HR_ROLES))):
    db = get_db()
    cid = user.get("company_id")
    allowed = {"name", "code", "description", "lead_user_id_emp", "member_ids", "status", "is_active"}
    patch = {k: v for k, v in body.items() if k in allowed}
    if not patch:
        raise HTTPException(400, "Nothing to update")
    patch["updated_at"] = now_iso()
    r = await db.projects.update_one({"id": pid, "company_id": cid}, {"$set": patch})
    if r.matched_count == 0:
        raise HTTPException(404, "Project not found")
    return await db.projects.find_one({"id": pid}, {"_id": 0})


@router.delete("/projects/{pid}")
async def delete_project(pid: str, user=Depends(require_roles(*HR_ROLES))):
    db = get_db()
    await db.projects.update_one({"id": pid, "company_id": user.get("company_id")},
                                  {"$set": {"is_active": False, "updated_at": now_iso()}})
    return {"ok": True}
