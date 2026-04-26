"""Phase 2B-PDF — payslip + letter PDF generation using reportlab."""
from __future__ import annotations

import base64
import io
from typing import Optional

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as rcanvas
from reportlab.platypus import (
    Image as PlatypusImage,
    Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle, PageBreak,
)


# Logo cache by base64 hash (avoid re-decoding on every page render)
_LOGO_CACHE: dict = {}


def _logo_flowable(logo_base64: Optional[str], max_w_mm: float = 30, max_h_mm: float = 18):
    """Return a ReportLab `Image` flowable for the company logo, or None.

    Auto-fits to `max_w_mm` × `max_h_mm` bounding box while preserving aspect ratio.
    Tolerant: returns None on any decode/IO error so PDFs never fail because of a
    bad logo.
    """
    if not logo_base64:
        return None
    cache_key = (id(logo_base64), max_w_mm, max_h_mm) if len(logo_base64) > 1024 else (logo_base64[:128], max_w_mm, max_h_mm)
    cached = _LOGO_CACHE.get(cache_key)
    if cached is not None:
        return cached
    try:
        # Strip "data:image/png;base64," prefix if present
        b64 = logo_base64.split(",", 1)[1] if logo_base64.startswith("data:") else logo_base64
        raw = base64.b64decode(b64)
        ir = ImageReader(io.BytesIO(raw))
        iw, ih = ir.getSize()
        max_w = max_w_mm * mm
        max_h = max_h_mm * mm
        scale = min(max_w / iw, max_h / ih, 1.0)
        img = PlatypusImage(io.BytesIO(raw), width=iw * scale, height=ih * scale)
        img.hAlign = "RIGHT"
        _LOGO_CACHE[cache_key] = img
        return img
    except Exception:
        return None


def _branded_header(company_title: str, subtitle_paragraphs: list, logo_base64: Optional[str],
                    title_style, sub_style, max_w_mm: float = 30, max_h_mm: float = 18):
    """Return a flowable that places logo (right) next to title+subtitle (left).

    Falls back to plain Paragraphs (no table) when no logo is supplied.
    """
    title_p = Paragraph(company_title, title_style)
    subs = [Paragraph(s, sub_style) for s in subtitle_paragraphs if s]
    left_cell = [title_p] + subs
    logo = _logo_flowable(logo_base64, max_w_mm=max_w_mm, max_h_mm=max_h_mm)
    if not logo:
        return left_cell  # caller will extend(...) into flow
    # Two-column header with logo on the right
    table = Table([[left_cell, logo]], colWidths=[None, (max_w_mm + 2) * mm])
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return [table]


def _inr(n: float) -> str:
    try:
        return "Rs. " + f"{float(n or 0):,.2f}"
    except Exception:
        return str(n)


def render_payslip_pdf(slip: dict, run: dict, company_name: str = "Company", legal_entity: Optional[str] = None,
                      logo_base64: Optional[str] = None) -> bytes:
    """Return a styled PDF payslip (single page) as bytes."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=16*mm, rightMargin=16*mm, topMargin=14*mm, bottomMargin=14*mm,
        title=f"Payslip {slip.get('period_month','')} - {slip.get('employee_name','')}",
    )
    st = getSampleStyleSheet()
    body = ParagraphStyle("body", parent=st["Normal"], fontSize=9, leading=11)
    tiny = ParagraphStyle("tiny", parent=st["Normal"], fontSize=7.5, leading=9, textColor=colors.HexColor("#666"))
    h = ParagraphStyle("h", parent=st["Heading1"], fontSize=14, leading=16, spaceAfter=2)
    sub = ParagraphStyle("sub", parent=st["Normal"], fontSize=8, leading=10, textColor=colors.HexColor("#555"))
    label_style = ParagraphStyle("lbl", parent=st["Normal"], fontSize=7.5, leading=10, textColor=colors.HexColor("#888"))
    val_style = ParagraphStyle("val", parent=st["Normal"], fontSize=9, leading=11)
    flow = []

    # Header block — company title + period + (optional) logo on the right
    flow.extend(_branded_header(
        legal_entity or company_name,
        [f"Payslip for {run.get('period_label', slip.get('period_month',''))}"],
        logo_base64, title_style=h, sub_style=sub,
    ))
    flow.append(Spacer(1, 6*mm))

    # Employee info grid
    info = [
        [Paragraph("Employee", label_style), Paragraph(slip.get("employee_name", ""), val_style),
         Paragraph("Employee code", label_style), Paragraph(slip.get("employee_code", ""), val_style)],
        [Paragraph("Period", label_style), Paragraph(slip.get("period_month", ""), val_style),
         Paragraph("Tax regime", label_style), Paragraph((slip.get("tax_regime") or "new").upper(), val_style)],
        [Paragraph("Working days", label_style), Paragraph(str(slip.get("working_days", 0)), val_style),
         Paragraph("Paid days", label_style), Paragraph(str(slip.get("paid_days", 0)), val_style)],
        [Paragraph("LOP days", label_style), Paragraph(str(slip.get("lop_days", 0)), val_style),
         Paragraph("Prorata factor", label_style), Paragraph(f"{slip.get('prorata_factor',1):.4f}", val_style)],
    ]
    t = Table(info, colWidths=[30*mm, 60*mm, 30*mm, 55*mm])
    t.setStyle(TableStyle([
        ("BOX", (0,0), (-1,-1), 0.4, colors.HexColor("#e5e7eb")),
        ("INNERGRID", (0,0), (-1,-1), 0.2, colors.HexColor("#eee")),
        ("BACKGROUND", (0,0), (-1,-1), colors.HexColor("#fafafa")),
        ("LEFTPADDING", (0,0), (-1,-1), 5),
        ("RIGHTPADDING", (0,0), (-1,-1), 5),
        ("TOPPADDING", (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
    ]))
    flow.append(t)
    flow.append(Spacer(1, 6*mm))

    # Split lines
    earnings = [l for l in slip.get("lines", []) if l.get("kind") == "earning"]
    deductions = [l for l in slip.get("lines", []) if l.get("kind") == "deduction"]
    employer = [l for l in slip.get("lines", []) if l.get("kind") == "employer_cost"]

    def _section(title: str, rows: list, total_label: str, total_val: float, color_hex: str):
        data = [[Paragraph(f"<b>{title}</b>", body), ""]]
        for ln in rows:
            data.append([Paragraph(f"{ln['component_name']} <font color='#999'>({ln['component_code']})</font>", body),
                         Paragraph(_inr(ln["amount"]), body)])
        data.append([Paragraph(f"<b>{total_label}</b>", body),
                     Paragraph(f"<b>{_inr(total_val)}</b>", body)])
        tb = Table(data, colWidths=[120*mm, 55*mm])
        tb.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), colors.HexColor(color_hex)),
            ("TEXTCOLOR", (0,0), (-1,0), colors.white),
            ("LINEABOVE", (0,-1), (-1,-1), 0.4, colors.HexColor("#ccc")),
            ("BACKGROUND", (0,-1), (-1,-1), colors.HexColor("#f4f4f5")),
            ("ALIGN", (1,0), (1,-1), "RIGHT"),
            ("LEFTPADDING", (0,0), (-1,-1), 5),
            ("RIGHTPADDING", (0,0), (-1,-1), 5),
            ("TOPPADDING", (0,0), (-1,-1), 4),
            ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ]))
        flow.append(tb)
        flow.append(Spacer(1, 3*mm))

    _section("Earnings", earnings, "Total earnings", slip.get("total_earnings", 0), "#065f46")
    _section("Deductions", deductions, "Total deductions", slip.get("total_deductions", 0), "#991b1b")
    if employer:
        _section("Employer contributions (not in take-home)", employer,
                 "Total employer cost", slip.get("employer_contribution", 0), "#374151")

    # Net summary
    net = slip.get("actual_net", 0)
    net_data = [
        [Paragraph("<b>NET PAY</b>", ParagraphStyle("net", parent=body, fontSize=12, leading=14, textColor=colors.white)),
         Paragraph(f"<b>{_inr(net)}</b>", ParagraphStyle("netv", parent=body, fontSize=12, leading=14, textColor=colors.white))],
    ]
    net_tb = Table(net_data, colWidths=[120*mm, 55*mm])
    net_tb.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), colors.HexColor("#09090b")),
        ("ALIGN", (1,0), (1,0), "RIGHT"),
        ("LEFTPADDING", (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ]))
    flow.append(net_tb)

    flow.append(Spacer(1, 8*mm))
    flow.append(Paragraph(
        "This is a system-generated payslip and does not require a signature. "
        "Please contact HR for any clarifications.", tiny))

    doc.build(flow)
    buf.seek(0)
    return buf.read()


def render_letter_pdf(letter: dict, company_name: str = "Company",
                     legal_entity: Optional[str] = None,
                     logo_base64: Optional[str] = None) -> bytes:
    """Render a generated letter (markdown body) as a styled PDF."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=22*mm, rightMargin=22*mm, topMargin=22*mm, bottomMargin=22*mm,
        title=letter.get("template_name", "Letter"),
    )
    st = getSampleStyleSheet()
    head = ParagraphStyle("h", parent=st["Heading1"], fontSize=14, leading=17)
    body = ParagraphStyle("b", parent=st["Normal"], fontSize=10.5, leading=15, spaceAfter=4)
    h2 = ParagraphStyle("h2", parent=st["Heading2"], fontSize=12, leading=15, spaceAfter=4)
    tiny = ParagraphStyle("t", parent=st["Normal"], fontSize=8, leading=10, textColor=colors.HexColor("#888"))

    flow = []
    flow.extend(_branded_header(
        legal_entity or company_name,
        [letter.get("template_name", "")],
        logo_base64, title_style=head, sub_style=tiny,
    ))
    flow.append(Spacer(1, 8*mm))

    # Very lightweight markdown-ish: convert lines starting with "#" and "-"; paragraphs separated by blank lines.
    md = letter.get("rendered_markdown", "")
    for raw in md.split("\n\n"):
        block = raw.strip()
        if not block:
            continue
        if block.startswith("# "):
            flow.append(Paragraph(block[2:], head))
        elif block.startswith("## "):
            flow.append(Paragraph(block[3:], h2))
        else:
            # Replace single newlines with <br/> to preserve line breaks within paragraph
            safe = block.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")
            flow.append(Paragraph(safe, body))
        flow.append(Spacer(1, 3*mm))

    # Signatures block
    sigs = letter.get("signatures") or []
    if sigs:
        flow.append(Spacer(1, 10*mm))
        flow.append(Paragraph("Signatures", h2))
        for s in sigs:
            flow.append(Paragraph(
                f"<b>{s.get('signer_name','')}</b> ({s.get('signer_role','')}) — "
                f"signed {s.get('signed_at','')}, method {s.get('method','click_wrap')}"
                + (f", IP {s['ip_address']}" if s.get("ip_address") else ""),
                tiny,
            ))

    doc.build(flow)
    buf.seek(0)
    return buf.read()



def render_form16_pdf(data: dict, company_name: str = "Company", legal_entity: Optional[str] = None,
                      logo_base64: Optional[str] = None) -> bytes:
    """Render a Form 16 (Part B) style TDS certificate summary as PDF.

    `data` is the payload produced by `/api/statutory/form16/{employee_id}/{fy}` and contains
    employee details, fiscal year, totals, and the breakdown of earnings/deductions.
    """
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=16*mm, rightMargin=16*mm, topMargin=14*mm, bottomMargin=14*mm,
        title=f"Form 16 — {data.get('employee_name','')} — {data.get('financial_year','')}",
    )
    st = getSampleStyleSheet()
    body = ParagraphStyle("b", parent=st["Normal"], fontSize=9, leading=11)
    small = ParagraphStyle("s", parent=st["Normal"], fontSize=8, leading=10)
    tiny = ParagraphStyle("t", parent=st["Normal"], fontSize=7.5, leading=9, textColor=colors.HexColor("#666"))
    head = ParagraphStyle("h", parent=st["Heading1"], fontSize=14, leading=16)
    sub = ParagraphStyle("sub", parent=st["Normal"], fontSize=10, leading=13, textColor=colors.HexColor("#444"))
    label = ParagraphStyle("lbl", parent=st["Normal"], fontSize=7.5, leading=10, textColor=colors.HexColor("#888"))

    flow = []
    flow.extend(_branded_header(
        legal_entity or company_name,
        ["FORM 16 — Part B", f"Financial year: <b>{data.get('financial_year','')}</b>"],
        logo_base64, title_style=head, sub_style=sub,
    ))
    flow.append(Spacer(1, 5*mm))

    # Employee block
    emp = [
        [Paragraph("Name", label), Paragraph(data.get("employee_name", ""), body),
         Paragraph("Employee code", label), Paragraph(data.get("employee_code", ""), body)],
        [Paragraph("PAN", label), Paragraph(data.get("pan", "") or "—", body),
         Paragraph("Designation", label), Paragraph(data.get("designation", "") or "—", body)],
        [Paragraph("Date of joining", label), Paragraph(data.get("date_of_joining", "") or "—", body),
         Paragraph("Tax regime", label), Paragraph((data.get("tax_regime") or "new").upper(), body)],
    ]
    et = Table(emp, colWidths=[30*mm, 55*mm, 30*mm, 55*mm])
    et.setStyle(TableStyle([
        ("BOX", (0,0), (-1,-1), 0.4, colors.HexColor("#e5e7eb")),
        ("INNERGRID", (0,0), (-1,-1), 0.2, colors.HexColor("#eee")),
        ("BACKGROUND", (0,0), (-1,-1), colors.HexColor("#fafafa")),
        ("LEFTPADDING", (0,0), (-1,-1), 5), ("RIGHTPADDING", (0,0), (-1,-1), 5),
        ("TOPPADDING", (0,0), (-1,-1), 4), ("BOTTOMPADDING", (0,0), (-1,-1), 4),
    ]))
    flow.append(et)
    flow.append(Spacer(1, 6*mm))

    def _section(title: str, rows: list, color_hex: str):
        data_ = [[Paragraph(f"<b>{title}</b>", body), ""]]
        for lbl, val in rows:
            data_.append([Paragraph(lbl, body), Paragraph(_inr(val), body)])
        tb = Table(data_, colWidths=[120*mm, 55*mm])
        tb.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), colors.HexColor(color_hex)),
            ("TEXTCOLOR", (0,0), (-1,0), colors.white),
            ("ALIGN", (1,0), (1,-1), "RIGHT"),
            ("BOX", (0,0), (-1,-1), 0.4, colors.HexColor("#e5e7eb")),
            ("INNERGRID", (0,0), (-1,-1), 0.2, colors.HexColor("#eee")),
            ("LEFTPADDING", (0,0), (-1,-1), 5), ("RIGHTPADDING", (0,0), (-1,-1), 5),
            ("TOPPADDING", (0,0), (-1,-1), 4), ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ]))
        flow.append(tb)
        flow.append(Spacer(1, 3*mm))

    gross = data.get("gross_salary", 0)
    sec10 = data.get("section_10_exemptions", 0)
    std_ded = data.get("standard_deduction", 50000)
    prof_tax = data.get("professional_tax", 0)
    chap_via = data.get("chapter_via_deductions", 0)
    taxable = data.get("taxable_income", 0)
    tds = data.get("tds_deducted", 0)

    _section("1. Gross Salary (from payslips)", [
        ("(a) Salary as per section 17(1)", data.get("basic_plus_allowances", gross)),
        ("(b) Perquisites u/s 17(2)", data.get("perquisites", 0)),
        ("(c) Profits in lieu of salary u/s 17(3)", data.get("profits_in_lieu", 0)),
        ("Total (1)", gross),
    ], "#1f2937")

    _section("2. Less: Exemptions u/s 10", [
        ("HRA exemption", data.get("hra_exempt", 0)),
        ("LTA exemption", data.get("lta_exempt", 0)),
        ("Other exemptions", data.get("other_exemptions", 0)),
        ("Total exemptions (2)", sec10),
    ], "#065f46")

    _section("3. Less: Deductions", [
        ("Standard deduction u/s 16(ia)", std_ded),
        ("Professional tax", prof_tax),
        ("Chapter VI-A deductions (80C/80D/etc.)", chap_via),
    ], "#1e40af")

    # Net
    net_data = [[
        Paragraph("<b>TAXABLE INCOME</b>", ParagraphStyle("nt", parent=body, fontSize=11, leading=14, textColor=colors.white)),
        Paragraph(f"<b>{_inr(taxable)}</b>", ParagraphStyle("nv", parent=body, fontSize=11, leading=14, textColor=colors.white)),
    ]]
    net_tb = Table(net_data, colWidths=[120*mm, 55*mm])
    net_tb.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), colors.HexColor("#09090b")),
        ("ALIGN", (1,0), (1,0), "RIGHT"),
        ("LEFTPADDING", (0,0), (-1,-1), 8), ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ]))
    flow.append(net_tb)
    flow.append(Spacer(1, 5*mm))

    _section("4. Tax Deducted at Source (TDS)", [
        ("Total TDS deposited to Government", tds),
    ], "#991b1b")

    # Monthly breakup
    months = data.get("monthly_breakup") or []
    if months:
        flow.append(Spacer(1, 4*mm))
        flow.append(Paragraph("<b>Monthly breakup</b>", body))
        rows = [[Paragraph("<b>Month</b>", small), Paragraph("<b>Gross</b>", small),
                 Paragraph("<b>Taxable</b>", small), Paragraph("<b>TDS</b>", small)]]
        for m in months:
            rows.append([Paragraph(m.get("period_month", ""), small),
                         Paragraph(_inr(m.get("gross", 0)), small),
                         Paragraph(_inr(m.get("taxable", 0)), small),
                         Paragraph(_inr(m.get("tds", 0)), small)])
        mt = Table(rows, colWidths=[35*mm, 47*mm, 47*mm, 47*mm])
        mt.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#e5e7eb")),
            ("BOX", (0,0), (-1,-1), 0.4, colors.HexColor("#e5e7eb")),
            ("INNERGRID", (0,0), (-1,-1), 0.2, colors.HexColor("#eee")),
            ("ALIGN", (1,1), (-1,-1), "RIGHT"),
            ("LEFTPADDING", (0,0), (-1,-1), 5), ("RIGHTPADDING", (0,0), (-1,-1), 5),
            ("TOPPADDING", (0,0), (-1,-1), 3), ("BOTTOMPADDING", (0,0), (-1,-1), 3),
        ]))
        flow.append(mt)

    flow.append(Spacer(1, 8*mm))
    flow.append(Paragraph(
        "This Form 16 is generated from payslip data for reference. Always verify values with "
        "the certified Form 16 issued by your deductor (employer) via TRACES before filing.", tiny))

    doc.build(flow)
    buf.seek(0)
    return buf.read()


def render_expense_voucher_pdf(claim: dict, company_name: str = "Company", legal_entity: Optional[str] = None,
                               logo_base64: Optional[str] = None) -> bytes:
    """Generate a signed expense voucher PDF for an approved expense claim."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=16*mm, rightMargin=16*mm, topMargin=14*mm, bottomMargin=14*mm,
        title=f"Expense Voucher {claim.get('id','')[:8]}",
    )
    flow = []
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontSize=14, spaceAfter=4)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=10, textColor=colors.HexColor("#525252"), spaceAfter=8)
    body = ParagraphStyle("b", parent=styles["BodyText"], fontSize=9, leading=12)
    tiny = ParagraphStyle("t", parent=styles["BodyText"], fontSize=7.5, textColor=colors.HexColor("#71717a"))

    sub_lines = []
    if legal_entity:
        sub_lines.append(legal_entity)
    sub_lines.append("EXPENSE REIMBURSEMENT VOUCHER")
    flow.extend(_branded_header(
        company_name, sub_lines, logo_base64, title_style=h1, sub_style=h2,
    ))

    # Employee block
    rows = [
        ["Voucher No.",   claim.get("id","")[:12].upper()],
        ["Employee",      f"{claim.get('employee_name','')} ({claim.get('employee_code','')})"],
        ["Claim Date",    (claim.get('created_at') or '')[:10]],
        ["Status",        (claim.get('status') or '').upper()],
        ["Currency",      claim.get('currency','INR')],
    ]
    if claim.get("approved_at") or claim.get("decided_at"):
        rows.append(["Approved On", (claim.get('approved_at') or claim.get('decided_at') or '')[:10]])
    t = Table(rows, colWidths=[35*mm, 130*mm])
    t.setStyle(TableStyle([
        ("FONTNAME", (0,0), (-1,-1), "Helvetica"), ("FONTSIZE", (0,0), (-1,-1), 9),
        ("TEXTCOLOR", (0,0), (0,-1), colors.HexColor("#525252")),
        ("LINEBELOW", (0,0), (-1,-1), 0.25, colors.HexColor("#e4e4e7")),
        ("LEFTPADDING", (0,0), (-1,-1), 0), ("BOTTOMPADDING", (0,0), (-1,-1), 4),
    ]))
    flow.append(t)
    flow.append(Spacer(1, 4*mm))

    # Line items
    items = claim.get("items") or [{
        "category": claim.get("category", "Expense"),
        "description": claim.get("description", ""),
        "date": (claim.get("expense_date") or claim.get("created_at") or "")[:10],
        "amount": claim.get("amount", 0),
    }]
    head = ["#", "Date", "Category", "Description", "Amount"]
    data = [head]
    total = 0.0
    for i, it in enumerate(items, 1):
        amt = float(it.get("amount") or 0)
        total += amt
        data.append([str(i), (it.get("date","") or "")[:10],
                     (it.get("category","") or "").title(),
                     it.get("description","") or "—", _inr(amt)])
    data.append(["", "", "", "TOTAL", _inr(total)])
    tt = Table(data, colWidths=[8*mm, 22*mm, 30*mm, 70*mm, 35*mm])
    tt.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#f4f4f5")),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 8.5),
        ("ALIGN", (4,0), (4,-1), "RIGHT"),
        ("LINEBELOW", (0,0), (-1,-2), 0.25, colors.HexColor("#e4e4e7")),
        ("FONTNAME", (3,-1), (4,-1), "Helvetica-Bold"),
        ("LINEABOVE", (3,-1), (4,-1), 1, colors.black),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
    ]))
    flow.append(tt)
    flow.append(Spacer(1, 6*mm))

    # Approval chain
    chain = claim.get("approval_chain") or []
    if not chain and (claim.get("approved_at") or claim.get("decided_at")):
        chain = [{
            "approver_name": claim.get("decided_by_name", "HR / Manager"),
            "approver_role": "Approver",
            "decided_at": claim.get("approved_at") or claim.get("decided_at"),
            "comment": claim.get("decision_note", ""),
        }]
    if chain:
        flow.append(Paragraph("<b>Approval chain</b>", body))
        achdata = [["Step", "Approver", "Role", "Decided", "Comment"]]
        for i, step in enumerate(chain, 1):
            achdata.append([
                str(i), step.get("approver_name", ""), step.get("approver_role", ""),
                (step.get("decided_at") or "")[:16].replace("T", " "),
                step.get("comment", ""),
            ])
        ac = Table(achdata, colWidths=[12*mm, 45*mm, 35*mm, 35*mm, 38*mm])
        ac.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#f4f4f5")),
            ("FONTSIZE", (0,0), (-1,-1), 8),
            ("LINEBELOW", (0,0), (-1,-1), 0.2, colors.HexColor("#e4e4e7")),
            ("VALIGN", (0,0), (-1,-1), "TOP"),
        ]))
        flow.append(ac)
        flow.append(Spacer(1, 6*mm))

    # Sign-off
    sig = Table([
        ["", "", ""],
        ["Prepared by (Employee)", "Approved by", "Authorized Signatory"],
    ], colWidths=[55*mm, 55*mm, 55*mm])
    sig.setStyle(TableStyle([
        ("LINEABOVE", (0,1), (-1,1), 0.5, colors.black),
        ("FONTSIZE", (0,1), (-1,1), 8), ("ALIGN", (0,1), (-1,1), "CENTER"),
        ("TEXTCOLOR", (0,1), (-1,1), colors.HexColor("#525252")),
        ("BOTTOMPADDING", (0,0), (-1,0), 18),
    ]))
    flow.append(Spacer(1, 12*mm))
    flow.append(sig)
    flow.append(Spacer(1, 8*mm))
    flow.append(Paragraph("This is a computer-generated voucher. No physical signature required.", tiny))

    doc.build(flow)
    buf.seek(0)
    return buf.read()


# ============================================================
# Phase D-PDF — Org Chart + Employee Directory
# ============================================================
from reportlab.lib.pagesizes import A4, landscape

def _flatten_for_print(roots, depth=0, search_lc=None, out=None):
    """Iterative flatten of a tree into [(node, depth)]. Optionally filters by search term."""
    if out is None: out = []
    stack = [(n, depth) for n in (roots or [])]
    stack.reverse()
    while stack:
        node, d = stack.pop()
        out.append((node, d))
        for c in reversed(node.get("children") or []):
            stack.append((c, d + 1))
    if search_lc:
        # Keep only matching nodes + their direct path parents (best-effort: keep matching alone)
        out = [(n, d) for (n, d) in out if
               (n.get("name") or "").lower().find(search_lc) >= 0 or
               (n.get("employee_code") or "").lower().find(search_lc) >= 0 or
               (n.get("job_title") or "").lower().find(search_lc) >= 0]
    return out


def render_orgchart_pdf(chart: dict, company_name: str, search: Optional[str] = None,
                        logo_base64: Optional[str] = None) -> bytes:
    """Render the visible org-chart tree (any template) to a print-ready PDF."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4),
                            leftMargin=14*mm, rightMargin=14*mm, topMargin=12*mm, bottomMargin=12*mm,
                            title=f"Org Chart — {company_name}")
    flow = []
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontSize=15, spaceAfter=2)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=10,
                        textColor=colors.HexColor("#52525b"), spaceAfter=8)
    body = ParagraphStyle("b", parent=styles["BodyText"], fontSize=8.5, leading=11)
    tiny = ParagraphStyle("t", parent=styles["BodyText"], fontSize=7, textColor=colors.HexColor("#71717a"))

    template = chart.get("template") or "reporting"
    stats = chart.get("stats") or {}
    today = __import__("datetime").datetime.utcnow().strftime("%d %b %Y")

    sub = f"Organization Chart · <b>{template.title()}</b> view · {stats.get('employees', 0)} employees"
    if search:
        sub += f" · Filter: <b>{search}</b>"
    sub += f" · {today}"

    flow.extend(_branded_header(company_name, [sub], logo_base64, title_style=h1, sub_style=h2))

    search_lc = (search or "").lower().strip() or None

    def _node_para(node, depth):
        name = node.get("name") or ""
        code = node.get("employee_code") or ""
        title = node.get("job_title") or ""
        dept = node.get("department_name") or ""
        branch = node.get("branch_name") or ""
        emp_type = (node.get("employee_type") or "").upper()
        prefix = "    " * depth + ("• " if depth else "")
        meta = " · ".join([x for x in [dept, branch, emp_type] if x])
        line = f"{prefix}<b>{name}</b>"
        if code:
            line += f" <font color='#71717a' size='7'>({code})</font>"
        if title:
            line += f" — <font color='#52525b'>{title}</font>"
        if meta:
            line += f" <font color='#a1a1aa' size='7'>· {meta}</font>"
        return Paragraph(line, body)

    if template == "reporting":
        flat = _flatten_for_print(chart.get("roots") or [], 0, search_lc)
        if not flat:
            flow.append(Paragraph("No employees match.", body))
        for node, depth in flat:
            flow.append(_node_para(node, depth))
    else:
        for grp in (chart.get("groups") or []):
            grp_label = grp.get("group_name") or ""
            grp_kind = grp.get("group_kind") or ""
            count = grp.get("count", 0)
            extras = []
            if grp.get("is_head_office"): extras.append("HQ")
            if grp.get("state_code"): extras.append(grp["state_code"])
            if grp.get("code"): extras.append(grp["code"])
            head = f"<b>{grp_label}</b>  <font color='#71717a' size='8'>· {count} {grp_kind}{'es' if grp_kind=='branch' else 's'}{(' · ' + ' / '.join(extras)) if extras else ''}</font>"
            flow.append(Spacer(1, 4*mm))
            flow.append(Paragraph(head, ParagraphStyle("g", parent=body, fontSize=11, leading=14, textColor=colors.HexColor("#18181b"))))
            flat = _flatten_for_print(grp.get("roots") or [], 0, search_lc)
            if not flat:
                flow.append(Paragraph("    (no matching employees)", tiny))
            for node, depth in flat:
                flow.append(_node_para(node, depth))

    flow.append(Spacer(1, 8*mm))
    flow.append(Paragraph(f"Generated by Arcstone HRMS · {today}", tiny))

    doc.build(flow)
    buf.seek(0)
    return buf.read()


def render_directory_pdf(employees: list, company_name: str, filters: dict = None,
                         logo_base64: Optional[str] = None) -> bytes:
    """Render employee directory as a print-friendly roster PDF."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4),
                            leftMargin=12*mm, rightMargin=12*mm, topMargin=12*mm, bottomMargin=12*mm,
                            title=f"Directory — {company_name}")
    flow = []
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontSize=15, spaceAfter=2)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=10,
                        textColor=colors.HexColor("#52525b"), spaceAfter=8)
    tiny = ParagraphStyle("t", parent=styles["BodyText"], fontSize=7, textColor=colors.HexColor("#71717a"))

    today = __import__("datetime").datetime.utcnow().strftime("%d %b %Y")
    parts = [f"<b>{len(employees)} employees</b>"]
    for k, v in (filters or {}).items():
        if v: parts.append(f"{k}: {v}")
    parts.append(today)

    flow.extend(_branded_header(
        company_name,
        ["Employee Directory · " + " · ".join(parts)],
        logo_base64, title_style=h1, sub_style=h2,
    ))

    head = ["#", "Name", "Code", "Title", "Department", "Branch", "Type", "Email", "Phone", "Status"]
    data = [head]
    for i, e in enumerate(sorted(employees, key=lambda x: (x.get("name") or "").lower()), 1):
        data.append([
            str(i),
            (e.get("name") or "")[:28],
            e.get("employee_code") or "",
            (e.get("job_title") or "")[:22],
            (e.get("department_name") or "—")[:16],
            (e.get("branch_name") or "—")[:14],
            (e.get("employee_type") or "").upper(),
            (e.get("email") or "")[:30],
            e.get("phone") or "—",
            (e.get("status") or "active").title(),
        ])
    t = Table(data, colWidths=[10*mm, 36*mm, 22*mm, 35*mm, 26*mm, 24*mm, 14*mm, 50*mm, 26*mm, 18*mm], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#18181b")),
        ("TEXTCOLOR", (0,0), (-1,0), colors.white),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 7.5),
        ("LINEBELOW", (0,0), (-1,-1), 0.2, colors.HexColor("#e4e4e7")),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 4), ("RIGHTPADDING", (0,0), (-1,-1), 4),
        ("TOPPADDING", (0,0), (-1,-1), 3), ("BOTTOMPADDING", (0,0), (-1,-1), 3),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#fafafa")]),
    ]))
    flow.append(t)
    flow.append(Spacer(1, 4*mm))
    flow.append(Paragraph(f"Generated by Arcstone HRMS · {today}", tiny))

    doc.build(flow)
    buf.seek(0)
    return buf.read()
