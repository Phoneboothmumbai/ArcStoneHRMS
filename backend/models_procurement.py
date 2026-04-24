"""Procurement & Vendor Marketplace models — vendor registry, RFQ sealed-bid,
quote comparison, PO chain with approvals, ratings, and vendor-portal access."""
from __future__ import annotations

from typing import List, Literal, Optional
from pydantic import BaseModel, EmailStr, Field

from models import BaseDoc


# ---------------------------------------------------------------------------
# Vendor registry (deepened from the original requests_routes vendor)
# ---------------------------------------------------------------------------
VendorStatus = Literal["invited", "active", "blacklisted", "suspended"]
VendorKind = Literal["supplier", "service_provider", "contractor", "consultant", "logistics"]


class VendorBank(BaseModel):
    account_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc: Optional[str] = None
    bank_name: Optional[str] = None


class VendorDocument(BaseModel):
    id: str
    kind: Literal["gst", "pan", "msme", "iso", "insurance", "cancelled_cheque", "other"]
    label: Optional[str] = None
    file_name: Optional[str] = None
    file_base64: Optional[str] = None
    uploaded_at: str


class Vendor(BaseDoc):
    company_id: str
    name: str
    code: str                                       # auto V-####
    kind: VendorKind = "supplier"
    category: Optional[str] = None                  # "stationery", "IT hardware" etc
    contact_name: Optional[str] = None
    contact_email: EmailStr
    phone: Optional[str] = None
    country_id: Optional[str] = None
    address: Optional[str] = None
    gstin: Optional[str] = None
    pan: Optional[str] = None
    msme_number: Optional[str] = None
    bank: Optional[VendorBank] = None
    documents: List[VendorDocument] = Field(default_factory=list)
    status: VendorStatus = "active"
    rating: float = 0.0                             # 0-5 avg from rating entries
    ratings_count: int = 0
    tags: List[str] = Field(default_factory=list)
    portal_token: Optional[str] = None              # long-lived token for vendor-portal access
    notes: Optional[str] = None


class VendorCreate(BaseModel):
    name: str
    kind: VendorKind = "supplier"
    category: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: EmailStr
    phone: Optional[str] = None
    country_id: Optional[str] = None
    address: Optional[str] = None
    gstin: Optional[str] = None
    pan: Optional[str] = None
    msme_number: Optional[str] = None
    bank: Optional[VendorBank] = None
    tags: List[str] = Field(default_factory=list)
    notes: Optional[str] = None


class VendorRating(BaseDoc):
    company_id: str
    vendor_id: str
    po_id: Optional[str] = None
    rating: int                                     # 1-5
    comment: Optional[str] = None
    rated_by_user_id: str
    rated_by_name: str


class VendorRatingCreate(BaseModel):
    vendor_id: str
    rating: int = Field(ge=1, le=5)
    po_id: Optional[str] = None
    comment: Optional[str] = None


# ---------------------------------------------------------------------------
# RFQ — Request For Quotation (sealed-bid with deadline)
# ---------------------------------------------------------------------------
RFQStatus = Literal["draft", "open", "closed", "awarded", "cancelled"]


class RFQItem(BaseModel):
    id: str
    description: str
    sku: Optional[str] = None
    quantity: float
    unit: str = "piece"
    target_unit_price: Optional[float] = None       # visible internally, hidden from vendors
    specs: Optional[str] = None


class RFQInvite(BaseModel):
    vendor_id: str
    vendor_name: str
    invited_at: str
    viewed_at: Optional[str] = None
    quote_id: Optional[str] = None                  # set when vendor submits


class RFQ(BaseDoc):
    company_id: str
    code: str                                       # auto RFQ-YYYY-####
    title: str
    category: Optional[str] = None
    description: Optional[str] = None
    deadline: str                                   # ISO datetime — quotes locked after this
    delivery_required_by: Optional[str] = None
    delivery_location: Optional[str] = None
    terms_markdown: Optional[str] = None
    currency: str = "INR"
    status: RFQStatus = "draft"
    items: List[RFQItem] = Field(default_factory=list)
    invited_vendors: List[RFQInvite] = Field(default_factory=list)
    created_by_user_id: str
    created_by_name: str
    awarded_vendor_id: Optional[str] = None
    awarded_quote_id: Optional[str] = None
    awarded_at: Optional[str] = None
    po_id: Optional[str] = None


class RFQCreate(BaseModel):
    title: str
    category: Optional[str] = None
    description: Optional[str] = None
    deadline: str
    delivery_required_by: Optional[str] = None
    delivery_location: Optional[str] = None
    terms_markdown: Optional[str] = None
    currency: str = "INR"
    items: List[RFQItem] = Field(default_factory=list)


class RFQInviteVendors(BaseModel):
    vendor_ids: List[str]


class RFQAward(BaseModel):
    quote_id: str
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Quote — Vendor response to RFQ (SEALED until RFQ deadline passes)
# ---------------------------------------------------------------------------
QuoteStatus = Literal["submitted", "withdrawn", "revised", "rejected", "shortlisted", "awarded", "lost"]


class QuoteLine(BaseModel):
    rfq_item_id: str
    unit_price: float
    quantity_offered: float
    notes: Optional[str] = None


class Quote(BaseDoc):
    company_id: str
    rfq_id: str
    rfq_code: str
    vendor_id: str
    vendor_name: str
    total_amount: float
    currency: str = "INR"
    delivery_days: Optional[int] = None             # from PO date
    validity_days: int = 30                         # days the quote stays valid
    payment_terms: Optional[str] = None             # "30 days credit" etc
    lines: List[QuoteLine] = Field(default_factory=list)
    attachments: List[dict] = Field(default_factory=list)
    notes: Optional[str] = None
    status: QuoteStatus = "submitted"
    sealed: bool = True                             # flips to False after RFQ deadline
    submitted_at: Optional[str] = None


class QuoteCreate(BaseModel):
    rfq_id: str
    total_amount: float
    currency: str = "INR"
    delivery_days: Optional[int] = None
    validity_days: int = 30
    payment_terms: Optional[str] = None
    lines: List[QuoteLine] = Field(default_factory=list)
    attachments: List[dict] = Field(default_factory=list)
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Purchase Order
# ---------------------------------------------------------------------------
POStatus = Literal[
    "draft", "awaiting_approval", "approved", "rejected", "sent", "acknowledged",
    "in_transit", "partially_received", "received", "invoiced", "paid", "cancelled", "closed",
]


class POLine(BaseModel):
    id: str
    description: str
    sku: Optional[str] = None
    quantity: float
    unit: str = "piece"
    unit_price: float
    tax_pct: float = 0.0
    amount: float = 0.0                              # qty * unit_price (pre-tax)
    tax_amount: float = 0.0
    total: float = 0.0
    received_qty: float = 0.0


class POReceiptLine(BaseModel):
    po_line_id: str
    quantity: float
    notes: Optional[str] = None


class POReceipt(BaseModel):
    id: str
    received_at: str
    received_by_user_id: str
    received_by_name: str
    lines: List[POReceiptLine]
    notes: Optional[str] = None
    attachments: List[dict] = Field(default_factory=list)


class PurchaseOrder(BaseDoc):
    company_id: str
    code: str                                        # auto PO-YYYY-####
    title: str
    vendor_id: str
    vendor_name: str
    rfq_id: Optional[str] = None
    quote_id: Optional[str] = None
    status: POStatus = "draft"
    currency: str = "INR"
    lines: List[POLine] = Field(default_factory=list)
    subtotal: float = 0.0
    tax_total: float = 0.0
    grand_total: float = 0.0
    delivery_location: Optional[str] = None
    expected_delivery_date: Optional[str] = None
    payment_terms: Optional[str] = None
    terms_markdown: Optional[str] = None
    approval_request_id: Optional[str] = None       # FK into approval_requests
    created_by_user_id: str
    created_by_name: str
    acknowledged_at: Optional[str] = None           # vendor acks via portal
    sent_at: Optional[str] = None
    received_at: Optional[str] = None
    invoiced_at: Optional[str] = None
    paid_at: Optional[str] = None
    receipts: List[POReceipt] = Field(default_factory=list)
    invoice_base64: Optional[str] = None
    invoice_number: Optional[str] = None
    invoice_amount: Optional[float] = None


class POCreate(BaseModel):
    title: str
    vendor_id: str
    rfq_id: Optional[str] = None
    quote_id: Optional[str] = None
    currency: str = "INR"
    lines: List[POLine] = Field(default_factory=list)
    delivery_location: Optional[str] = None
    expected_delivery_date: Optional[str] = None
    payment_terms: Optional[str] = None
    terms_markdown: Optional[str] = None


class POReceiptCreate(BaseModel):
    lines: List[POReceiptLine]
    notes: Optional[str] = None
    attachments: List[dict] = Field(default_factory=list)


class POInvoice(BaseModel):
    invoice_number: str
    invoice_amount: float
    invoice_base64: Optional[str] = None
