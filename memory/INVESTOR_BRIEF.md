# Arcstone HRMS — Investor Brief

**A modern, multi-tenant Human Resources platform purpose-built for the Indian mid-market — with a reseller layer, native mobile, and statutory compliance baked in.**

Live: **https://arcstone.co.in** &nbsp;·&nbsp; April 2026

---

## 1. The opportunity

India's mid-market HR software is a $1.4B+ TAM, growing 14% YoY. The incumbents (SpineHR, GreytHR, Keka, Zoho People) leave three structural gaps:

1. **No reseller layer.** Indian HR software is sold by ~3,000 IT consultants and CA firms. Today they resell hosted seats with no margin control. We give them a true **white-label reseller console** with wholesale/retail pricing, commissions, and entitlements.
2. **Compliance is a feature, not the core.** Multi-state PT slabs, PF/ESIC, gratuity, FNF, DPDP — these are bolted on by competitors. We ship them with day-1 regression tests.
3. **Mobile is a viewer, not a tool.** Existing apps are React Native WebView wrappers. Ours is a native Expo app with **geofenced check-in, offline cache, and field-tracking polylines**.

We have shipped a working production system across all three gaps and onboarded our first reference company.

---

## 2. What's built (numbers)

| Metric | Count |
|---|---|
| **Frontend pages (modules)** | 55 |
| **Backend API endpoints** | 251 |
| **Backend routers** | 51 |
| **MongoDB collections** | ~75 (110 indexes) |
| **Lines of production code** | 46,600 (27K backend Python, 20K frontend React) |
| **Native mobile screens** | 13 (Expo / React Native) |
| **Backend regression tests** | 76 (pytest, all passing) |
| **Demo data seeded** | 44 employees · 5 branches · 18 docs · 16 recurring schedules · 10 budget envelopes |
| **Production uptime** | Hetzner Frankfurt · HTTPS via Let's Encrypt · daily MongoDB backups |

---

## 3. The 4-tier multi-tenancy moat

```
  Platform (us)
      │
      ├── Resellers (white-label partners; their domain + brand)
      │       │
      │       └── Companies (their clients; up to N seats)
      │               │
      │               └── Org structure (Country → Region → Branch → Department → Employee)
```

Every database query carries a `company_id` — enforced at the query level, not the application layer. No cross-tenant leakage is possible without an explicit super-admin override. **This is the technical foundation no competitor will replicate without rewriting from scratch.**

The reseller layer (already shipped, awaiting Stripe Connect for payouts) lets a CA firm sell HRMS to their own client base, set retail pricing, take a commission, and maintain their own brand — without us touching the customer.

---

## 4. Modules shipped (live in production)

### Core HR
- **People & Directory** — multi-region, multi-branch, manager hierarchy, employee codes, profile photos, passive role inheritance.
- **Org Chart + Hierarchy Map** — interactive tree view, dotted-line reporting.
- **Onboarding & Offboarding** — checklists, joining kit issuance with e-sig, exit interviews, full & final settlements.
- **Employment classes** — On-Roll / Off-Roll Consultant / Off-Roll Contractor / Intern with **per-class feature gating** (consultants can't see payroll, etc.).

### Time & Attendance
- **Attendance** — punch in/out, geofenced check-in, **selfie verification**, configurable grace periods.
- **Live tracking** — for field employees: real-time location pings + day's polyline trail.
- **Leave management** — multi-level approval, comp-off auto-credit, holiday calendars per region, leave admin queue.
- **Shift roster** — assignment, swap requests, multi-employee × multi-date grid (95% — bulk-assign UI is the last 5%).

### Payroll & Compensation
- **Payroll runs** — gross-to-net calculation, **multi-state professional-tax slabs (12 Indian states)**, PF, ESIC, TDS, statutory deductions.
- **Compensation** — band/grade master, increment letters, salary review automation.
- **Loans, advances, EMI** — request → approve → auto-deduct from payroll.
- **Investment declarations** — Section 80C/80D, projected vs actual, generates Form-16 input.

### Finance Operations *(May 2026 — newest pillar)*
- **Branch Document Vault** — utility bills, rent, property tax, fire safety, AMC, licenses, insurance with expiry alerts (7d/15d/30d/60d).
- **Recurring Expense Scheduler** — three modes: *AUTO_SUBMIT* (electricity/internet fire into approval on day 1), *AUTO_DRAFT* (tea/coffee/housekeeping drafted for review), *MANUAL_ONE_CLICK* (template library).
- **Budget Module** — Branch × Department × Cost-Center × Category envelopes, fiscal-year aware, **soft-warn 80% / hard-block 100% with admin override**, real-time pre-flight on every expense and PO.
- **Branch Manager Dashboard** — one-screen command center: docs expiring, recurring due, budget burn, pending approvals.

### Procurement & Vendors
- **Vendors, RFQs, Purchase Orders** with versioning, vendor portal, GRN, three-way match, tax handling.
- **Procurement category catalog** — 8 categories × 78 sub-items (Stationery, Joining Kit, AC Repair, Branding, Gifting, Office Supplies, IT Hardware).
- **Vendor portal** — vendors log in directly, upload Proof of Delivery + Invoice against assigned POs.
- **Joining Kit issuance** — template-driven kits (Standard, Engineering), per-item returnable flag, e-signature, exit return tracking.

### Performance & Growth
- **Goals & OKRs** — quarterly cycles, weight-based scoring.
- **Performance reviews** — self → manager → calibration, 9-box grid.
- **PIPs (performance improvement plans)** — gated, audited, time-boxed.
- **Recruitment** — job requisitions, candidates pipeline, offers, interviews.

### Compliance, Governance & Engagement
- **Approval Matrix engine** — configurable per-company workflow chains routed by request type, branch, amount band; falls back to manager chain.
- **Audit log** — immutable trail of every administrative action.
- **Auth hardening** — bcrypt, account lockouts after 5 fails, password strength policy, slowapi rate limiting.
- **Helpdesk** — internal ticketing with category routing.
- **Knowledge base, Policies, Letters Library** — versioned, role-gated, with markdown templates.
- **Visitor management, Resource booking, PoSH (Sexual harassment), Compliance bulletins.**

### Platform & Reseller
- **Module entitlements** — gate features per company plan (Free / Pro / Enterprise) and per employment class.
- **Reseller console** — wholesale pricing, retail pricing, customer list, commission tracking *(Stripe Connect pending)*.
- **Companies / billing** — multi-company management, seat counters, plan tier.
- **Custom builder** — let admins extend without code.

### Native Mobile App *(Android live · iOS TestFlight pending)*
- 13 screens: Dashboard, Attendance (with geofence), Field visits with selfie, Leave, Expenses with receipt camera, Payslips, Loans, Helpdesk, Knowledge Base, Profile, OTA updates.
- Built with Expo EAS, signed APK distributed by direct link.

---

## 5. Differentiation, in plain English

| What competitors do | What we do |
|---|---|
| Offer payroll, leave, attendance — the 3 commodity modules. | Cover **all 18+ pillars** including Procurement, Vendor Portal, Joining Kits, Branch Document Vault, Budget envelopes — none of which the incumbents ship. |
| Sell directly to companies via outbound. | Built a **reseller layer** so the existing ~3,000 Indian IT-consultant + CA-firm channel can resell us under their brand. |
| Geofence check-in is on the roadmap. | **Already live** in our Expo Android app, with selfie + offline cache. |
| "Configurable workflows" means a YAML file the customer can't edit. | A real **Approval Matrix UI** with branch + amount-band rules, fallbacks to manager chain, and audit logs. |
| Compliance is a sales claim. | **62 pytest cases** covering payroll EMI / PF / ESIC / 12-state PT math; daily Mongo backups; HTTPS by default. |
| Budget is a separate ERP. | Real-time **pre-flight check on every expense + PO** with envelope match, soft-warn, hard-block, admin override. |

---

## 6. Tech stack & operating posture

- **Backend** — FastAPI (Python 3.11), MongoDB (Motor async driver), Pydantic v2, slowapi rate limiter, JWT auth.
- **Frontend** — React 19, Tailwind, Shadcn/UI, Phosphor icons, sonner toasts, react-router 7.
- **Mobile** — Expo SDK 51, React Native 0.74, EAS Build for OTA Android updates.
- **Infrastructure** — Hetzner Cloud (Frankfurt) for production, Nginx + Certbot, Mongo daily backups via cron, supervisor for process management.
- **CI / quality** — pytest regression suite, ruff + ESLint enforced, secrets in `.env` only.

We **do not** ship: Salesforce-style customisation hell, no jQuery, no PHP, no shared schemas across tenants. Every architectural decision is biased toward defensibility-at-scale.

---

## 7. Roadmap (next 90 days)

**Q3 2026 — Monetisation & polish**
- Stripe subscription billing (per-company plans + seat-based pricing).
- Stripe Connect reseller commissions (split payouts, monthly statements).
- Migrate base64 file storage to S3-compatible object storage (Hetzner / R2).
- iOS TestFlight build.

**Q4 2026 — Enterprise readiness**
- Fixed Asset Management (depreciation, custodian transfer, write-off, AMC linkage).
- Idea Factory + Recruitment Referral with bonus auto-trigger on hire+90-day retention.
- DPDP-compliant data export & right-to-erasure endpoints.
- 2FA (TOTP), SAML/OIDC SSO, SCIM provisioning.
- Sentry error tracking integration.

**2027**
- Multi-country payroll engines (UAE, SG, KSA — same statutory layer pattern as India PT).
- Workflow marketplace — pre-built chains for Travel, Procurement, Recruitment that customers install in one click.
- Reseller white-label storefront with their own domain mapping.

---

## 8. Demo highlights — what you'll see in 5 minutes

1. **Login as `hr@acme.io`** → see 44 employees, 5 branches, hierarchy map, payroll runs, all modules live with seeded data.
2. **Open `/app/branch-dashboard`** → real-time view of expiring documents, recurring expenses due in 7 days, budget burn rate (15.8% on ₹18L envelope), pending approvals.
3. **Click "One-time expense"** on `/app/branch-operations` → enter ₹50,000 travel → **live budget pre-flight box** turns green/amber/red as you type, calling `/api/budgets/check`.
4. **Submit the expense** → it routes through the Approval Matrix to the right manager based on amount + branch.
5. **Open `/app/employment-classes`** → flip a switch to revoke "Payroll" from Off-Roll Consultants → the consultant's mobile app instantly hides the Payslips screen.

All of the above is **live data, no mocks**, served over HTTPS from a production Linux box.

---

## 9. The team's philosophy

We build for the engineer at a 200-person Indian factory who doesn't want to learn SAP, the HR head at a 50-branch retail chain who has 200 utility bills to track, and the CA firm in Mumbai who wants to white-label HRMS to their 60 mid-market clients. **Our user is not the CHRO — it's the operations lead two layers down.** That's why every screen is designed for *one task per visit*, not for a dashboard demo.

---

*Prepared April 2026 · Arcstone HRMS Enterprise · arcstone.co.in*
