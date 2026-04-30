"""Phase 4 — Joining Kit Issuance Log.

When a new employee joins, HR/Branch Ops issue a joining kit (laptop bag, ID card,
diary, swag, training docs, etc). We track:
  • What was committed → what was actually handed over → what was returned on exit
  • E-signature on receipt
  • Default kit templates per branch / role / employment_class
  • Procurement linkage — items can be sourced via Procurement RFQ

Also exposes a curated taxonomy of Procurement Categories so the UI can render a
dropdown without hand-typing them everywhere.
"""
from __future__ import annotations
from typing import List, Literal, Optional
from pydantic import BaseModel, Field

from models import BaseDoc


# ---------- Procurement Category Taxonomy ----------
# (Surfaced via /api/procurement/category-catalog)
PROCUREMENT_CATEGORIES = [
    {
        "key": "stationery_general", "label": "Stationery — General",
        "items": ["A4 paper", "Notebooks", "Pens", "Pencils", "Highlighters", "Sticky notes",
                  "Files & folders", "Stapler", "Punching machine", "Scissors", "Glue"],
    },
    {
        "key": "stationery_printing", "label": "Stationery — Printing & Branded",
        "items": ["Letterhead", "Business cards", "Branded notepad", "Branded folder",
                  "Branded pen", "Branded mug", "Branded notebook", "ID card lanyard"],
    },
    {
        "key": "joining_kit", "label": "Joining Kit",
        "items": ["Laptop bag", "ID card", "Welcome diary", "T-shirt / hoodie",
                  "Notebook", "Branded pen", "Bottle", "Coffee mug", "Phone holder"],
    },
    {
        "key": "repair_maintenance", "label": "Repair & Maintenance",
        "items": ["AC service", "Light bulb / tube", "Fan repair", "Door / lock",
                  "Plumbing", "Electrical wiring", "Furniture repair", "Pest control"],
    },
    {
        "key": "branding_promotion", "label": "Branding & Promotion",
        "items": ["Office signage", "Roll-up banner", "Pull-up standee", "Flex board",
                  "Vinyl wall graphic", "Brochures", "Flyers", "Trade show kit"],
    },
    {
        "key": "gifting", "label": "Gifting & Misc",
        "items": ["Festival hamper", "Birthday gift", "Anniversary gift",
                  "Client gift", "Farewell gift", "Wedding gift"],
    },
    {
        "key": "office_supplies", "label": "Office Supplies",
        "items": ["Tea / Coffee", "Sugar", "Water cans", "Paper cups",
                  "Tissue paper", "Hand wash", "Sanitizer", "Cleaning supplies"],
    },
    {
        "key": "it_hardware", "label": "IT Hardware",
        "items": ["Laptop", "Monitor", "Keyboard", "Mouse", "Headset",
                  "Webcam", "Docking station", "USB drive", "External hard drive"],
    },
]

CATEGORY_KEYS = [c["key"] for c in PROCUREMENT_CATEGORIES]


# ---------- Joining Kit ----------
KitItemStatus = Literal["pending", "issued", "returned", "lost", "consumed"]
KitStatus = Literal["draft", "issued", "partial", "completed", "returned"]


class KitTemplateItem(BaseModel):
    """Default item in a kit template — defines what gets issued by default."""
    sku: str                                          # short code, e.g. "BAG-001"
    name: str                                         # "Branded laptop bag"
    quantity: int = 1
    is_returnable: bool = False                       # bag/diary/swag = no, ID card = yes
    is_required: bool = True
    notes: Optional[str] = None


class KitTemplate(BaseDoc):
    """Pre-defined joining kit, e.g. 'Engineering Onboarding Kit'."""
    company_id: str
    name: str
    description: Optional[str] = None
    department_id: Optional[str] = None               # null = applies to all
    branch_id: Optional[str] = None                   # null = all
    employment_class: Optional[str] = None            # null = all
    items: List[KitTemplateItem] = Field(default_factory=list)
    is_default: bool = False
    active: bool = True
    created_by: str
    created_by_name: str


class KitTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    department_id: Optional[str] = None
    branch_id: Optional[str] = None
    employment_class: Optional[str] = None
    items: List[KitTemplateItem] = Field(default_factory=list)
    is_default: bool = False


class KitIssuanceItem(BaseModel):
    sku: str
    name: str
    quantity: int = 1
    is_returnable: bool = False
    issued: bool = False
    issued_at: Optional[str] = None
    returned: bool = False
    returned_at: Optional[str] = None
    status: KitItemStatus = "pending"
    serial_number: Optional[str] = None               # asset tag if applicable
    notes: Optional[str] = None


class KitIssuance(BaseDoc):
    """Per-employee record of what was issued."""
    company_id: str
    employee_id: str
    employee_name: str
    employee_code: Optional[str] = None
    branch_id: Optional[str] = None
    template_id: Optional[str] = None                 # nullable; can be ad-hoc
    template_name: Optional[str] = None
    items: List[KitIssuanceItem] = Field(default_factory=list)
    status: KitStatus = "draft"
    issued_at: Optional[str] = None
    issued_by: Optional[str] = None
    issued_by_name: Optional[str] = None
    employee_signature_at: Optional[str] = None       # ISO timestamp of e-signature
    notes: Optional[str] = None


class KitIssuanceCreate(BaseModel):
    employee_id: str
    template_id: Optional[str] = None
    items: List[KitIssuanceItem] = Field(default_factory=list)
    notes: Optional[str] = None
