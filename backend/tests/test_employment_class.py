"""Tests for employment_class policy matrix."""
import pytest
from employment_class_policy import (
    FEATURE_KEYS, CLASS_KEYS, DEFAULTS, default_matrix, _normalize,
)


def test_defaults_cover_all_classes_and_features():
    matrix = default_matrix()
    assert set(matrix.keys()) == set(CLASS_KEYS)
    for cls in CLASS_KEYS:
        assert set(matrix[cls].keys()) == set(FEATURE_KEYS), f"{cls} missing keys"


def test_on_roll_has_everything_enabled():
    for k in FEATURE_KEYS:
        assert DEFAULTS["on_roll"][k] is True, f"on_roll should have {k} enabled"


def test_off_roll_consultant_has_no_payroll():
    d = DEFAULTS["off_roll_consultant"]
    assert d["payroll"] is False
    assert d["pf_esic"] is False
    assert d["loans"] is False
    assert d["insurance"] is False
    assert d["leave"] is False
    # But timesheet + expenses allowed per user spec
    assert d["timesheet"] is True
    assert d["expenses"] is True
    assert d["attendance"] is True


def test_off_roll_contractor_minimal_set():
    d = DEFAULTS["off_roll_contractor"]
    assert d["payroll"] is False
    assert d["expenses"] is False
    assert d["attendance"] is True
    assert d["helpdesk"] is True


def test_intern_lightweight():
    d = DEFAULTS["intern"]
    # Interns get stipend → payroll ON, but no PF/ESIC/loans/insurance
    assert d["payroll"] is True
    assert d["pf_esic"] is False
    assert d["loans"] is False
    assert d["leave"] is True


def test_normalize_fills_missing_keys_with_defaults():
    partial = {"on_roll": {"payroll": False}}  # override one key, rest missing
    out = _normalize(partial)
    # Other keys revert to defaults
    assert out["on_roll"]["payroll"] is False
    assert out["on_roll"]["leave"] is True  # default remains True
    # Missing classes fully fall back to defaults
    assert out["intern"] == DEFAULTS["intern"]


def test_normalize_ignores_unknown_classes():
    bad = {"alien_class": {"payroll": False}, "on_roll": {"payroll": True}}
    out = _normalize(bad)
    assert "alien_class" not in out
    assert out["on_roll"]["payroll"] is True
