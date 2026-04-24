"""Demo data seeder — generates 50 employees × 2 years of realistic HRMS data
to let the user experience every module end-to-end without manual data entry."""
from __future__ import annotations

import random
import hashlib
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from auth import get_current_user, require_roles
from db import get_db
from models import Employee, User, now_iso, uid

router = APIRouter(prefix="/api/demo", tags=["demo-data"])

HR = ("super_admin", "company_admin")


# Realistic Indian HRMS demo pool
FIRST_NAMES = [
    "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Reyansh", "Ayaan",
    "Krishna", "Ishaan", "Rohan", "Kabir", "Aryan", "Advait", "Dhruv", "Karan",
    "Rudra", "Siddharth", "Yash", "Shaurya", "Dev", "Mihir", "Neil", "Veer",
    "Priya", "Ananya", "Aditi", "Diya", "Saanvi", "Navya", "Ira", "Myra",
    "Aanya", "Pari", "Anika", "Navya", "Kiara", "Siya", "Riya", "Tara",
    "Nisha", "Aishwarya", "Sneha", "Kavya", "Shruti", "Megha", "Neha", "Tanya",
]
LAST_NAMES = [
    "Sharma", "Verma", "Patel", "Shah", "Kumar", "Reddy", "Iyer", "Menon",
    "Pillai", "Rao", "Nair", "Desai", "Joshi", "Agarwal", "Kapoor", "Malhotra",
    "Singh", "Chauhan", "Jain", "Gupta", "Mishra", "Tiwari", "Pandey", "Yadav",
]
TITLES = [
    ("Engineering", ["Software Engineer", "Senior Software Engineer", "Engineering Manager",
                     "DevOps Engineer", "QA Engineer", "Tech Lead", "Staff Engineer"]),
    ("Product",     ["Product Manager", "Sr. Product Manager", "Product Analyst", "Design Lead"]),
    ("Sales",       ["Account Executive", "Sales Manager", "SDR", "Regional Sales Head", "Key Account Manager"]),
    ("Marketing",   ["Marketing Manager", "Content Lead", "SEO Specialist", "Growth Marketer"]),
    ("Operations",  ["Operations Manager", "Admin Executive", "Office Manager"]),
    ("HR",          ["HR Business Partner", "HR Manager", "Talent Acquisition"]),
    ("Finance",     ["Finance Manager", "Accountant", "Finance Analyst"]),
    ("Customer Success", ["Customer Success Manager", "Support Engineer", "Onboarding Specialist"]),
]
CITIES = [("Bengaluru", "IN-KA"), ("Mumbai", "IN-MH"), ("Delhi", "IN-DL"),
          ("Hyderabad", "IN-TG"), ("Chennai", "IN-TN"), ("Pune", "IN-MH"),
          ("Gurgaon", "IN-HR")]
LEAVE_REASONS = [
    "Family function", "Medical appointment", "Personal work", "Vacation",
    "Wedding", "Festival holiday", "Fever", "Planned trip", "Family emergency",
]


def _rand_doj(years_back: int = 8) -> str:
    """Random DOJ between `years_back` years ago and 90 days ago."""
    start = date.today() - timedelta(days=years_back * 365)
    end = date.today() - timedelta(days=90)
    delta = (end - start).days
    return (start + timedelta(days=random.randint(0, delta))).isoformat()


def _password_hash(pw: str) -> str:
    """Matches the salted hash used in auth.py for consistency."""
    import bcrypt
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


@router.post("/seed-employees")
async def seed_employees(
    count: int = Query(50, ge=1, le=500),
    years: int = Query(2, ge=1, le=5, description="Years of history to generate"),
    reset: bool = Query(False, description="If true, removes all previously seeded DEMO* employees + their data first"),
    user=Depends(require_roles(*HR)),
):
    """Generate N realistic demo employees (prefixed DEMO), their attendance, leave,
    payslips, goals, and tickets over the last `years` years.

    WARNING: This inserts a LOT of documents (e.g. 50 × 500 attendance = 25K rows).
    Only use in demo/staging. Seeded employees are prefixed with 'DEMO' so they
    can be identified and cleaned later.
    """
    db = get_db()
    cid = user["company_id"]
    if not cid:
        raise HTTPException(400, "No company context")
    company = await db.companies.find_one({"id": cid}, {"_id": 0})
    if not company:
        raise HTTPException(404, "Company not found")
    stats: dict = {"employees": 0, "attendance": 0, "leaves": 0, "payslips": 0,
                   "goals": 0, "tickets": 0, "reviewed": 0, "removed": 0}

    # Optionally wipe previous demo data
    if reset:
        demo_emps = await db.employees.find(
            {"company_id": cid, "employee_code": {"$regex": "^DEMO"}}, {"_id": 0, "id": 1},
        ).to_list(1000)
        demo_ids = [e["id"] for e in demo_emps]
        if demo_ids:
            await db.attendance.delete_many({"employee_id": {"$in": demo_ids}})
            await db.leave_requests.delete_many({"employee_id": {"$in": demo_ids}})
            await db.payslips.delete_many({"employee_id": {"$in": demo_ids}})
            await db.employee_salaries.delete_many({"employee_id": {"$in": demo_ids}})
            await db.goals.delete_many({"owner_employee_id": {"$in": demo_ids}})
            await db.tickets.delete_many({"raised_by_employee_id": {"$in": demo_ids}})
            await db.employees.delete_many({"id": {"$in": demo_ids}})
            # Also kill their user accounts
            await db.users.delete_many({"email": {"$regex": "^demo[0-9]+@"}})
            stats["removed"] = len(demo_ids)

    start_date = date.today() - timedelta(days=years * 365)

    # Generate employees + users in bulk
    new_employees = []
    new_users = []
    managers: list[dict] = []
    pw_hash = _password_hash("Demo@12345")
    base_seq = await db.employees.count_documents({"company_id": cid}) + 1

    for i in range(count):
        fn = random.choice(FIRST_NAMES)
        ln = random.choice(LAST_NAMES)
        dept, titles = random.choice(TITLES)
        title = random.choice(titles)
        city, _country = random.choice(CITIES)
        emp_type = random.choices(["wfo", "wfh", "hybrid", "field"], weights=[50, 20, 25, 5])[0]
        role = "employee"
        if i < max(5, count // 10) and "Manager" in title:
            role = "branch_manager"
        doj = _rand_doj(random.randint(1, years + 3))
        emp_code = f"DEMO{base_seq + i:04d}"
        emp_email = f"demo{base_seq + i}@acme.io"
        emp_id = uid()
        emp = Employee(
            id=emp_id, company_id=cid, employee_code=emp_code,
            name=f"{fn} {ln}", email=emp_email, phone=f"+91{random.randint(7000000000, 9999999999)}",
            job_title=title, department_name=dept,
            employee_type=emp_type, role_in_company=role,
            joined_on=doj + "T00:00:00+00:00", status="active",
            manager_id=random.choice(managers)["id"] if managers and i > 5 and random.random() < 0.7 else None,
        ).model_dump()
        new_employees.append(emp)
        if role == "branch_manager":
            managers.append(emp)

        # Create a user for each employee
        u = User(
            id=uid(), email=emp_email, name=emp["name"],
            password_hash=pw_hash,
            role="branch_manager" if role == "branch_manager" else "employee",
            company_id=cid, employee_id=emp_id, is_active=True,
        ).model_dump()
        new_users.append(u)

    if new_employees:
        await db.employees.insert_many([dict(e) for e in new_employees])
        await db.users.insert_many([dict(u) for u in new_users])
        stats["employees"] = len(new_employees)

    # Generate attendance + leaves + payslips + goals
    today = date.today()
    attendance_batch = []
    leave_batch = []
    payslip_batch = []
    salary_batch = []
    goal_batch = []
    ticket_batch = []

    # pre-cache a single ticket category id if exists (for tickets)
    cat = await db.ticket_categories.find_one({"company_id": cid, "is_active": True}, {"_id": 0})
    cat_id = cat["id"] if cat else None
    cat_name = cat["name"] if cat else None

    for emp in new_employees:
        emp_id = emp["id"]
        emp_name = emp["name"]
        doj = date.fromisoformat(emp["joined_on"][:10])
        emp_start = max(doj, start_date)
        # Pick a random base salary
        ctc_annual = random.choice([600000, 900000, 1200000, 1500000, 1800000, 2400000, 3000000, 4500000])
        monthly_gross = ctc_annual / 12
        basic = round(monthly_gross * 0.45, 2)
        hra = round(monthly_gross * 0.25, 2)
        special = round(monthly_gross - basic - hra, 2)
        salary_batch.append({
            "id": uid(), "company_id": cid, "employee_id": emp_id,
            "ctc_annual": ctc_annual, "basic": basic, "hra": hra,
            "special_allowance": special, "currency": "INR",
            "effective_from": emp["joined_on"][:10],
            "is_current": True,
            "created_at": now_iso(), "updated_at": now_iso(),
        })

        # Attendance — iterate working days only
        cur = emp_start
        leave_days_remaining = {}   # emp-level leave-days tracker
        while cur <= today:
            wd = cur.weekday()
            roll = random.random()
            if wd == 6:
                # Sunday — no record
                pass
            elif roll < 0.03:
                # Absent (no record)
                pass
            elif roll < 0.10:
                # On leave — create a leave request spanning 1-3 days (once per quarter)
                if cur.month % 3 == 0 and (emp_id, cur.year, cur.month) not in leave_days_remaining:
                    dur = random.choice([1, 1, 2, 2, 3])
                    lr_start = cur
                    lr_end = cur + timedelta(days=dur - 1)
                    leave_batch.append({
                        "id": uid(), "company_id": cid, "employee_id": emp_id,
                        "employee_name": emp_name,
                        "leave_type": random.choice(["casual", "sick", "earned"]),
                        "start_date": lr_start.isoformat() + "T00:00:00+00:00",
                        "end_date": lr_end.isoformat() + "T23:59:59+00:00",
                        "reason": random.choice(LEAVE_REASONS),
                        "status": "approved",
                        "decided_at": (lr_start - timedelta(days=1)).isoformat() + "T10:00:00+00:00",
                        "created_at": (lr_start - timedelta(days=2)).isoformat() + "T09:00:00+00:00",
                        "updated_at": now_iso(),
                    })
                    leave_days_remaining[(emp_id, cur.year, cur.month)] = True
                    cur += timedelta(days=dur)
                    continue
            else:
                # Present
                is_late = roll > 0.85
                is_half_day = roll > 0.97
                ci_hour = 10 if is_late else 9
                ci_min = random.randint(0, 59) if is_late else random.randint(0, 30)
                co_hour = 14 if is_half_day else (17 if not is_late else 18)
                hours = (co_hour - ci_hour) + random.uniform(-0.3, 0.7)
                attendance_batch.append({
                    "id": uid(), "company_id": cid, "employee_id": emp_id,
                    "date": cur.isoformat(),
                    "check_in": f"{cur.isoformat()}T{ci_hour:02d}:{ci_min:02d}:00+00:00",
                    "check_out": f"{cur.isoformat()}T{co_hour:02d}:{random.randint(0, 59):02d}:00+00:00",
                    "hours": round(hours, 2),
                    "is_late": is_late, "is_half_day": is_half_day,
                    "location": {"kind": emp["employee_type"], "lat": None, "lng": None},
                    "created_at": now_iso(), "updated_at": now_iso(),
                })
            cur += timedelta(days=1)

        # Payslips — past 24 months (or since joining)
        payslip_start = max(doj.replace(day=1), (today.replace(day=1) - timedelta(days=years * 365)).replace(day=1))
        p_cur = payslip_start
        while p_cur < today.replace(day=1):
            ym = p_cur.strftime("%Y-%m")
            paid_days = 30
            gross = round(monthly_gross, 2)
            deductions = round(gross * 0.18, 2)       # PF + TDS + prof tax approx
            net = round(gross - deductions, 2)
            payslip_batch.append({
                "id": uid(), "company_id": cid, "employee_id": emp_id,
                "employee_name": emp_name, "employee_code": emp["employee_code"],
                "period_month": ym, "paid_days": paid_days, "lop_days": 0,
                "actual_gross": gross, "total_deductions": deductions,
                "actual_net": net, "tds": round(gross * 0.08, 2),
                "currency": "INR", "status": "paid" if p_cur < today.replace(day=1) - timedelta(days=5) else "generated",
                "generated_at": (p_cur + timedelta(days=28)).isoformat() + "T18:00:00+00:00",
                "created_at": now_iso(), "updated_at": now_iso(),
            })
            # Next month
            p_cur = (p_cur + timedelta(days=32)).replace(day=1)

        # Goals — 2-4 per year
        for yr_offset in range(years + 1):
            yr = today.year - yr_offset
            if date(yr, 1, 1) < doj:
                continue
            for _ in range(random.randint(2, 4)):
                prog = random.randint(20, 100)
                status_ = "completed" if prog >= 95 else ("on_track" if prog >= 70 else ("at_risk" if prog < 40 else "active"))
                goal_batch.append({
                    "id": uid(), "company_id": cid,
                    "owner_employee_id": emp_id, "owner_name": emp_name,
                    "kind": random.choice(["okr", "individual", "team"]),
                    "title": random.choice([
                        f"Improve {emp.get('department_name')} delivery velocity",
                        "Launch Q3 customer onboarding playbook",
                        "Reduce escalations by 30%",
                        "Hire 2 direct reports", "Shipped new feature X",
                        "Improve NPS from 35 to 55",
                    ]),
                    "progress": float(prog), "status": status_,
                    "priority": random.choice(["low", "medium", "high"]),
                    "weight": 1.0, "key_results": [],
                    "tags": [],
                    "due_date": f"{yr}-12-31",
                    "created_at": now_iso(), "updated_at": now_iso(),
                })

        # Tickets — 0-3 per employee
        if cat_id and random.random() < 0.4:
            for _ in range(random.randint(0, 2)):
                seq = (await db.tickets.count_documents({"company_id": cid})) + len(ticket_batch) + 1
                status_t = random.choice(["open", "in_progress", "resolved", "closed"])
                ticket_batch.append({
                    "id": uid(), "company_id": cid,
                    "code": f"HELP-{seq:04d}",
                    "category_id": cat_id, "category_name": cat_name,
                    "subject": random.choice([
                        "Laptop slow", "Need access to Jira project",
                        "Payslip not received", "Cannot login to VPN",
                    ]),
                    "description": "Please look into this at earliest.",
                    "status": status_t, "priority": random.choice(["low", "medium", "high"]),
                    "raised_by_user_id": None, "raised_by_name": emp_name,
                    "raised_by_employee_id": emp_id,
                    "assignee_user_id": None, "assignee_name": None,
                    "first_response_at": None, "first_response_due": None,
                    "resolve_due": None, "resolved_at": None, "closed_at": None,
                    "escalated": False, "escalated_at": None,
                    "comments": [], "attachments": [], "tags": [],
                    "satisfaction_rating": None,
                    "created_at": now_iso(), "updated_at": now_iso(),
                })

    # Insert in chunks (Mongo cap = 16MB / batch)
    def _chunks(lst, size=1000):
        for i in range(0, len(lst), size):
            yield lst[i:i + size]

    if attendance_batch:
        for chunk in _chunks(attendance_batch, 2000):
            await db.attendance.insert_many(chunk)
        stats["attendance"] = len(attendance_batch)
    if leave_batch:
        await db.leave_requests.insert_many(leave_batch)
        stats["leaves"] = len(leave_batch)
    if payslip_batch:
        await db.payslips.insert_many(payslip_batch)
        stats["payslips"] = len(payslip_batch)
    if salary_batch:
        await db.employee_salaries.insert_many(salary_batch)
    if goal_batch:
        await db.goals.insert_many(goal_batch)
        stats["goals"] = len(goal_batch)
    if ticket_batch:
        await db.tickets.insert_many(ticket_batch)
        stats["tickets"] = len(ticket_batch)

    return {
        "ok": True, "stats": stats,
        "years_seeded": years, "employee_count": count,
        "login_hint": "All demo employees use password: Demo@12345. Emails: demo{seq}@acme.io",
    }


@router.post("/wipe-demo")
async def wipe_demo(user=Depends(require_roles(*HR))):
    """Delete every DEMO-prefixed employee and associated data. Irreversible."""
    db = get_db()
    cid = user["company_id"]
    demo_emps = await db.employees.find(
        {"company_id": cid, "employee_code": {"$regex": "^DEMO"}}, {"_id": 0, "id": 1},
    ).to_list(1000)
    demo_ids = [e["id"] for e in demo_emps]
    if not demo_ids:
        return {"ok": True, "removed": 0}
    await db.attendance.delete_many({"employee_id": {"$in": demo_ids}})
    await db.leave_requests.delete_many({"employee_id": {"$in": demo_ids}})
    await db.payslips.delete_many({"employee_id": {"$in": demo_ids}})
    await db.employee_salaries.delete_many({"employee_id": {"$in": demo_ids}})
    await db.goals.delete_many({"owner_employee_id": {"$in": demo_ids}})
    await db.tickets.delete_many({"raised_by_employee_id": {"$in": demo_ids}})
    await db.employees.delete_many({"id": {"$in": demo_ids}})
    await db.users.delete_many({"email": {"$regex": "^demo[0-9]+@"}})
    return {"ok": True, "removed": len(demo_ids)}
