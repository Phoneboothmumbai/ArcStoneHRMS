"""Seed a handful of Off-Roll / Intern employees so the Employment Classes dashboard
has variety for demo. Idempotent: re-running updates, never duplicates.

Run with:  python /app/scripts/seed_employment_classes.py
"""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[1] / "backend" / ".env")

from motor.motor_asyncio import AsyncIOMotorClient


SEEDS = [
    # (name, email, employment_class, job_title)
    ("Riya Agarwal",  "riya.consultant@acme.io",   "off_roll_consultant", "Senior Data Consultant"),
    ("Vikram Reddy",  "vikram.consultant@acme.io", "off_roll_consultant", "Tax Advisory Consultant"),
    ("Sneha Kapoor",  "sneha.consultant@acme.io",  "off_roll_consultant", "Marketing Consultant"),
    ("Amit Ranjan",   "amit.contractor@acme.io",   "off_roll_contractor", "Housekeeping Supervisor (Contract)"),
    ("Kavya Menon",   "kavya.contractor@acme.io",  "off_roll_contractor", "Security Lead (Contract)"),
    ("Rohan Bhat",    "rohan.intern@acme.io",      "intern",              "Product Intern"),
    ("Ananya Singh",  "ananya.intern@acme.io",     "intern",              "Design Intern"),
    ("Arjun Iyer",    "arjun.intern@acme.io",      "intern",              "Engineering Intern"),
]


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    comp = await db.companies.find_one({"name": {"$regex": "acme", "$options": "i"}}, {"_id": 0})
    if not comp:
        comp = await db.companies.find_one({}, {"_id": 0})
    if not comp:
        print("No company found. Aborting.")
        return
    cid = comp["id"]
    print(f"Seeding for company: {comp['name']} ({cid})")

    # Pick first branch/dept for placement
    branch = await db.branches.find_one({"company_id": cid}, {"_id": 0})
    dept = await db.departments.find_one({"company_id": cid}, {"_id": 0})

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()

    next_code = await db.employees.count_documents({"company_id": cid})

    created, updated = 0, 0
    for name, email, ec, title in SEEDS:
        existing = await db.employees.find_one({"email": email.lower(), "company_id": cid})
        if existing:
            await db.employees.update_one(
                {"id": existing["id"]},
                {"$set": {"employment_class": ec, "job_title": title, "updated_at": now}},
            )
            updated += 1
            continue
        next_code += 1
        import uuid
        emp_id = str(uuid.uuid4())
        doc = {
            "id": emp_id, "company_id": cid, "user_id": None,
            "employee_code": f"EMP-{next_code:04d}",
            "name": name, "email": email.lower(), "phone": None,
            "employee_type": "wfo",
            "employment_class": ec,
            "region_id": None, "country_id": None,
            "branch_id": branch["id"] if branch else None,
            "branch_name": branch.get("name") if branch else None,
            "department_id": dept["id"] if dept else None,
            "department_name": dept.get("name") if dept else None,
            "job_title": title,
            "manager_id": None, "role_in_company": "employee",
            "joined_on": now, "status": "active",
            "created_at": now, "updated_at": now,
        }
        await db.employees.insert_one(doc)
        created += 1

    # bump company count
    await db.companies.update_one({"id": cid}, {"$set": {"updated_at": now}})
    print(f"Done. created={created}, updated={updated}")

    # Show final counts per class
    pipeline = [
        {"$match": {"company_id": cid, "status": {"$ne": "terminated"}}},
        {"$group": {"_id": "$employment_class", "n": {"$sum": 1}}},
    ]
    print("\nHead-count by employment class:")
    async for row in db.employees.aggregate(pipeline):
        print(f"  {row['_id'] or 'unset':<25} {row['n']}")


if __name__ == "__main__":
    asyncio.run(main())
