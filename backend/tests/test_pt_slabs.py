"""State-wise Professional Tax slab tests (India FY 2025-26).

Validates the compute_pt helper against published state commercial-tax slabs.
When a state changes its slab in the budget, update pt_slabs.py AND add a
test here for the new bracket — this is the only way to catch regression.
"""
import pytest
from pt_slabs import compute_pt, NO_PT_STATES


class TestMaharashtra:
    def test_below_7500_is_zero(self):
        assert compute_pt(7_000, "IN-MH") == 0

    def test_7500_to_10000_is_175(self):
        assert compute_pt(7_500, "IN-MH") == 0          # boundary belongs to lower bracket
        assert compute_pt(9_000, "IN-MH") == 175
        assert compute_pt(10_000, "IN-MH") == 175

    def test_above_10000_is_200(self):
        assert compute_pt(10_001, "IN-MH") == 200
        assert compute_pt(1_00_000, "IN-MH") == 200

    def test_feb_surcharge_300(self):
        assert compute_pt(50_000, "IN-MH", month_number=2) == 300
        # Feb is only 300 for top bracket, 175 bracket stays 175
        assert compute_pt(9_000, "IN-MH", month_number=2) == 175

    def test_other_months_no_surcharge(self):
        for m in [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]:
            assert compute_pt(50_000, "IN-MH", month_number=m) == 200


class TestKarnataka:
    def test_below_25000_zero(self):
        assert compute_pt(20_000, "IN-KA") == 0
        assert compute_pt(25_000, "IN-KA") == 0

    def test_above_25000_is_200(self):
        assert compute_pt(25_001, "IN-KA") == 200
        assert compute_pt(80_000, "IN-KA") == 200


class TestGujarat:
    def test_below_12000_zero(self):
        assert compute_pt(11_000, "IN-GJ") == 0
        assert compute_pt(12_000, "IN-GJ") == 0

    def test_above_12000_is_200(self):
        assert compute_pt(15_000, "IN-GJ") == 200


class TestTelanganaAP:
    def test_below_15k_zero(self):
        assert compute_pt(14_000, "IN-TG") == 0
        assert compute_pt(14_000, "IN-AP") == 0

    def test_15k_to_20k_is_150(self):
        assert compute_pt(18_000, "IN-TG") == 150
        assert compute_pt(20_000, "IN-AP") == 150

    def test_above_20k_is_200(self):
        assert compute_pt(25_000, "IN-TG") == 200
        assert compute_pt(50_000, "IN-AP") == 200


class TestWestBengal:
    def test_wb_brackets(self):
        assert compute_pt(9_000, "IN-WB") == 0
        assert compute_pt(12_000, "IN-WB") == 110
        assert compute_pt(20_000, "IN-WB") == 130
        assert compute_pt(35_000, "IN-WB") == 150
        assert compute_pt(50_000, "IN-WB") == 200


class TestNoPTStates:
    def test_delhi_no_pt(self):
        assert compute_pt(1_00_000, "IN-DL") == 0

    def test_haryana_no_pt(self):
        assert compute_pt(50_000, "IN-HR") == 0

    def test_up_no_pt(self):
        assert compute_pt(80_000, "IN-UP") == 0

    def test_all_no_pt_states_return_zero(self):
        for code in NO_PT_STATES:
            assert compute_pt(50_000, code) == 0, f"State {code} should not levy PT"


class TestFallback:
    def test_unknown_state_defaults_to_200(self):
        """Legacy behaviour: if we don't know the state, charge ₹200 to preserve
        old customer payrolls."""
        assert compute_pt(30_000, "IN-XX") == 200
        assert compute_pt(30_000, None) == 200
        assert compute_pt(30_000, "") == 200

    def test_zero_gross_always_zero(self):
        for code in ["IN-MH", "IN-KA", "IN-WB", "IN-DL", "IN-XX", None]:
            assert compute_pt(0, code) == 0

    def test_negative_gross_safety(self):
        assert compute_pt(-100, "IN-MH") == 0


class TestCaseInsensitive:
    def test_lowercase_state_code(self):
        # 9k in MH → 175 bracket
        assert compute_pt(9_000, "in-mh") == 175

    def test_mixed_case(self):
        assert compute_pt(30_000, "In-Ka") == 200


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
