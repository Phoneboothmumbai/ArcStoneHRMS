"""Default India leave types + 2026 national holidays. Idempotent seed."""
from models import now_iso, uid


DEFAULT_LEAVE_TYPES = [
    # name, code, color, default_days, accrual, carry_fwd, cf_cap, encashable, encash_cap, paid, extras
    {"name": "Casual Leave", "code": "CL", "color": "#64748b", "default_days_per_year": 12.0,
     "accrual_cadence": "yearly", "carry_forward": False, "is_paid": True,
     "notice_days": 1, "allow_half_day": True, "sort_order": 10},
    {"name": "Sick Leave", "code": "SL", "color": "#f59e0b", "default_days_per_year": 12.0,
     "accrual_cadence": "yearly", "carry_forward": True, "carry_forward_cap": 30.0, "is_paid": True,
     "requires_document": True, "document_after_days": 3.0, "allow_half_day": True,
     "notice_days": 0, "sort_order": 20},
    {"name": "Earned / Privilege Leave", "code": "EL", "color": "#10b981", "default_days_per_year": 21.0,
     "accrual_cadence": "monthly", "carry_forward": True, "carry_forward_cap": 45.0,
     "encashable": True, "encashment_cap": 30.0, "is_paid": True,
     "notice_days": 7, "min_service_months": 0, "sort_order": 30},
    {"name": "Comp-off", "code": "COMP", "color": "#3b82f6", "default_days_per_year": 0.0,
     "accrual_cadence": "none", "carry_forward": True, "is_paid": True,
     "allow_half_day": True, "notice_days": 1, "sort_order": 40,
     "applies_to_gender": "any"},
    {"name": "Maternity Leave", "code": "ML", "color": "#ec4899", "default_days_per_year": 182.0,
     "accrual_cadence": "on_joining", "carry_forward": False, "is_paid": True,
     "requires_document": True, "document_after_days": 0.0,
     "applies_to_gender": "female", "min_service_months": 2,
     "max_consecutive_days": 182, "notice_days": 14, "allow_half_day": False, "sort_order": 50},
    {"name": "Paternity Leave", "code": "PL", "color": "#8b5cf6", "default_days_per_year": 15.0,
     "accrual_cadence": "on_joining", "carry_forward": False, "is_paid": True,
     "applies_to_gender": "male", "min_service_months": 0,
     "max_consecutive_days": 15, "notice_days": 14, "sort_order": 60},
    {"name": "Bereavement Leave", "code": "BL", "color": "#6b7280", "default_days_per_year": 5.0,
     "accrual_cadence": "on_joining", "carry_forward": False, "is_paid": True,
     "max_consecutive_days": 5, "notice_days": 0, "sort_order": 70},
    {"name": "Marriage Leave", "code": "MRL", "color": "#f43f5e", "default_days_per_year": 5.0,
     "accrual_cadence": "on_joining", "carry_forward": False, "is_paid": True,
     "max_consecutive_days": 5, "notice_days": 30, "requires_document": True, "sort_order": 80},
    {"name": "Leave Without Pay (LOP)", "code": "LOP", "color": "#94a3b8", "default_days_per_year": 0.0,
     "accrual_cadence": "none", "carry_forward": False, "is_paid": False,
     "allow_negative_balance": True, "allow_half_day": True, "notice_days": 0, "sort_order": 100},
]


# India national + major public holidays 2026 (locked)
INDIA_HOLIDAYS_2026 = [
    ("2026-01-01", "New Year's Day", "optional"),
    ("2026-01-14", "Makar Sankranti / Pongal", "optional"),
    ("2026-01-26", "Republic Day", "mandatory"),
    ("2026-03-03", "Holi", "mandatory"),
    ("2026-03-21", "Ramzan Id / Eid-ul-Fitr", "mandatory"),
    ("2026-04-03", "Good Friday", "optional"),
    ("2026-04-10", "Mahavir Jayanti", "optional"),
    ("2026-04-14", "Ambedkar Jayanti", "optional"),
    ("2026-04-26", "Eid-ul-Zuha (Bakrid)", "optional"),
    ("2026-05-01", "Maharashtra Day / Labour Day", "optional"),
    ("2026-05-26", "Muharram", "optional"),
    ("2026-08-15", "Independence Day", "mandatory"),
    ("2026-08-25", "Janmashtami", "optional"),
    ("2026-08-26", "Ganesh Chaturthi", "optional"),
    ("2026-09-03", "Milad-un-Nabi (Id-E-Milad)", "optional"),
    ("2026-10-02", "Gandhi Jayanti", "mandatory"),
    ("2026-10-20", "Dussehra", "mandatory"),
    ("2026-11-08", "Diwali (Deepavali)", "mandatory"),
    ("2026-11-09", "Govardhan Puja / Diwali Padwa", "optional"),
    ("2026-11-10", "Bhai Dooj", "optional"),
    ("2026-11-24", "Guru Nanak Jayanti", "optional"),
    ("2026-12-25", "Christmas", "mandatory"),
]


async def seed_leave_types_and_holidays(db, company_id: str):
    """Idempotent. Seeds leave types for the company + India 2026 holidays."""
    from models_leave import LeaveType, Holiday

    existing_codes = {r["code"] async for r in db.leave_types.find({"company_id": company_id}, {"_id": 0, "code": 1})}
    lt_inserted = 0
    for lt in DEFAULT_LEAVE_TYPES:
        if lt["code"] in existing_codes:
            continue
        doc = LeaveType(company_id=company_id, **lt).model_dump()
        await db.leave_types.insert_one(doc)
        lt_inserted += 1

    existing_dates = {r["date"] async for r in db.holidays.find({"company_id": company_id}, {"_id": 0, "date": 1})}
    h_inserted = 0
    for d, name, kind in INDIA_HOLIDAYS_2026:
        if d in existing_dates:
            continue
        doc = Holiday(company_id=company_id, date=d, name=name, kind=kind).model_dump()
        await db.holidays.insert_one(doc)
        h_inserted += 1

    return lt_inserted, h_inserted
