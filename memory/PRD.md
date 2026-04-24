# Arcstone HRMS SaaS — Product Requirements Document

## Original problem statement
> Build an HRMS SaaS with a reseller layer in between. Scale: 100s of companies, 1000s of employees. Need mobile apps for employees, employee login, HR admin login. Multi-level approval system. Companies with offices in multiple countries, regions, locations. Different employee types (WFH, WFO, field, hybrid). Employees can request products/services. Branches have hierarchy (manager, sub manager, assistant manager). Employees can request products/services to main branch or vendors.

## Architecture
- **4-tier tenancy**: Platform → Reseller → Company (Tenant) → Employees
- **Backend**: FastAPI + MongoDB (motor), JWT auth, RBAC, module-gating via `requires_module`
- **Web frontend**: React + Tailwind + shadcn/ui + phosphor-icons
- **Mobile**: Expo (React Native) SDK 51 — Employee + Manager personas
- **PDF engine**: reportlab (payslips, letters, future Form 16)
- **Approval engine**: Generic chain, walks manager hierarchy with configurable per-type workflows

## What's been implemented

### Apr 24, 2026 — Phase 1K + 1L + 1I: Recruitment, Reports, Helpdesk & POSH 🎯
**3 major P0 modules shipped in a single push — completes the "full HRMS" pitch.**

**Phase 1K — Recruitment / ATS** (`models_ats.py` · `routers/ats_routes.py`, gated by `requires_module("ats")`)
- `/api/requisitions` — Job requisitions with auto-incrementing codes (JR-YYYY-####), full lifecycle (draft → open → on_hold → closed → cancelled).
- `/api/candidates` — Candidate CRUD + 11-stage pipeline (applied → screening → shortlisted → interview → offer_pending → offer_sent → offer_accepted/declined → hired/rejected/withdrawn). Dedupe on (email, requisition). Notes timeline per candidate.
- `/api/interviews` — Schedule w/ interviewers, auto-advance candidate stage; scorecards aggregate overall outcome by most-common vote.
- `/api/offers` — draft → send → accept/decline, auto-generates offer letter from a `letter_templates` template with merge fields (candidate_name, job_title, annual_ctc, doj, etc.).
- `/api/candidates/{id}/convert-to-employee` — One-click converts accepted candidate → Employee record (auto EMP#### code) + starts default Onboarding instance with tasks.
- `/api/careers/{company_id}` + `/api/careers/{cid}/apply` — **Public unauthenticated** careers-page endpoints for public job board + application intake.

**Phase 1L — Reports & MIS** (`routers/reports_routes.py`, gated by `requires_module("analytics")`)
- `/api/reports/dashboard-kpis` — 6 KPIs for HR home (employees, reqs, offers, leaves, tickets, payslips this month).
- `/api/reports/headcount` + `.csv` — By status / department / branch / employee_type / gender / role. Pre-resolves UUIDs → names.
- `/api/reports/attrition?months=12` — Rolling 12mo annualised rate, by_month chart, by_reason.
- `/api/reports/tenure` — Buckets (<1/1-2/2-5/5-10/10+ yr) + avg years.
- `/api/reports/compensation-bands` — Band distribution + by_department breakdown.
- `/api/reports/leave-summary?year=...` — Yearly leave analytics.
- `/api/reports/builder/{entities,run}` — **Custom report builder**. Pick 1 of 6 entities × dimensions whitelist, filters, JSON or CSV export.

**Phase 1I — Helpdesk + POSH** (`models_helpdesk.py` · `routers/helpdesk_routes.py`, gated by `requires_module("helpdesk")`)
- `/api/ticket-categories` — HR-managed queues with SLA hours (first-response + resolve).
- `/api/tickets` — Ticket lifecycle (open → in_progress → on_hold → resolved → closed → reopened). Comments (public + internal). Auto SLA due-dates. Employee rating post-resolve. `/stats/overview` with SLA-breached count.
- `/api/posh/*` — **Confidential PoSH complaint flow** (Prevention of Sexual Harassment Act, India). Committee-only visibility. Anonymous intake strips complainant identity. Investigation log (timeline of events). Status lifecycle (filed → under_review → investigating → hearing → decision_pending → resolved_upheld/dismissed/withdrawn) with outcome.

**Frontend** (3 new pages with 9 routes):
- `pages/Recruitment.jsx` — Overview (4 KPI + open reqs + recent cands), Requisitions list, **Kanban-style candidate pipeline** (9 columns) on req detail, Offers with Send/Accept/Decline/Convert buttons.
- `pages/Reports.jsx` — Dashboard (6 KPIs + 4 bar-list charts + CSV), Compensation bands, Custom Report Builder (entity × dimension toggles → Run/Export CSV).
- `pages/Helpdesk.jsx` — Helpdesk (stats + ticket list + detail dialog w/ comments), Categories (HR), **PoSH** (red confidentiality banner + anonymous-toggle filing + committee-only investigation log).

**Partial-completions (previously marked 🟡):**
- **Form 16 PDF** — `/api/payroll-runs/companies/{cid}/exports/form-16/{emp_id}/pdf` renders a Part B TDS certificate with employee block + 4 sections (Gross Salary / Exemptions / Deductions / Taxable Income) + Monthly Breakup table. `pdf_render.py::render_form16_pdf`.
- **Letters bulk PDF** — `POST /api/letters/bulk-pdf` accepts `letter_ids[]`, returns a ZIP with one PDF per letter (HR-only, max 200).

**Navigation & UX:**
- Module registry: unlocked `ats`, `analytics`, `helpdesk` modules; legacy locked entries hidden. Module Switcher respects `hidden:true` flag.
- Employee workspace: added Helpdesk + PoSH quick links (gated by entitlement).
- Manager workspace: added Recruitment + Helpdesk.
- ⌘K palette: added "Raise a helpdesk ticket", "File PoSH complaint", "New job requisition", "Custom report builder", "Open reports dashboard" + 2 more for HR.

**Seed:** `performance`, `ats`, `analytics`, `helpdesk` all active for ACME Global by default.

**Tests — 26/26 green.** `/app/backend/tests/test_iteration12_modules.py` covers ATS×7 (auto-code, status transitions, careers apply dedupe, interview stage auto-advance, scorecard rollup, offer flow, convert-to-employee with onboarding), Reports×6 (KPIs, headcount CSV Content-Disposition, attrition/tenure/comp-bands, builder JSON+CSV), Helpdesk×6 (SLA due-date computation, HR-only stats, visibility rules), POSH×3 (anonymous identity-strip, non-committee 403, committee ACL), Form16×3 (JSON + PDF %PDF header + cross-tenant 403), module-gating×1 (402 on disabled).

**Known minor items** (tracked in backlog):
- `_next_code` / employee_code generation not race-safe — needs counter collection with `findOneAndUpdate($inc)` before 100+ concurrent hires. Non-blocking at current scale.
- ModulesContext first-render race — carry-over from iter 9-11. User must reload once after login for newly-unlocked module chips to appear. localStorage cache would fix.
- Recruitment.jsx / Reports.jsx / Helpdesk.jsx heading toward 700+ lines each — split per page into separate files later.
- Seed data has too many employees with unparseable `joined_on` — breaks tenure chart; data hygiene task.

### Apr 24, 2026 — Phase 1J: Performance Management
[See previous entry below]
**Shipped the second-biggest HRMS revenue driver (after Payroll). 24/24 new backend tests + 100% frontend flows passing.**

**Backend** (`models_performance.py` · `routers/performance_routes.py`, all gated behind `requires_module("performance")`):
- **Review cycles** — `POST/GET/DELETE /api/review-cycles` + `POST /api/review-cycles/{id}/status` (draft → open → in_review → calibration → closed). Cadence: annual / half-yearly / quarterly / monthly / adhoc. Per-cycle competencies list (default: Ownership/Collaboration/Impact/Communication/Craft).
- **Goals & OKRs** — `POST/GET/PATCH/DELETE /api/goals` + `POST /api/goals/{id}/kr-progress`. Weighted KR progress auto-computes overall (boolean/percent/number/currency metric types). Status auto-derives (active → at_risk @ <40% → on_track @ 70% → completed @ 100%). Employee can only update own KRs; HR/manager can edit any. Alignment chain via `aligned_to_goal_id`. `/api/goals/me/summary` for employee dashboard.
- **Reviews** — `POST/GET /api/reviews` + `/{id}/submit` + `/{id}/share`. Types: self / manager / peer / skip_level / upward. Auto-dedupe on (cycle, subject, reviewer, type). Rating 1-5 on overall + each competency, strengths/improvements/comments, promotion recommendation. Subject can view only after HR shares.
- **9-Box Grid** — `POST/GET /api/nine-box` with UPSERT semantics per (cycle, employee). Auto-computes box 1–9 from performance × potential (low/medium/high each) with 9 labeled cells (Underperformer → Star Future Leader). HR-only.
- **PIPs (Performance Improvement Plans)** — `POST/GET /api/pips` + `/milestones/{mid}/status` + `/outcome`. 30/60/90-day plans with milestone tracking (pending → met/missed). Outcome (passed/failed/extended/terminated) closes the PIP.

**Frontend** (all 6 pages in `pages/Performance.jsx` — routes `/app/performance` + `/goals` + `/reviews` + `/cycles` + `/nine-box` + `/pips`):
- **Overview** — 4 stat cards (Active goals, Avg progress, Pending reviews, Active PIPs) + 3 navigable tiles + Active-cycle banner + Recent goals table.
- **Goals** — Create goal w/ dynamic KR rows (title + current + target + weight). Each goal renders a progress bar + inline editable `current` input on every KR (owner-only, onBlur auto-submits via `/kr-progress`). Edit and delete.
- **Reviews** — HR "Assign review" dialog (cycle + subject + type + reviewer). Opens a review form w/ 5-pill overall rating, 5-pill per-competency grid, strengths/improvements/comments, promotion recommendation. HR can Share submitted reviews to the subject.
- **Cycles (HR)** — Full table w/ status-stepping buttons (Open → Start reviews → Calibrate → Close). Delete in draft/closed only.
- **9-Box (HR)** — Colored 3×3 grid w/ axis labels, each box labeled (Star — Future Leader / High Potential / Core Player / etc.), placements show as chips inside the target box. Cycle selector. Upsert via "Place" dialog.
- **PIPs** — List cards w/ concerns, milestones (Met/Missed buttons when pending), Close → outcome dialog.

**Module registry** — unlocked performance module (previously locked), 6 nav items (Overview / Goals & OKRs / Reviews / Review cycles (HR) / 9-Box (HR) / PIPs). Employee & branch_manager workspaces get quick links to `/app/performance/goals` + `/reviews` (gated by entitlement). ⌘K palette gained "View my goals", "Open review cycle", "Calibrate 9-Box".

**Seed** — `performance` is now auto-enabled for ACME Global on seed (db.py `_ensure_mod("performance")`).

**Tests** — `/app/backend/tests/test_phase1j_performance.py` (15) + `/app/backend/tests/test_phase1j_gating_and_tenancy.py` (9) — 100% pass. Validates: cycle lifecycle, KR progress math (weighted avg), employee-cannot-edit-others-goals, review dedupe, rating validation, 9-box upsert, PIP milestone flips, 402 on disabled module, cross-tenant isolation.

### Feb 24, 2026 — Module Switcher + Command Palette (⌘K) 🎛️
**The sidebar reinvented for a multi-module world.** 170/170 backend tests still green.

- **`/app/frontend/src/lib/moduleRegistry.js`** — single source of truth: 11 module definitions, 3 of which were upgrade-only (Performance now unlocked as of Apr 24).
- **`<ModuleSwitcher>`** Notion/Linear-style popover at top-left.
- **`<CmdK>`** fuzzy palette across every page + quick-actions + lazy employee directory.
- **URL-aware sidebar** auto-detects module from path.

### Feb 24, 2026 — HR Web UI + PDF generation batch
All 154/154 backend + 16/16 new UI-backing tests passing.
- PDF payslips + letters via reportlab.
- 6 new HR web UI pages: Payroll Runs, F&F & Loans, Policies, Letters, Assets, Expenses.

### Feb 24, 2026 — Phase 2 Payroll India + Phase 1E-H
- 📱 Mobile app v0.1 (Expo SDK 51) — 6 screens.
- 💰 Phase 2B payroll run engine, 📊 Phase 2C statutory exports (Bank Advice / Form 24Q / PF ECR / ESIC), 🎯 Phase 2D F&F + loans.
- 📋 Phase 1E Policies, ✉️ Phase 1F Letters, 💻 Phase 1G Assets, 🧾 Phase 1H Expenses.

### Earlier — Phase 1A/B/C/D/M + Phase 0
Lifecycle, Leave deepening, Attendance deepening, Notifications, Knowledge Base, Module entitlement framework.

## Backlog

### P0 (done ✅)
- ~~Phase 2A/2B/2C/2D — Payroll India end-to-end.~~
- ~~React Native mobile app v0.1.~~
- ~~Phase 1E/1F/1G/1H — Policy, Letters, Assets, Expense+Travel.~~
- ~~HR web UI for all new phases.~~
- ~~PDF generation for payslips + letters.~~
- ~~Phase 1J — Performance Management (OKRs / Reviews / 9-Box / PIPs).~~
- ~~Hetzner production deploy (supervisorctl `arcstone-backend`).~~
- ~~**Phase 1K — Recruitment / ATS** (job requisitions, candidate pipeline, interviews, offers, auto-convert).~~
- ~~**Phase 1L — Reports & MIS** (headcount, attrition, tenure, comp bands, custom builder, CSV).~~
- ~~**Phase 1I — Helpdesk + POSH**.~~
- ~~**Form 16 PDF**.~~
- ~~**Letters bulk PDF pack**.~~

### P0 (next — start charging money)
- **Stripe subscription billing** — per-company plan, module add-ons, usage-based seat count, invoices, dunning.
- **Stripe Connect — reseller commissions** — Reseller onboarding (KYC), split payouts, monthly commission statements.
- **Reseller white-label** — Custom logo, brand color, login theming, custom domain mapping (CNAME + auto SSL).

### P1 — remaining HRMS modules
- **Phase 1M — Learning / LMS** — Courses (video/PDF/quiz), enrollments, completion tracking, certifications, compliance training reminders.
- **Phase 1N — Engagement & Surveys** — Pulse surveys, eNPS, anonymous feedback, sentiment over time, action items.
- **Phase 1O — Shift Scheduling** — Rota planning, shift swaps UI, drag-drop calendar, overtime auto-flag, coverage rules.
- **Phase 1P — Advanced Analytics** — Workforce planning, attrition prediction (rule-based v1, ML later), cost analytics, manager dashboards.
- **Mobile v0.2** — Expo push notifications, selfie check-in, payslip PDF viewer, OKR view, expense OCR, offline queue.

### P1 — partial-completions remaining
- **Payroll** — Multi-country payroll (only India today), investment proof upload flow, one-click TDS computation preview.
- **Expense** — Wire into multi-level `workflow_engine` (currently simple `/decide`), per-diem policy engine, currency conversion, credit card import.
- **Performance** — Peer review request/invite flow UI, 360° consolidated report PDF, 1:1 meeting notes, calibration meeting workflow, goal cascade visualization.
- **Leave** — Comp-off flow UI, half-day UI, leave encashment requests UI (backend done).
- **Attendance** — Bulk regularization, shift-change approval. (Biometric integration deferred by user.)
- **Onboarding** — DocuSign/AdobeSign integration, DigiLocker/Aadhaar KYC auto-verify, BGV vendor integration.
- **Knowledge Base** — Full-text search, comments, "was this helpful?", featured articles.
- **Letters** — DocuSign integration (stub today), letter revocation workflow.

### P2
- Enterprise SSO (SAML 2.0, OIDC, SCIM 2.0).
- Per-country compliance packs (beyond India) + statutory calendars.
- Data-residency routing (EU / IN / US / SG regional Mongo).
- S3 migration for document vault (currently base64 in Mongo).
- Audit log exports (SOC 2 prep).
- Row-level PII encryption at rest (PAN, Aadhaar, bank).
- GDPR data-subject endpoints.
- Integrations: Slack, Teams, Gmail/GCal, WhatsApp Business, QuickBooks/Tally/Zoho, job-board syndication, DocuSign/AdobeSign, DigiLocker, BGV vendors.
- Race-safe code generation (JR-####, HELP-####, EMP#### counters via `findOneAndUpdate($inc)`).
- Split large Recruitment/Reports/Helpdesk pages into per-file subpages.
- ModulesContext localStorage cache to remove first-render flash.
- Seed data hygiene (tenure `joined_on` fixes).
- Procurement / Vendor Marketplace deepening (RFQ sealed-bid, quote compare, PO chain).
- Biometric attendance integration (deferred).
- Advanced approval engine (parallel chains, OOO delegation, auto-escalation).

## Next tasks
1. Stripe subscription billing (Wave 2 revenue enabler).
2. Stripe Connect for reseller commissions.
3. Reseller white-label (logo + brand + custom domain).
4. Phase 1M — Learning / LMS.
5. Phase 1N — Engagement & Surveys.
6. Phase 1O — Shift Scheduling.
7. Phase 1P — Advanced Analytics.
8. Mobile v0.2 (push, selfie, payslip PDF, OKR, expense OCR).

## User personas
1. **Super Admin** — resellers, companies, platform metrics
2. **Reseller** — white-label, own customers, commission
3. **Company Admin / HR Admin** — employees, branches, approvals, payroll, performance
4. **Branch Manager / Sub / Assistant** — team roster, approval queue, goals, reviews
5. **Employee** — self-service: attendance, leave, requests, profile, payslip, my goals, my reviews

