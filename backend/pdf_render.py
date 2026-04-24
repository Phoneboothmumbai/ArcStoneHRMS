"""Phase 2B-PDF — payslip + letter PDF generation using reportlab."""
from __future__ import annotations

import io
from typing import Optional

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.pdfgen import canvas as rcanvas
from reportlab.platypus import (
    Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle, PageBreak,
)


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

    # Header block
    flow.append(Paragraph(legal_entity or company_name, h))
    flow.append(Paragraph(f"Payslip for {run.get('period_label', slip.get('period_month',''))}", sub))
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
                     legal_entity: Optional[str] = None) -> bytes:
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
    flow.append(Paragraph(legal_entity or company_name, head))
    flow.append(Paragraph(letter.get("template_name", ""), tiny))
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
