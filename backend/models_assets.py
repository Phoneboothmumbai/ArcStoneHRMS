"""Phase 1G — Asset management (laptops, phones, access cards, etc.)."""
from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field

from models import BaseDoc

AssetCategory = Literal[
    "laptop", "desktop", "monitor", "keyboard_mouse", "mobile", "tablet",
    "headphone", "access_card", "vehicle", "furniture", "software_license",
    "sim_card", "camera", "other",
]
AssetStatus = Literal["available", "assigned", "maintenance", "retired", "lost"]


class Asset(BaseDoc):
    company_id: str
    asset_tag: str                         # unique across company: "ACME-LT-0123"
    category: AssetCategory = "laptop"
    make: Optional[str] = None             # "Apple"
    model: Optional[str] = None            # "MacBook Pro 14 M3"
    serial_number: Optional[str] = None
    purchase_date: Optional[str] = None
    purchase_cost: float = 0.0
    vendor: Optional[str] = None
    warranty_until: Optional[str] = None
    depreciation_method: Literal["slm", "wdv", "none"] = "slm"
    useful_life_years: int = 4
    current_book_value: Optional[float] = None
    status: AssetStatus = "available"
    # Assignment
    assigned_to_employee_id: Optional[str] = None
    assigned_to_employee_name: Optional[str] = None
    assigned_on: Optional[str] = None
    location: Optional[str] = None         # branch or "WFH-Mumbai"
    notes: Optional[str] = None


class AssetCreate(BaseModel):
    asset_tag: str
    category: AssetCategory = "laptop"
    make: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    purchase_date: Optional[str] = None
    purchase_cost: float = 0.0
    vendor: Optional[str] = None
    warranty_until: Optional[str] = None
    depreciation_method: Literal["slm", "wdv", "none"] = "slm"
    useful_life_years: int = 4
    location: Optional[str] = None
    notes: Optional[str] = None


class AssetAssignment(BaseDoc):
    company_id: str
    asset_id: str
    asset_tag: str
    employee_id: str
    employee_name: str
    assigned_on: str
    assigned_by_user_id: str
    acknowledged_at: Optional[str] = None
    returned_on: Optional[str] = None
    return_condition: Optional[Literal["excellent", "good", "fair", "damaged", "lost"]] = None
    return_notes: Optional[str] = None
    is_current: bool = True


class AssetAssignRequest(BaseModel):
    asset_id: str
    employee_id: str
    assigned_on: Optional[str] = None
    notes: Optional[str] = None


class AssetReturnRequest(BaseModel):
    condition: Literal["excellent", "good", "fair", "damaged", "lost"] = "good"
    return_date: Optional[str] = None
    notes: Optional[str] = None
