"""Default India salary components + salary structure templates."""
from models import now_iso, uid


# All defaults for an India-first payroll. is_locked=True for statutory components.
DEFAULT_COMPONENTS = [
    # Earnings
    {"name":"Basic Salary","code":"BASIC","kind":"earning","category":"basic",
     "calculation_type":"pct_of_ctc","default_value":50.0,"is_taxable":True,
     "is_pf_applicable":True,"is_esic_applicable":True,"is_pt_applicable":True,
     "is_locked":True,"sort_order":10},
    {"name":"House Rent Allowance","code":"HRA","kind":"earning","category":"hra",
     "calculation_type":"pct_of_basic","default_value":40.0,"is_taxable":True,
     "is_pf_applicable":False,"is_esic_applicable":True,"is_pt_applicable":True,
     "hra_exempt_sec10":True,"sort_order":20},
    {"name":"Special Allowance","code":"SPECIAL","kind":"earning","category":"special",
     "calculation_type":"pct_of_ctc","default_value":20.0,"is_taxable":True,
     "is_pf_applicable":False,"is_esic_applicable":True,"is_pt_applicable":True,
     "sort_order":30},
    {"name":"Conveyance","code":"CONV","kind":"earning","category":"conveyance",
     "calculation_type":"fixed","default_value":1600.0,"is_taxable":True,
     "is_pf_applicable":False,"is_esic_applicable":False,"is_pt_applicable":True,
     "sort_order":40},
    {"name":"Medical Allowance","code":"MEDICAL","kind":"earning","category":"medical",
     "calculation_type":"fixed","default_value":1250.0,"is_taxable":True,
     "is_pf_applicable":False,"is_esic_applicable":False,"is_pt_applicable":True,
     "sort_order":50},
    {"name":"Leave Travel Allowance","code":"LTA","kind":"earning","category":"lta",
     "calculation_type":"pct_of_ctc","default_value":5.0,"is_taxable":True,
     "is_pf_applicable":False,"is_esic_applicable":False,"is_pt_applicable":True,
     "lta_exempt":True,"sort_order":60},
    # Deductions (statutory)
    {"name":"Provident Fund (Employee)","code":"PF","kind":"deduction","category":"pf",
     "calculation_type":"statutory","default_value":12.0,"is_taxable":False,
     "is_pf_applicable":False,"is_esic_applicable":False,"is_pt_applicable":False,
     "is_locked":True,"sort_order":100},
    {"name":"ESIC (Employee)","code":"ESIC","kind":"deduction","category":"esic",
     "calculation_type":"statutory","default_value":0.75,"is_taxable":False,
     "is_pf_applicable":False,"is_esic_applicable":False,"is_pt_applicable":False,
     "is_locked":True,"sort_order":110},
    {"name":"Professional Tax","code":"PT","kind":"deduction","category":"pt",
     "calculation_type":"statutory","default_value":200.0,"is_taxable":False,
     "is_pf_applicable":False,"is_esic_applicable":False,"is_pt_applicable":False,
     "is_locked":True,"sort_order":120},
    {"name":"Tax Deducted at Source (TDS)","code":"TDS","kind":"deduction","category":"tds",
     "calculation_type":"statutory","default_value":0.0,"is_taxable":False,
     "is_locked":True,"sort_order":130},
    # Employer contributions (cost to company but NOT in take-home)
    {"name":"Employer PF Contribution","code":"EMPF","kind":"employer_cost","category":"employer_pf",
     "calculation_type":"statutory","default_value":12.0,"is_taxable":False,
     "is_locked":True,"sort_order":200},
    {"name":"Employer ESIC Contribution","code":"EESIC","kind":"employer_cost","category":"employer_esic",
     "calculation_type":"statutory","default_value":3.25,"is_taxable":False,
     "is_locked":True,"sort_order":210},
    {"name":"Gratuity Provision","code":"GRAT","kind":"employer_cost","category":"gratuity",
     "calculation_type":"pct_of_basic","default_value":4.81,"is_taxable":False,
     "is_locked":True,"sort_order":220},
]


# Sample grade-based structures
DEFAULT_STRUCTURES = [
    {"name":"M1 / Junior (₹4-8 LPA)", "target_ctc_annual":600000.0, "applies_to_grades":["M1","Junior"]},
    {"name":"M2 / Executive (₹8-15 LPA)", "target_ctc_annual":1200000.0, "applies_to_grades":["M2","Executive"]},
    {"name":"M3 / Senior (₹15-25 LPA)", "target_ctc_annual":2000000.0, "applies_to_grades":["M3","Senior"]},
    {"name":"M4 / Lead (₹25-40 LPA)", "target_ctc_annual":3500000.0, "applies_to_grades":["M4","Lead","Principal"]},
]


async def seed_payroll_components(db, company_id: str):
    """Idempotent. Inserts salary components + structures for the company."""
    from models_payroll import SalaryComponent, SalaryStructure, StructureLine

    existing = {c["code"] async for c in db.salary_components.find({"company_id": company_id}, {"_id": 0, "code": 1})}
    c_inserted = 0
    for cdef in DEFAULT_COMPONENTS:
        if cdef["code"] in existing: continue
        doc = SalaryComponent(company_id=company_id, **cdef).model_dump()
        await db.salary_components.insert_one(doc)
        c_inserted += 1

    # Build structure lines from seeded components
    comps = await db.salary_components.find({"company_id": company_id}, {"_id": 0}).to_list(200)
    cmap = {c["code"]: c for c in comps}
    STD_LINES = [
        ("BASIC","pct_of_ctc",50.0), ("HRA","pct_of_basic",40.0),
        ("SPECIAL","pct_of_ctc",20.0), ("CONV","fixed",1600.0),
        ("MEDICAL","fixed",1250.0), ("LTA","pct_of_ctc",5.0),
        ("PF","statutory",12.0), ("ESIC","statutory",0.75),
        ("PT","statutory",200.0), ("EMPF","statutory",12.0),
        ("EESIC","statutory",3.25), ("GRAT","pct_of_basic",4.81),
    ]

    existing_structs = {s["name"] async for s in db.salary_structures.find({"company_id": company_id}, {"_id": 0, "name": 1})}
    s_inserted = 0
    for sdef in DEFAULT_STRUCTURES:
        if sdef["name"] in existing_structs: continue
        lines = []
        for code, ct, val in STD_LINES:
            c = cmap.get(code)
            if not c: continue
            lines.append(StructureLine(
                component_id=c["id"], component_code=code, component_name=c["name"],
                calculation_type=ct, value=val,
            ).model_dump())
        doc = SalaryStructure(company_id=company_id, lines=lines, **sdef).model_dump()
        await db.salary_structures.insert_one(doc)
        s_inserted += 1

    return c_inserted, s_inserted
