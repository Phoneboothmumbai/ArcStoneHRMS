"""
Payroll math regression suite — tests the pure-python calculation helpers.

This is the safety net against the #1 customer-churn risk: wrong salaries.
Every helper that touches money has a test here. Run with:

    cd /app/backend && pytest tests/test_payroll_math.py -v

Rule: ADD a test HERE before fixing any payroll math bug, and BEFORE changing
any helper signature. Green tests before merge.
"""
from __future__ import annotations

import pytest

from routers.payroll_routes import _compute_lines, _compute_totals
from routers.fnf_routes import _build_schedule


# ---------------------------------------------------------------------------
# Fixtures — minimal India-standard component set + a simple structure
# ---------------------------------------------------------------------------
COMPONENTS = [
    {"id": "c1", "code": "BASIC",  "name": "Basic",          "kind": "earning",   "category": "basic",          "is_taxable": True,  "is_pf_applicable": True,  "is_esic_applicable": True},
    {"id": "c2", "code": "HRA",    "name": "HRA",            "kind": "earning",   "category": "hra",            "is_taxable": True,  "is_pf_applicable": False, "is_esic_applicable": True},
    {"id": "c3", "code": "SPECIAL","name": "Special",        "kind": "earning",   "category": "special",        "is_taxable": True,  "is_pf_applicable": False, "is_esic_applicable": True},
    {"id": "c4", "code": "PF",     "name": "PF (Employer)",  "kind": "deduction", "category": "employer_pf",    "is_taxable": False, "is_pf_applicable": False, "is_esic_applicable": False},
    {"id": "c5", "code": "EMPF",   "name": "PF (Employee)",  "kind": "deduction", "category": "pf",             "is_taxable": False, "is_pf_applicable": False, "is_esic_applicable": False},
    {"id": "c6", "code": "ESIC",   "name": "ESIC (Employer)","kind": "deduction", "category": "employer_esic",  "is_taxable": False, "is_pf_applicable": False, "is_esic_applicable": False},
    {"id": "c7", "code": "EESIC",  "name": "ESIC (Employee)","kind": "deduction", "category": "esic",           "is_taxable": False, "is_pf_applicable": False, "is_esic_applicable": False},
    {"id": "c8", "code": "PT",     "name": "Professional Tax","kind": "deduction","category": "pt",             "is_taxable": False, "is_pf_applicable": False, "is_esic_applicable": False},
    {"id": "c9", "code": "GRAT",   "name": "Gratuity",       "kind": "deduction", "category": "gratuity",       "is_taxable": False, "is_pf_applicable": False, "is_esic_applicable": False},
]


def structure(basic_pct=40, hra_pct=20, special_pct=40):
    """Standard CTC structure with PF+ESIC+PT+Gratuity statutory lines."""
    return [
        {"component_code": "BASIC",   "calculation_type": "pct_of_ctc",    "value": basic_pct},
        {"component_code": "HRA",     "calculation_type": "pct_of_basic",  "value": 50},       # metro rate
        {"component_code": "SPECIAL", "calculation_type": "pct_of_ctc",    "value": special_pct},
        {"component_code": "PF",      "calculation_type": "statutory",     "value": 0},
        {"component_code": "EMPF",    "calculation_type": "statutory",     "value": 0},
        {"component_code": "ESIC",    "calculation_type": "statutory",     "value": 0},
        {"component_code": "EESIC",   "calculation_type": "statutory",     "value": 0},
        {"component_code": "PT",      "calculation_type": "statutory",     "value": 0},
        {"component_code": "GRAT",    "calculation_type": "statutory",     "value": 0},
    ]


def _lines_by_code(lines):
    return {l["component_code"]: l for l in lines}


# ---------------------------------------------------------------------------
# PF — 12% of Basic capped at ₹15,000
# ---------------------------------------------------------------------------
class TestPF:
    def test_pf_12pct_of_basic_below_ceiling(self):
        """Basic ₹10k → PF = ₹1,200/mo (12% of 10k)."""
        annual = 3_00_000                # ctc
        # 40% basic = ₹10k monthly, below ₹15k PF ceiling
        lines = _compute_lines(annual, COMPONENTS, structure(basic_pct=40), overrides={})
        by = _lines_by_code(lines)
        assert by["BASIC"]["monthly_amount"] == 10_000
        assert by["PF"]["monthly_amount"] == 1_200, "PF should be exactly 12% of 10000"
        assert by["EMPF"]["monthly_amount"] == 1_200

    def test_pf_capped_at_15k_ceiling(self):
        """Basic ₹25k → PF capped at ₹1,800 (12% of ₹15k EPFO ceiling)."""
        # 50% of ₹6L annual = ₹25k monthly basic, above ceiling
        lines = _compute_lines(6_00_000, COMPONENTS, structure(basic_pct=50), overrides={})
        by = _lines_by_code(lines)
        assert by["BASIC"]["monthly_amount"] == 25_000
        assert by["PF"]["monthly_amount"] == 1_800, "PF must cap at 12% of ₹15k ceiling"

    def test_pf_zero_when_basic_zero(self):
        lines = _compute_lines(0, COMPONENTS, structure(basic_pct=0), overrides={})
        by = _lines_by_code(lines)
        assert by["BASIC"]["monthly_amount"] == 0
        assert by["PF"]["monthly_amount"] == 0


# ---------------------------------------------------------------------------
# ESIC — employer 3.25%, employee 0.75% of gross, ONLY if gross ≤ ₹21,000
# ---------------------------------------------------------------------------
class TestESIC:
    def test_esic_applicable_below_21k(self):
        """Gross ≤ ₹21k → ESIC applies."""
        # CTC ₹2L → monthly ₹16,667 · 40% Basic = ₹6,667 · HRA = ₹3,333 · Special = ₹6,667
        # Gross ≈ ₹16,667 which is below ₹21k, so ESIC applies
        lines = _compute_lines(2_00_000, COMPONENTS, structure(), overrides={})
        by = _lines_by_code(lines)
        gross = by["BASIC"]["monthly_amount"] + by["HRA"]["monthly_amount"] + by["SPECIAL"]["monthly_amount"]
        assert gross <= 21_000
        assert by["ESIC"]["monthly_amount"] == round(gross * 0.0075, 2)
        assert by["EESIC"]["monthly_amount"] == round(gross * 0.0325, 2)

    def test_esic_zero_above_21k(self):
        """Gross > ₹21k → ESIC = 0 for both sides."""
        # CTC ₹6L monthly ₹50k way above ceiling
        lines = _compute_lines(6_00_000, COMPONENTS, structure(), overrides={})
        by = _lines_by_code(lines)
        assert by["ESIC"]["monthly_amount"] == 0
        assert by["EESIC"]["monthly_amount"] == 0


# ---------------------------------------------------------------------------
# Professional Tax — flat ₹200/mo in current impl (state slabs are a Phase-2C task)
# ---------------------------------------------------------------------------
class TestPT:
    def test_pt_flat_200(self):
        lines = _compute_lines(5_00_000, COMPONENTS, structure(), overrides={})
        by = _lines_by_code(lines)
        assert by["PT"]["monthly_amount"] == 200


# ---------------------------------------------------------------------------
# Gratuity — 4.81% of Basic  (15 days / 26 working days per year)
# ---------------------------------------------------------------------------
class TestGratuity:
    def test_gratuity_4_81_pct(self):
        lines = _compute_lines(6_00_000, COMPONENTS, structure(basic_pct=50), overrides={})
        by = _lines_by_code(lines)
        # basic = 50% of 50k = 25k → 4.81% = 1,202.5
        assert by["BASIC"]["monthly_amount"] == 25_000
        assert by["GRAT"]["monthly_amount"] == 1_202.5


# ---------------------------------------------------------------------------
# HRA — 50% of basic (metro default)
# ---------------------------------------------------------------------------
class TestHRA:
    def test_hra_50_pct_of_basic(self):
        lines = _compute_lines(6_00_000, COMPONENTS, structure(basic_pct=40), overrides={})
        by = _lines_by_code(lines)
        assert by["BASIC"]["monthly_amount"] == 20_000
        assert by["HRA"]["monthly_amount"] == 10_000, "HRA should be 50% of basic"


# ---------------------------------------------------------------------------
# Overrides — manual entry beats structure calc
# ---------------------------------------------------------------------------
class TestOverrides:
    def test_override_takes_precedence(self):
        # Normal basic would be 40% of 3L / 12 = ₹10k. Override to ₹12,500.
        lines = _compute_lines(3_00_000, COMPONENTS, structure(), overrides={"BASIC": 12_500})
        by = _lines_by_code(lines)
        assert by["BASIC"]["monthly_amount"] == 12_500
        # HRA should now base on overridden basic → 50% = 6,250
        assert by["HRA"]["monthly_amount"] == 6_250


# ---------------------------------------------------------------------------
# Totals — gross, deductions, net
# ---------------------------------------------------------------------------
class TestTotals:
    def test_gross_equals_sum_of_earnings(self):
        lines = _compute_lines(6_00_000, COMPONENTS, structure(), overrides={})
        gross, net = _compute_totals(lines)
        sum_earn = sum(l["monthly_amount"] for l in lines if l["kind"] == "earning")
        assert gross == sum_earn

    def test_net_positive(self):
        lines = _compute_lines(6_00_000, COMPONENTS, structure(), overrides={})
        _, net = _compute_totals(lines)
        assert net > 0, "Net after deductions should be positive"

    def test_net_equals_gross_minus_deductions(self):
        lines = _compute_lines(6_00_000, COMPONENTS, structure(), overrides={})
        gross, net = _compute_totals(lines)
        ded = sum(l["monthly_amount"] for l in lines if l["kind"] == "deduction")
        assert round(gross - ded, 2) == round(net, 2)


# ---------------------------------------------------------------------------
# Loan EMI — _build_schedule
# ---------------------------------------------------------------------------
class TestLoanSchedule:
    def test_zero_interest_schedule_equal_installments(self):
        sched = _build_schedule(principal=60_000, emi=0, tenure=6, start_month="2026-01", interest_pct=0)
        assert len(sched) == 6
        assert all(s["amount"] == 10_000 for s in sched)
        assert sched[0]["due_month"] == "2026-01"
        assert sched[-1]["due_month"] == "2026-06"

    def test_with_interest(self):
        # 10% flat on ₹1,00,000 over 10 months → total 1,10,000 → EMI 11k
        sched = _build_schedule(100_000, 0, 10, "2026-01", 10)
        assert len(sched) == 10
        assert sched[0]["amount"] == 11_000

    def test_year_rollover(self):
        # tenure 14 → Jan → Feb → ... → Dec → Jan(next year) → Feb(next year)
        sched = _build_schedule(14_000, 0, 14, "2026-01", 0)
        assert sched[0]["due_month"] == "2026-01"
        assert sched[11]["due_month"] == "2026-12"
        assert sched[12]["due_month"] == "2027-01"
        assert sched[13]["due_month"] == "2027-02"

    def test_tenure_one_month(self):
        sched = _build_schedule(5_000, 0, 1, "2026-06", 0)
        assert len(sched) == 1
        assert sched[0]["amount"] == 5_000
        assert sched[0]["due_month"] == "2026-06"

    def test_installment_numbering_sequential(self):
        sched = _build_schedule(10_000, 0, 5, "2026-01", 0)
        assert [s["installment_no"] for s in sched] == [1, 2, 3, 4, 5]


# ---------------------------------------------------------------------------
# End-to-end realistic scenarios — validates the whole math together
# ---------------------------------------------------------------------------
class TestRealisticScenarios:
    def test_junior_engineer_5L_ctc(self):
        """Fresher on ₹5L/yr CTC — mid-range India hire."""
        lines = _compute_lines(5_00_000, COMPONENTS, structure(), overrides={})
        by = _lines_by_code(lines)
        assert by["BASIC"]["monthly_amount"] == 16_666.67
        assert by["HRA"]["monthly_amount"] == 8_333.33     # 50% of basic (rounded)
        # Gross roughly 16,667 + 8,333 + 16,667 = 41,667 → above ESIC ceiling → ESIC=0
        assert by["ESIC"]["monthly_amount"] == 0
        # PF: basic > 15k → capped at 1,800
        assert by["PF"]["monthly_amount"] == 1_800
        assert by["EMPF"]["monthly_amount"] == 1_800
        gross, net = _compute_totals(lines)
        assert 35_000 < net < 45_000, f"Net {net} for ₹5L CTC looks wrong"

    def test_low_wage_2L_ctc_esic_applies(self):
        """Low-wage worker at ₹2L/yr CTC — ESIC applies."""
        lines = _compute_lines(2_00_000, COMPONENTS, structure(), overrides={})
        by = _lines_by_code(lines)
        # Gross ≈ ₹16,667 → below ESIC ceiling
        assert by["ESIC"]["monthly_amount"] > 0
        assert by["EESIC"]["monthly_amount"] > 0
        # PF: basic = 6,667 → PF = 12% × 6,667 = ₹800
        assert by["PF"]["monthly_amount"] == 800.0

    def test_senior_25L_ctc(self):
        """Senior engineer at ₹25L/yr CTC."""
        lines = _compute_lines(25_00_000, COMPONENTS, structure(), overrides={})
        by = _lines_by_code(lines)
        # Basic ≈ ₹83,333 well above ceiling → PF capped
        assert by["PF"]["monthly_amount"] == 1_800
        # Gross ≈ ₹2L → no ESIC
        assert by["ESIC"]["monthly_amount"] == 0
        # PT still ₹200
        assert by["PT"]["monthly_amount"] == 200


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
