"""Phase 1F — Letter templates (offer/experience/relieving/NOC) with merge fields + e-sign stub."""
from __future__ import annotations

from typing import Dict, List, Literal, Optional
from pydantic import BaseModel, Field

from models import BaseDoc

LetterCategory = Literal[
    "offer", "appointment", "experience", "relieving", "noc", "address_proof",
    "salary_increment", "warning", "promotion", "travel_authorization", "other",
]
LetterStatus = Literal["draft", "generated", "signed", "cancelled"]


class LetterTemplate(BaseDoc):
    company_id: str
    name: str
    slug: str
    category: LetterCategory = "other"
    body_markdown: str                      # supports {{merge}} fields
    merge_fields: List[str] = Field(default_factory=list)  # e.g. ["employee_name","doj","ctc"]
    is_active: bool = True


class LetterTemplateCreate(BaseModel):
    name: str
    slug: str
    category: LetterCategory = "other"
    body_markdown: str
    merge_fields: List[str] = Field(default_factory=list)


class LetterSignature(BaseModel):
    signer_role: Literal["employee", "hr", "manager", "witness"] = "employee"
    signer_user_id: Optional[str] = None
    signer_name: Optional[str] = None
    signed_at: Optional[str] = None
    method: Literal["click_wrap", "otp", "draw", "docusign"] = "click_wrap"
    ip_address: Optional[str] = None
    signature_image_base64: Optional[str] = None


class GeneratedLetter(BaseDoc):
    company_id: str
    template_id: str
    template_name: str
    category: LetterCategory
    employee_id: Optional[str] = None
    employee_name: Optional[str] = None
    rendered_markdown: str                  # final text with merge values substituted
    merge_values: Dict[str, str] = Field(default_factory=dict)
    status: LetterStatus = "generated"
    signatures: List[LetterSignature] = Field(default_factory=list)
    pdf_base64: Optional[str] = None        # Phase 2B-friendly when ready
    issued_by: Optional[str] = None
    issued_at: Optional[str] = None


class LetterGenerate(BaseModel):
    template_id: str
    employee_id: Optional[str] = None
    merge_values: Dict[str, str] = Field(default_factory=dict)
