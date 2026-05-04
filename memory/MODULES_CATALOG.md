# Arcstone HRMS — Complete Modules & Features Catalog

**The exhaustive reference document** for everything Arcstone ships today. Use this for investor decks, sales conversations, RFPs, or as an internal map when onboarding a new team member.

Live: **https://arcstone.co.in** &nbsp;·&nbsp; Last updated: April 2026

---

## How the system is organised

Arcstone is a **multi-tenant, role-aware, modular platform**. Users land in one of five workspaces depending on their role:

| Workspace | Who | Default landing |
|---|---|---|
| **Platform** | Super-admins (Arcstone team) | `/app/platform` |
| **Reseller** | Channel partners (CA firms, IT consultants) | `/app/reseller` |
| **HR / Admin** | Company HR teams, owners | `/app/hr` |
| **Manager** | Anyone with direct reports | `/app/manager` |
| **Employee** | Everyone else | `/app/employee` |

Every employee belongs to **exactly one company**, and every company is owned by zero or one reseller. Every database query is scoped by `company_id` at the query level. Cross-tenant access is impossible without an explicit super-admin override.

---

# 1 · People (Core HR)

The directory + organisational backbone. Every other module reads from this.

### 1.1 Employee Directory (`/app/employees`)
- Searchable table & card views with filters: branch, department, employment mode (WFO/WFH/Field/Hybrid), employment class (On-Roll/Consultant/Contractor/Intern), name/email/code search.
- Per-employee profile page with tabs: **Profile · Compensation · Documents · Leaves · Attendance · Performance · Assets · Loans · Insurance**.
- Bulk CSV import with **dry-run validator** (column mapping, error preview, no partial writes).
- Probation tracking: auto-alert to HR 7 days before probation ends.
- Birthday + work-anniversary feed.
- Avatar upload, phone/email/blood-group/emergency contact, family declarations.
- 44 demo employees seeded across 5 branches in 3 tiers of management hierarchy.

### 1.2 Org Chart (`/app/org-chart`)
- D3 tree view of reporting relationships, expandable nodes, drag-pan canvas.
- Click any node → jump to employee profile.
- Dotted-line vs solid-line manager support (project vs functional reporting).

### 1.3 Hierarchy Map (`/app/org-tree`)
- Faster, indented list view of the same tree, with team headcounts at each level.
- Search-jump-to-employee within the tree.

### 1.4 Locations (`/app/branches`)
- Multi-region, multi-country, multi-branch model.
- Per-branch geolocation (lat/lon) with **OpenStreetMap Nominatim auto-geocoding**.
- Geofence radius for attendance check-in (default 200m, configurable per branch).
- Branch manager assignment, head-office flag, working-hours profile.
- 5 branches seeded across Bengaluru, Mumbai, NCR, Hyderabad, Pune.

### 1.5 Branch Manager Dashboard (`/app/branch-dashboard`) **NEW**
A single-screen command center scoped to one branch:
- 4 KPI tiles: Docs expiring · Recurring expenses due · Budget burn % · Pending approvals
- Detail panels: documents expiring (critical ≤7d highlighted in red, soon ≤30d in amber); recurring expenses firing in next 7 days; budget envelopes over 80% threshold; this-month activity summary
- Quick-action shortcuts: Upload doc · Add recurring · One-time expense

### 1.6 Branch Operations (`/app/branch-operations`) **NEW**
Three tabs:
1. **Document Vault** — utility bills, rent agreements, property tax challans, fire safety certs, business licenses, insurance, AMC contracts. Each with vendor, amount, period, expiry. **Drag-and-drop bulk upload** with filename-based type auto-detection.
2. **Recurring Expenses** — schedule monthly bills with three modes:
   - **AUTO_SUBMIT** (electricity, internet) — fires straight into approval workflow on day-of-month.
   - **AUTO_DRAFT** (tea/coffee, housekeeping) — drafted for branch manager review.
   - **MANUAL_ONE_CLICK** — template library, manager creates each month.
3. **Expiry Alerts** — org-wide window selector (7/15/30/60/90 days) with renewal countdown.
- One-time expense quick form with **live budget pre-flight** (debounced API call as you type).
- 18 seeded docs · 16 seeded recurring schedules.

### 1.7 Joining Kit (`/app/joining-kit`) **NEW**
- Template library: "Standard Joining Kit" (6 items) and "Engineering Onboarding Kit" (6 items including laptop + dock + headset).
- Per-template scoping: department, branch, employment class, default flag.
- Issuance lifecycle: **Draft → Issued (with timestamps + serial numbers) → Signed by employee (e-signature timestamp) → Returned (per-SKU on exit)**.
- Returnable vs consumable flag per item.

### 1.8 Onboarding (`/app/onboarding`)
- Configurable checklists (HR forms, IT setup, manager intro, asset assignment).
- New-joiner timeline with stage gates.
- Document upload requests (Aadhaar, PAN, education proofs).
- Auto-trigger of Joining Kit issuance on Day 1.

### 1.9 Offboarding (`/app/offboarding`)
- Exit-interview workflow.
- Asset return checklist linked to Asset Register.
- Joining-kit return prompt for returnable items.
- F&F (Full & Final) settlement worksheet generation.
- Post-exit access revocation timeline.

### 1.10 Approvals & Workflows (`/app/approvals`, `/app/workflows`)
- **Approval Matrix engine**: configurable per-company chains routed by request type (leave, expense, PO, attendance correction, comp-off…), branch, amount band.
- Multi-step chains: Step 1 → Step 2 → Step 3, each with a resolver (specific user, manager-of-requester, role lookup).
- Conditional steps: skip step if amount < ₹X.
- **Fallback**: walks the manager chain if no workflow matches.
- **Last-resort**: routes to company_admin so nothing is ever orphaned.
- Audit log on every decision; in-app + email notifications to next approver.

### 1.11 Employment Classes (`/app/employment-classes`) **NEW**
- 4 classes: On-Roll · Off-Roll Consultant · Off-Roll Contractor · Intern.
- 19-feature × 4-class permission matrix. Examples:
  - Off-Roll Consultant: Payroll, PF/ESIC, Loans, Insurance, Leave **all hidden**; Attendance, Timesheet, Expenses **visible**.
  - Intern: Stipend payroll **on**, but no PF/ESIC/Loans/Insurance.
- Per-company override panel — flip a switch and the consultant's mobile app instantly hides Payslips.
- Workforce headcount breakdown by class with deep-link filters.

### 1.12 HR Alerts (`/app/hr-alerts`)
- Birthdays, work anniversaries, probation completions, contract expiry, document renewal reminders all aggregated for HR.
- Configurable lead-time per alert type.

### 1.13 Company Settings (`/app/company-settings`)
- Logo, primary color, currency, fiscal-year-start, working-day calendar.
- Location-tracking retention period (default 90 days, GDPR-tunable).
- Module toggles per company plan tier.

---

# 2 · Time & Leave

### 2.1 My Attendance (`/app/attendance`)
- Daily check-in / check-out with timestamp.
- **Geofenced check-in** — must be within branch radius unless `is_field_tracked` flag is on.
- **Selfie verification** — captured on punch-in, stored encrypted (base64 today, S3 on roadmap).
- Calendar view of past attendance with status badges (present/absent/half-day/leave/holiday/weekoff).
- Regularization request flow if you forgot to punch (routes through approval).

### 2.2 My Leave (`/app/leave`)
- Apply for leave with date range + half-day support.
- Per-policy quotas: Privileged Leave, Sick Leave, Casual Leave, Comp-Off, Maternity, Paternity, Bereavement.
- Live balance display with auto-credit on monthly accrual.
- Cancel pending request before approval.
- Leave history with approver chain.

### 2.3 Comp-Off
- Auto-credit when an employee works on a holiday or weekend.
- Manual comp-off request (e.g. for off-hours Saturday support).
- Configurable expiry window per company.

### 2.4 Leave Admin (`/app/leave-admin`)
- All-employee leave queue with filters by status, type, branch.
- Bulk approve / reject.
- Leave balance correction with audit trail.
- Year-end carry-forward and encashment runs.

### 2.5 Attendance Admin (`/app/attendance-admin`)
- Master log of every check-in/out across the company.
- Manual regularization for missed punches.
- Bulk attendance correction with reason tagging (system outage, holiday miss, etc).
- Late-mark + early-leave reports per branch / department.

### 2.6 Team Leave Planner (`/app/leave-planner`)
- Month-grid of who's out when (managers only).
- Conflict detection (>30% of team out simultaneously triggers a warning).
- Drag-to-approve interface.

### 2.7 Live Tracking (`/app/live-tracking`)
- For field employees: real-time location pings posted from the mobile app every 10 minutes.
- Day's polyline trail rendered on Leaflet/OSM map.
- Geofence enter/exit events with timestamps.
- Privacy-safe: location captured only during punched-in hours.

### 2.8 Holidays
- Multi-region calendar (national, state, optional, religious).
- Auto-applied to leave-balance and payroll calculations.

### 2.9 Shift Roster
- Shift master (Day/Night/Split with start-end + break).
- Per-employee assignment, swap requests, manager approval.
- (Bulk multi-employee × multi-date grid UI is the last 5% on the roadmap.)

---

# 3 · Payroll & Compensation

### 3.1 Compensation (`/app/payroll`)
- Per-employee CTC structure: Basic, HRA, Special Allowance, LTA, Statutory Bonus, Variable Pay.
- Grade / band mapping for normalization.
- Salary revision history with effective-date tracking.
- Auto-set next-review-date on hire / last increment.
- Increment letter generation (PDF) using letter-template engine.

### 3.2 Payroll Runs (`/app/payroll-runs`)
- Monthly run wizard: pick period → preview → freeze → process → publish.
- **Gross-to-net engine** with full income-tax calculation (old + new regime).
- **62 pytest cases** covering EMI deduction, PF, ESIC, Professional Tax, TDS math.
- Multi-state Professional Tax — 12 Indian states with distinct slab logic.
- Variance report between runs (auto-flags >5% deviation per employee).
- Payslip PDF generation with signed download URLs.
- TDS certificate (Form-16) input data prepped for FY end.

### 3.3 Statutory & Compliance (`/app/compliance`)
- PF (12% employee + 12% employer split) with EPF + EPS bifurcation.
- ESIC (0.75% + 3.25%) for sub-21K wages.
- Professional Tax — 12-state slab table (Karnataka, Maharashtra, WB, Gujarat, AP, TN, MP, Odisha, Telangana, Assam, Kerala, Punjab).
- Gratuity calculation on tenure ≥5 years.
- Bonus Act 1965 statutory bonus calc.
- TDS as per FY slabs + 80C/80D/HRA/Section-24 deductions.
- Form-24Q quarterly TDS return data export.
- Compliance bulletins feed for HR (statutory changes, due dates).

### 3.4 Investment Declarations
- Section 80C (LIC, PPF, ELSS, ULIP, etc.), 80D (mediclaim), 80E (education loan), 80G (donations), 80CCD(1B) (NPS), Sec-24 (home-loan interest), HRA city-tier rules.
- Two phases per FY: declaration (April–Dec projected) and proof submission (Jan–March actual).
- Auto-recompute of monthly TDS based on projected-vs-actual delta.

### 3.5 F&F & Loans (`/app/fnf-loans`)
- Full & Final settlement engine: pending salary, encashed leaves, gratuity, deductions, last-month TDS.
- Resignation date → notice period → last working day → settlement date timeline.

### 3.6 Loan Requests (`/app/loan-requests`)
- Employee-initiated salary loans with EMI tenure (3/6/12/24 months).
- Manager + HR approval chain.
- Auto-deduct EMI from monthly payroll.
- Pre-payment / closure handling with adjusted balance.

### 3.7 Insurance (`/app/insurance`)
- Group medical insurance master (carrier, sum-insured tiers, family floater rules).
- Per-employee enrolment with dependents.
- Premium computation and payslip integration.
- Endorsement requests (add spouse/child) with HR approval.

---

# 4 · Expenses & Travel

### 4.1 Claims & Travel (`/app/expenses`)
- Multi-line expense claim with category-specific rules:
  - Meals · Travel-Taxi · Travel-Mileage · Hotel · Flight · Per-Diem · Fuel · Office-Supplies · Subscription · Training · Phone/Internet · Medical · Client-Meeting · Other.
- **Per-category caps** (₹2K meals, ₹50K flight, etc) — admin-configurable.
- **Receipt-required-above** thresholds — UI blocks submission if breached.
- Receipt upload (camera or file, base64 with 2MB cap).
- Expense voucher PDF (signed, branded) post-approval.
- **Live budget pre-flight** at submission time.
- Travel request flow: pre-approval before booking, with multi-leg itinerary, hotel/flight/cab line items.

### 4.2 Recurring Office Expenses *(Phase 3)*
See §1.6 Branch Operations.

### 4.3 Expense Policies (admin)
- DB-backed override of default per-category caps.
- Per-company custom rules + receipt thresholds.

---

# 5 · Assets

### 5.1 Asset Register (`/app/assets`)
- Master of all company assets: laptops, monitors, headsets, vehicles, furniture, IDs.
- Categories with custom fields (serial number, OS, RAM, license keys, asset tag).
- Procurement linkage — created from PO line items automatically.

### 5.2 Asset Assignments
- Assign asset to employee with handover signature.
- Transfer between employees with audit trail.
- Return on offboarding with condition tagging (good/damaged/lost).
- Lost-asset write-off requires HR approval.

*(Roadmap Phase 5: SLM/WDV depreciation, AMC contract linkage, asset register PDF export.)*

---

# 6 · Workplace

### 6.1 Resource Booking (`/app/resource-booking`)
- Conference rooms, parking spots, equipment.
- Calendar view with conflict prevention.
- Recurring bookings (weekly stand-up).
- Per-resource access rules (some rooms gated to specific roles).

### 6.2 Visitor Management (`/app/visitors`)
- Pre-register visitors with host, expected time, purpose.
- Reception check-in: photo capture, NDA acceptance, badge print.
- Auto-notify host on arrival.
- Visit history per visitor for repeat guests.

---

# 7 · Policies, Letters & Knowledge

### 7.1 Policies (`/app/policies`)
- Company policies library, role-gated visibility.
- Versioned with effective-date.
- Acknowledgement tracking (employee marks "read & understood").
- 12+ seeded policies across Leave, Travel, IT, Code of Conduct, POSH, Privacy.

### 7.2 Letters (`/app/letters`)
- 12 seeded HR letter templates: offer, joining, confirmation, increment, transfer, promotion, exit, experience, NDC, salary-revision, warning, termination.
- Mail-merge engine — pulls employee fields into the markdown body.
- Per-letter signature requirement flag (CEO sign for offers, HR-head for warnings).
- PDF rendering with branded letterhead.

### 7.3 Knowledge Base (`/app/knowledge-base`)
- Markdown articles with categories, tags, search.
- Role-gated curation (some articles for HR-only, employee-only, all).
- Versioning + draft-publish flow.

---

# 8 · Procurement

### 8.1 Vendors (`/app/procurement/vendors`)
- Master with company name, GST, contact, payment terms, MSME status.
- Category mapping (which vendors for stationery, which for IT hardware).
- Performance score (on-time-delivery, quality, response time).
- 50+ seeded vendors across 8 categories.

### 8.2 RFQs (`/app/procurement/rfqs`)
- Request-for-quote with multi-line items.
- Send to multiple vendors, collect quotes, comparison matrix.
- Award winning vendor → auto-create draft PO.

### 8.3 Purchase Orders (`/app/procurement/purchase-orders`)
- Multi-line PO with items, quantities, taxes (CGST/SGST/IGST), terms.
- Status flow: Draft → Awaiting-approval → Approved → Sent-to-vendor → Acknowledged → In-transit → Partially-received → Received → Invoiced → Paid.
- **Budget pre-flight on submit** (matches branch envelope, blocks if over).
- PO PDF with terms & conditions.

### 8.4 Vendor Portal (`/app/vendor-portal`)
- Vendors log in directly (separate auth) and see only their assigned POs.
- Upload Proof-of-Delivery (PDF + photos) per receipt.
- Upload Invoice for 3-way matching.
- Get paid status visibility.

### 8.5 Procurement Categories (taxonomy)
- 8 curated categories with 78 sub-items: Stationery (General + Printing/Branded), Joining Kit, Repair & Maintenance (AC/Light/Fan/Door), Branding & Promotion, Gifting & Misc, Office Supplies, IT Hardware.
- Auto-route RFQs to vendors mapped to that category.

### 8.6 Product/Service Requests (`/app/requests`)
- Employee-initiated request (e.g. "I need a new monitor").
- Routes to manager + procurement chain.
- Converts to RFQ on approval.

---

# 9 · Recruitment (ATS)

### 9.1 Job Requisitions (`/app/recruitment/requisitions`)
- Open a role with department, hiring manager, level, budget, target start date.
- Approval chain before going public.

### 9.2 Candidates Pipeline
- Stages: Applied · Screen · Interview-1 · Interview-2 · Offer · Hired · Rejected.
- Resume upload + parse, notes, ratings, interview feedback.
- Bulk import from CSV.

### 9.3 Interviews
- Schedule with calendar integration (slots + invites).
- Per-round feedback form.
- Aggregated score-card.

### 9.4 Offers (`/app/recruitment/offers`)
- Offer letter generation from template with mail-merge.
- E-acceptance flow.
- Rolls into Onboarding on accept.

*(Roadmap Phase 6: Employee referral with bonus auto-trigger on hire+90-day retention.)*

---

# 10 · Performance & Growth

### 10.1 Goals & OKRs (`/app/performance/goals`)
- Quarterly cycles with weight-based scoring.
- Cascading goals (company → team → individual).
- Self-rating + manager rating with calibration column.
- Mid-quarter check-ins.

### 10.2 Reviews (`/app/performance/reviews`)
- Self → Manager → Skip-level → HR finalisation.
- Configurable rating scale (1-5, 1-7, behavioral).
- Weighted score across goals + competencies + values.

### 10.3 Review Cycles (`/app/performance/cycles`)
- Annual / mid-year / probation cycle templates.
- Bulk-launch to a population segment (department, level, branch).
- Calibration sessions tracking.

### 10.4 9-Box Grid (`/app/performance/nine-box`)
- Performance × Potential matrix.
- Drag-drop placement, talent-pool segmentation.
- Used for succession planning.

### 10.5 PIPs (Performance Improvement Plans)
- Gated initiation (HR only), 30/60/90-day plans, auto-reminders, sign-off audit.

### 10.6 Compensation Reviews (admin)
- Increment cycles linked to performance ratings.
- Budget-aware (uses Budget Module envelopes).

---

# 11 · Budgets

See §1 for the Branch Manager dashboard view. The Budget module itself:

### 11.1 Budget Envelopes (`/app/budgets`)
- 4-dimensional scoping: **Branch × Department × Cost-Center × Category**.
- Periods: Yearly · Quarterly · Monthly.
- **Indian fiscal-year aware** (Apr–Mar; FY2027 = Apr 2026 → Mar 2027).
- Per-envelope thresholds: soft-warn % (default 80) + hard-block % (default 100).
- Admin override flag — when true, super-admin can force-pass at hard-block.
- 10 seeded envelopes across OpEx, Travel, Stationery, IT Hardware, Joining-Kit Spend.

### 11.2 Budget Dashboard
- Aggregate tiles: envelope count, total budget, utilized, remaining, utilization %.
- Per-envelope progress bars (green <80% / amber 80-99% / red ≥100%).
- Drill-down to underlying expenses + POs that consumed the envelope.

### 11.3 Pre-flight Check Engine
- `POST /api/budgets/check` is called inline before submitting any expense or PO.
- Returns: matched envelope, utilized-after, % after, block/warn flags, override eligibility, human-readable message.
- Integrated into Expense create, PO submit-for-approval, one-time-expense form, and the live UI.
- Most-specific-match algorithm: an envelope scoped to *Bengaluru → IT → Travel* beats a generic *Bengaluru* envelope.

---

# 12 · Helpdesk & Compliance

### 12.1 Tickets (`/app/helpdesk`)
- Categories with SLA per category.
- Auto-assignment based on category routing rules.
- Internal vs external (vendor-raised) tickets.
- Comment thread with attachments.
- SLA breach alerts.

### 12.2 Categories (`/app/helpdesk/categories`)
- IT, HR, Admin, Facilities, Payroll, Compliance, Other — admin-configurable.
- Per-category SLA in hours (response + resolution).
- Per-category default assignee.

### 12.3 PoSH (`/app/posh`)
- Sexual-harassment complaint workflow with full anonymity option.
- ICC (Internal Complaints Committee) member panel.
- Investigation timeline, evidence locker, decision letter.
- Statutory annual report generation.

---

# 13 · Reports & MIS

### 13.1 Dashboard (`/app/reports`)
- Headcount, attrition, gender mix, age distribution.
- Cost-to-company aggregate, payroll trend.
- Leave consumption, attendance %.

### 13.2 Compensation (`/app/reports/compensation`)
- Salary band analysis, percentile distribution per role.
- CTC variance YoY.
- Compa-ratio (employee vs midpoint of band).

### 13.3 Custom Builder (`/app/reports/builder`)
- Drag fields from any module → table preview.
- Filter / group / sort / pivot.
- Export to CSV/Excel.
- Save report → re-run anytime.

---

# 14 · Self-service workspaces

### 14.1 Employee Workspace (`/app/employee`)
- Personal dashboard: today's attendance, pending approvals on me, leave balance, payslip shortcut, helpdesk tickets, performance goals snapshot, birthday-of-the-day.
- Quick actions: punch in/out, apply leave, file expense, raise ticket.

### 14.2 My Profile (`/app/me`)
- View + edit personal details, family declarations, emergency contacts.
- Change password.
- Document tray (Aadhaar, PAN, qualifications).
- Bank-account update with HR approval.

### 14.3 My Submissions (`/app/my-submissions`)
- All my requests across modules in one feed: leaves, expenses, regularizations, tickets, comp-off, PO requests, etc.
- Status tracking with the full approval chain visible.

### 14.4 Manager Workspace (`/app/manager`)
- My team list, leave calendar, pending approvals badge, team performance snapshot.
- Quick actions: approve all, give feedback, mark 1-on-1.

---

# 15 · Native Mobile App (Android live · iOS pending TestFlight)

13 dedicated native screens, **not** a WebView wrapper:
1. Login + biometric unlock
2. Home dashboard
3. **Attendance** — punch in/out with **selfie + geofence verification + offline cache**
4. **Field visits** — start/end visit with selfie, location ping every 10 min, polyline upload
5. Leave (apply + history)
6. Expenses (with **camera receipt capture**)
7. Payslips (download PDF)
8. Loans (request + EMI tracker)
9. Helpdesk (raise + track tickets)
10. Knowledge Base (read articles offline)
11. Notifications feed
12. Profile
13. OTA updates (auto-pull on launch via Expo EAS Updates)

**Hybrid WebView** for any module not yet ported — so feature parity is 100% from day 1.

---

# 16 · Platform & Reseller (B2B)

### 16.1 Platform Dashboard (`/app/platform`) — super-admin only
- All companies, all resellers, all employees aggregate counters.
- Revenue tracker (MRR / ARR / churn placeholder until Stripe).
- System health: backup status, error rate, MAU.

### 16.2 Resellers (`/app/resellers`)
- Reseller master: name, contact, brand color, custom domain (mapping pending).
- Wholesale price per plan tier (Pro / Enterprise / Custom).
- Commission rate per company.

### 16.3 Companies (`/app/companies`)
- Per-company plan, seat count, billing status, owner reseller.
- Activate / freeze / archive.
- Module entitlements toggle per company.

### 16.4 Modules (`/app/modules`)
- Catalog of every feature module; toggle on/off per company.
- Used by the entitlement gate that hides UI + blocks API for disabled modules.

### 16.5 Reseller Workspace (`/app/reseller`)
- A reseller sees only their companies.
- Custom retail pricing per company.
- Commission earnings dashboard.

### 16.6 Billing & Modules (`/app/billing`)
- Per-company invoice history (mocked until Stripe).
- Plan upgrade / downgrade self-service.
- Payment-method-on-file.

*(Roadmap: Stripe subscriptions + Stripe Connect for reseller payouts.)*

---

# 17 · Cross-cutting infrastructure

### 17.1 Authentication & security
- JWT with bcrypt-hashed passwords (12-round).
- **Strict password policy**: 10+ chars, upper + lower + digit + symbol.
- **Account lockout** after 5 failed attempts for 15 minutes.
- **slowapi rate limiter** on auth endpoints.
- Audit log on every administrative action.
- Daily MongoDB backup cron with rotation.

### 17.2 Notifications
- In-app feed (`/app/notifications`).
- Per-event email templates (approval-pending, payslip-ready, leave-decision, etc).
- Per-user mute & quiet-hours.
- Dedup keys to prevent notification storms.

### 17.3 Audit log
- Every admin action: who, what, when, before/after diff.
- Filterable by user, action type, date range.
- 90-day retention default, configurable.

### 17.4 Module entitlement gate
- `requires_module("expense")` decorator on FastAPI routes.
- React `<EntitlementGate feature="recruitment">` HOC on UI.
- Feature flips immediately on entitlement change — no logout needed.

### 17.5 Tenant isolation
- Every query filtered by `company_id` in the route handler.
- Pydantic response models block accidental field leakage.
- 76 pytest cases asserting cross-tenant isolation specifically.

---

# 18 · By the numbers (April 2026)

| Metric | Today |
|---|---|
| Frontend pages | **55** |
| Backend API endpoints | **251** |
| Backend routers | **51** |
| MongoDB collections | **~75** (110 indexes) |
| Production code (LOC) | **46,600** (27K Python · 20K React) |
| Native mobile screens | **13** |
| Backend regression tests | **76** (all green) |
| Demo seed | 44 employees · 5 branches · 18 docs · 16 recurring · 10 budget envelopes · 12 letters · 2 kit templates · 50+ vendors |
| Live URL | https://arcstone.co.in (Hetzner Frankfurt, HTTPS, daily backups) |

---

# 19 · Roadmap (next 90 days)

### Q3 2026 — Monetisation & polish
- Stripe subscription billing (per-company plans + seat-based pricing)
- Stripe Connect reseller commissions (split payouts, monthly statements)
- Migrate base64 file storage → S3-compatible object storage
- iOS TestFlight build
- Shift roster bulk-assign grid UI

### Q4 2026 — Enterprise readiness
- **Phase 5 — Fixed Asset Management** (depreciation SLM/WDV, custodian transfer, write-off, AMC linkage)
- **Phase 6 — SOPs · Idea Factory · Recruitment Referral** (with hire+90-day retention bonus auto-trigger)
- DPDP-compliant data export & right-to-erasure endpoints
- 2FA (TOTP) for admin accounts
- SAML/OIDC SSO + SCIM provisioning
- Sentry error tracking integration

### 2027
- Multi-country payroll engines (UAE, Singapore, KSA — same statutory layer pattern as Indian PT)
- Workflow marketplace — pre-built chains for Travel, Procurement, Recruitment that customers install in one click
- Reseller white-label storefront with their own domain mapping
- Discussion forum / announcements feed
- Branded career-page builder
- LMS-Lite training module

---

*Prepared April 2026 · Arcstone HRMS Enterprise · arcstone.co.in*
