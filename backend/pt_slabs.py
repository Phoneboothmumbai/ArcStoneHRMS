"""State-wise Professional Tax slabs (India, FY 2025-26).

Called from payroll_routes._compute_lines. Falls back to a flat ₹200/month if
the state is unknown — this preserves the old behaviour for clients that
haven't configured branch state codes yet.

Employee.state_code resolution priority:
  1. Employee profile `pt_state`  (HR-overridable)
  2. Branch `state_code`          (default — ISO 3166-2, e.g. IN-MH)
  3. Company primary state
  4. Fallback: flat ₹200

Source: state commercial-tax department circulars Apr-2025.
Note: February in Maharashtra has ₹300 (extra month collection); all others stay monthly.
This file is the single place to keep slab updates — update once, payroll picks it up.
"""
from __future__ import annotations
from typing import Optional

# Monthly gross salary brackets → monthly PT liability (INR).
# Brackets are (upper_inclusive, pt_amount). A bracket of (None, x) means
# "any gross higher than the previous upper bound pays x".
SLABS: dict[str, list[tuple[Optional[float], float]]] = {
    # Maharashtra — male/female same (used to differ, unified post-2023).
    # Feb surcharge is handled in compute_pt() below.
    "IN-MH": [(7_500, 0), (10_000, 175), (None, 200)],

    # Karnataka — Apr 2023 circular raised exemption to ₹25,000; employees
    # with gross < 25k pay nothing, everyone above pays ₹200/mo.
    "IN-KA": [(25_000, 0), (None, 200)],

    # Tamil Nadu — six-monthly collection, but we pro-rate to monthly for
    # consistency with other states. Rounded to nearest rupee.
    "IN-TN": [(21_000, 0), (30_000, 135), (45_000, 315),
              (60_000, 690), (75_000, 1_025), (None, 1_250)],

    # West Bengal
    "IN-WB": [(10_000, 0), (15_000, 110), (25_000, 130),
              (40_000, 150), (None, 200)],

    # Telangana & Andhra Pradesh — identical post-bifurcation
    "IN-TG": [(15_000, 0), (20_000, 150), (None, 200)],
    "IN-AP": [(15_000, 0), (20_000, 150), (None, 200)],

    # Gujarat (flat at ₹200 above ₹12k)
    "IN-GJ": [(12_000, 0), (None, 200)],

    # Kerala — six-monthly; pro-rated to monthly.
    "IN-KL": [(11_999, 0), (17_999, 120), (29_999, 180),
              (39_999, 300), (None, 416)],

    # Odisha
    "IN-OD": [(13_304, 0), (25_000, 125), (None, 200)],

    # Madhya Pradesh
    "IN-MP": [(18_750, 0), (25_000, 125), (33_333, 166), (None, 208)],

    # Punjab (flat at ₹200 above ₹25k — introduced 2018)
    "IN-PB": [(25_000, 0), (None, 200)],

    # Assam (Apr 2023 slab)
    "IN-AS": [(10_000, 0), (15_000, 150), (24_999, 180), (None, 208)],
}

# States with NO professional tax (zero everywhere):
NO_PT_STATES = {
    "IN-DL",  # Delhi
    "IN-HR",  # Haryana
    "IN-UP",  # Uttar Pradesh
    "IN-RJ",  # Rajasthan
    "IN-UT",  # Uttarakhand
    "IN-GA",  # Goa
    "IN-CH",  # Chandigarh
    "IN-CT",  # Chhattisgarh
    "IN-JK",  # J&K
    "IN-HP",  # Himachal Pradesh
    "IN-AR",  # Arunachal
    "IN-NL",  # Nagaland
    "IN-MN",  # Manipur
    "IN-ML",  # Meghalaya
    "IN-MZ",  # Mizoram
    "IN-TR",  # Tripura
    "IN-SK",  # Sikkim
    "IN-LA",  # Ladakh
}


def compute_pt(gross_monthly: float, state_code: Optional[str] = None,
               month_number: Optional[int] = None) -> float:
    """Compute monthly PT for a single employee.

    Args:
        gross_monthly: Monthly gross (earnings only, not including employer contribs).
        state_code:   ISO 3166-2 state code e.g. "IN-MH". Lookup is case-insensitive.
        month_number: 1-12. Only affects Maharashtra Feb surcharge.

    Returns:
        Monthly PT amount in INR (rounded to 2 decimals).
    """
    if gross_monthly <= 0:
        return 0.0

    code = (state_code or "").upper()

    # States that levy no PT
    if code in NO_PT_STATES:
        return 0.0

    # Unknown / missing → safe default (flat ₹200, matches legacy behaviour).
    slabs = SLABS.get(code)
    if not slabs:
        return 200.0

    pt = 0.0
    for upper, amount in slabs:
        if upper is None or gross_monthly <= upper:
            pt = amount
            break

    # Maharashtra: Feb collects an extra ₹100 on top-bracket employees (₹300 total).
    if code == "IN-MH" and month_number == 2 and pt == 200:
        pt = 300

    return round(float(pt), 2)
