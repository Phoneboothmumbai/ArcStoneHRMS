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

### Feb 24, 2026 — Module Switcher + Command Palette (⌘K) 🎛️
**The sidebar reinvented for a multi-module world.** 170/170 backend tests still green.

- **`/app/frontend/src/lib/moduleRegistry.js`** — single source of truth: 11 module definitions (8 active + 3 upgrade-only: Performance, ATS, Reports), each with id / label / icon / color / landing / roles / entitlement / items. Add a new module = one entry here and it auto-appears in switcher, palette, and URL-routing. Role workspaces for super_admin/reseller/employee/branch_manager kept separate (simpler flat sidebars).
- **`<ModuleSwitcher>`** (top-left header, Notion / Linear style) — popover with colored chips, descriptions, "ACTIVE" badge on the current module, and a separated "⨯ UPGRADE TO UNLOCK" section showing locked modules with 🔒 and a one-click upsell toast that opens Billing & Modules.
- **`<CmdK>`** (⌘K / Ctrl+K anywhere) — `cmdk`-based command palette searching: all navigable pages tagged by module, quick actions ("Apply for leave", "New payroll run", "Generate letter", "Compute F&F", "Publish a policy"), and lazy-loaded employee directory fuzzy search (HR/managers only). Also visible as a "Search…" button in the header.
- **URL-aware sidebar**: `moduleFromPath()` detects which module a route belongs to → sidebar auto-renders that module's nav. Bookmarked links (`/app/payroll-runs`, `/app/letters`) automatically switch context.
- **Breadcrumb header**: every page now shows `MODULE · Page title` in the top bar instead of just the role name. Sidebar also has a color-chip "Module" label right under the Arcstone brand mark.
- **AppShell refactor**: replaced the 60-line `NAV_BY_ROLE` constant with 20 lines driven by the registry, preserving all existing data-testids and behavior.

Verified via screenshot:
- HR admin opens → People module default sidebar (7 items). Clicks switcher → Notion-style popover with 8 active + 3 locked modules. Clicks Payroll → sidebar collapses to 3 items (Compensation / Payroll Runs / F&F & Loans), URL auto-navigates to `/app/payroll-runs`, chip turns amber.
- ⌘K → typed "letter" → instantly shows Letters page (Policies & Letters module tag) + Policies page + "Generate letter" quick action.
- Employee login → flat 8-item sidebar (My Workspace / My Profile / Attendance / Leave / Expenses & Travel / Policies / Requests / My Submissions), NO module switcher shown (by design), ⌘K search is available.

### Feb 24, 2026 — HR Web UI + PDF generation batch (earlier today)
**All 154/154 backend + 16/16 new UI-backing tests passing.**

- **PDF payslips + letters** via reportlab (`pdf_render.py`):
  - `GET /api/payslips/{id}/pdf` — styled 1-page payslip with header, employee grid, earnings/deductions/employer tables, NET PAY banner. Permission-aware: employee only if run is published.
  - `GET /api/letters/{id}/pdf` — markdown → styled PDF with signatures block.

- **6 new HR web UI pages**:
  - `/app/payroll-runs` — **Payroll run dashboard**: 4 stat cards (total/gross/net/published), monthly cycle list with draft→compute→finalise→publish lifecycle buttons per row, inline payslip drill-down with 4 statutory CSV download buttons (Bank Advice, Form 24Q, PF ECR, ESIC) + per-employee PDF payslip download.
  - `/app/fnf-loans` — **F&F & Loans**: 2 tabs. F&F tab with settlement list + Compute dialog (employee picker, LWD, notice served, bonus, other deductions) + detailed breakdown dialog showing pending salary/leave encashment/gratuity/notice recovery/loan recovery + one-click approve + mark-paid with NEFT ref prompt. Loans tab with list + new-loan dialog.
  - `/app/policies` — policy CRUD with markdown body, category badges, publish/archive, acknowledgement count visible to HR.
  - `/app/letters` — Templates tab (CRUD with merge-field hint: `{{employee_name}}`, `{{doj}}`, `{{ctc_annual}}`, `{{today}}`) + Generated tab (pick template + employee → render → PDF download).
  - `/app/assets` — 4 stat cards (total/assigned/available/book value w/ cost hint), register table with tag/item/category/status/assignee/cost/book value + Assign + Return actions, condition prompt.
  - `/app/expenses` — 2 tabs. Claims tab with stat cards + new-claim dialog (multi-item with category/date/amount/desc + Add/Remove rows + live total) auto-submits + HR approve/reject buttons. Travel tab with 7-state lifecycle actions (approve/reject/book/complete).

- **Sidebar updates** (`AppShell.jsx`):
  - company_admin gains: Payroll runs, F&F & Loans, Expenses & Travel, Assets, Letters, Policies.
  - employee gains: Expenses & Travel (gated by `expense` module), Policies.
  - All 6 new HR items gated appropriately (Payroll/FnfLoans behind `payroll` module, Expenses behind `expense` module).

- **ModulesContext race** verified FIXED (re-tested — full sidebar renders in <1s after login, no reload required). Iter-9 fix holds.

- **Installed dep**: `reportlab==4.4.10` (added to `backend/requirements.txt`).

### Earlier this session
- **📱 Mobile app v0.1** (Expo SDK 51) — 6 screens (login+biometric, home, attendance geo check-in/out, leave, approvals, profile). Run via `cd /app/mobile && npx expo start`.
- **💰 Phase 2B** — Monthly payroll run engine (compute w/ LOP pro-rata, finalise, publish, reopen).
- **📊 Phase 2C** — Investment declarations + 4 statutory CSV exports (Bank Advice / Form 24Q / PF ECR / ESIC).
- **🎯 Phase 2D** — F&F settlement + loans with auto-close on paid.
- **📋 Phase 1E** — Policy library + company settings (fiscal year helper).
- **✉️ Phase 1F** — Letter templates + merge fields + e-sign.
- **💻 Phase 1G** — Asset register + assignment flow.
- **🧾 Phase 1H** — Expense claims + travel requests.
- **Phase 2A polish** — Payroll wired + sidebar + statutory math preserved.
- **Phase 1A/B/C/D/M** — Lifecycle, Leave deepening, Attendance deepening, Notifications, Knowledge Base.
- **Phase 0** — Module entitlement framework.

## Backlog

### P0 (done ✅)
- ~~Phase 2A/2B/2C/2D — Payroll India end-to-end.~~
- ~~React Native mobile app v0.1.~~
- ~~Phase 1E/1F/1G/1H — Policy, Letters, Assets, Expense+Travel.~~
- ~~HR web UI for all new phases.~~
- ~~PDF generation for payslips + letters.~~

### P0 (next)
- **Form 16 PDF** render (annual TDS certificate) — currently JSON payload only.
- **Wire Expense submit → approval chain engine** (currently uses simple HR `/decide`).
- **Mobile v0.2** — Expo push notifications (+ backend `/api/push-tokens`), selfie on check-in, payslip PDF viewer, Knowledge Base tab.
- **Seed employee@acme.io with a CTC** so E2E tests can exercise employee-scoped payslip PDF path.

### P1
- **Phase 1J Performance** (OKR / PIP / 360 / 9-box) — second biggest sales trigger after payroll.
- **Phase 1K Recruitment / ATS** — job postings, candidate pipeline, interviews, offer letters (reuses Letters engine).
- **Phase 1L Reports & MIS** — headcount, attrition, DEI, custom builder.
- **Phase 1I Helpdesk + POSH**.
- **Reseller white-label** (logo, brand color, custom domain).
- **Stripe subscription billing + Connect**.
- **S3 migration** for document vault (currently base64).

### P2
- Procurement / Vendor Marketplace (RFQ sealed-bid, quote compare, PO chain).
- SSO (SAML / OIDC).
- Slack / Teams / Gmail / GCal integrations.
- Per-country compliance packs.
- SOC 2 / ISO 27001 track.
- Biometric attendance integration (deferred by user).
- Advanced approval engine (parallel chains, OOO delegation, auto-escalation).

## Next tasks
1. Form 16 PDF generation.
2. Wire expense approval chain.
3. Mobile v0.2 push + selfie + payslip viewer.
4. Phase 1J Performance module.
5. Reseller white-label.

## Architecture
- **4-tier tenancy**: Platform → Reseller → Company (Tenant) → Employees
- **Backend**: FastAPI + MongoDB (motor), JWT auth, RBAC, module-gating via `requires_module`
- **Web frontend**: React + Tailwind + shadcn/ui + phosphor-icons
- **Mobile**: Expo (React Native) SDK 51 — Employee + Manager personas
- **Approval engine**: Generic chain, walks manager hierarchy with configurable per-type workflows

## User personas
1. **Super Admin** — resellers, companies, platform metrics
2. **Reseller** — white-label, own customers, commission
3. **Company Admin / HR Admin** — employees, branches, approvals, payroll
4. **Branch Manager / Sub / Assistant** — team roster, approval queue
5. **Employee** — self-service: attendance, leave, requests, profile, payslip

## What's been implemented

### Feb 24, 2026 — Mega batch: Mobile app + Phase 2B/2C/2D + Phase 1E/1F/1G/1H
**All backend + tests green: 154/154 pytest passing.**

- **📱 Mobile app (Expo SDK 51)** at `/app/mobile`:
  - Screens: Login (+ biometric-unlock helper), Home (quick-stats + quick-actions), Attendance (geo-located check-in/out), Leave (balance + apply modal), Approvals (manager-only, approve/reject), Profile.
  - `AuthContext` with AsyncStorage token vault; `axios` client pointing at `REACT_APP_BACKEND_URL` via `expo-constants`.
  - Bottom-tab navigation that auto-shows Approvals tab only for managers.
  - Permissions declared for Face ID / fingerprint / camera / location.
  - Run: `cd /app/mobile && npx expo start` — scan QR with Expo Go.
  - Deferred to v0.2: push notifications wiring, selfie on check-in, payslip PDF viewer, KB.

- **💰 Phase 2B — Monthly payroll run engine** (`models_payroll_run.py`, `payroll_run_routes.py`):
  - `POST /api/payroll-runs` create draft run for YYYY-MM (dedup enforced per company).
  - `/compute` iterates all employees with current CTC, pro-rates by (paid_days / working_days) after fetching LOP from Phase 1B leave ledger; generates Payslip per employee with full line breakdown (earnings, deductions, employer_cost).
  - Working days = Mon-Sat minus declared holidays in the month.
  - Lifecycle: `draft → computed → finalised → published` with proper role gates. Super-admin can `reopen`.
  - On publish, employees get in-app notifications for their payslip.
  - Employees only see their OWN payslips and only after the run is `published`.

- **📊 Phase 2C — Statutory forms + bank files + declarations** (`models_statutory.py`, `statutory_routes.py`):
  - Investment declarations (Sec 80C / 80CCD(1B) / 80D / 80E / 80G / HRA / LTA / home-loan interest) per financial year, auto-created on first `GET /api/declarations/me`.
  - HR review endpoint approves/rejects line-by-line; approved declarations lock from further employee edits.
  - CSV exports (all attach Content-Disposition):
    - **Bank Advice** (NEFT): Sl, code, name, bank, IFSC, account, amount, narration.
    - **Form 24Q**: monthly TDS salary schedule per employee with PAN + taxable income.
    - **PF ECR 2.0**: UAN, EPF/EPS/EDLI wages (₹15k capped), 8.33% EPS vs EPF diff, NCP days.
    - **ESIC Monthly**: IP number, days, wages (skip if gross > ₹21k).
    - Form 16 JSON payload endpoint scaffold — PDF render in a follow-up.

- **🎯 Phase 2D — F&F settlement + loans + reimbursement** (`models_fnf.py`, `fnf_routes.py`):
  - Employee loans: personal/salary_advance/medical/housing, flat interest, auto-built amortisation schedule, status (active/closed/waived).
  - F&F compute engine — single endpoint calculates for any given last_working_day:
    - Pending salary days × daily rate (basic/30)
    - Leave encashment (encashable leave balance × basic/30)
    - Gratuity 15/26 × tenure years (only if ≥ 5 yr, capped ₹20L)
    - Notice period shortfall recovery (days × daily rate)
    - Outstanding loan recovery (all active loans summed)
    - Bonus pending + other deductions
  - Lifecycle: `draft → computed → approved → paid`; marking paid auto-closes active loans.

- **📋 Phase 1E — Policy & Settings** (`models_policy.py`, `policy_routes.py`):
  - `CompanyPolicy` CRUD with markdown body, categories (code_of_conduct / it_security / posh / travel / etc.), version, effective_from, acknowledgements array.
  - `POST /api/policies/{slug}/acknowledge` — click-wrap ack with IP + timestamp, dedup per employee.
  - `GET /api/policies/me/pending-acks` — lists policies the employee still needs to ack.
  - `CompanySettings` single-doc-per-tenant: fiscal year start month, payroll cutoff/pay day, week-off config, PF/ESIC/PAN/TAN/GSTIN/CIN, branding logo, timezone. Employees see a minimal branding subset.
  - `GET /api/company-settings/fiscal-year` helper returns current FY string.

- **✉️ Phase 1F — Letters & e-Sign** (`models_letters.py`, `letters_routes.py`):
  - Letter templates (offer / appointment / experience / relieving / NOC / promotion / warning / address_proof / salary_increment / travel_authorization / other) with markdown body + `{{merge}}` fields.
  - Auto-extracts merge fields from template body if not explicitly listed.
  - `POST /api/letters/generate` — renders template with auto-pulled employee data (name, code, designation, DOJ, CTC, gross, today) merged with custom values.
  - `POST /api/letters/{id}/sign` — click-wrap / OTP / draw / docusign stub signatures with IP + timestamp; employees can only sign their own letters.

- **💻 Phase 1G — Asset Management** (`models_assets.py`, `assets_routes.py`):
  - Asset register: tag (unique per company), category (laptop / desktop / mobile / access_card / vehicle / etc.), make / model / serial, purchase_cost + purchase_date + SLM/WDV depreciation with useful_life_years, warranty_until, vendor.
  - `current_book_value` computed on-the-fly from method + years elapsed.
  - Assignment flow: `POST /asset-assignments/assign` locks asset to employee, `/return` unlocks with condition (excellent/good/fair/damaged/lost → asset status flows back to available/maintenance/lost).
  - `/me` endpoint returns employee's currently-assigned assets (financials redacted).
  - Employee acknowledgement receipt endpoint.

- **🧾 Phase 1H — Expense + Travel** (`models_expenses.py`, `expenses_routes.py`):
  - Expense claims with multi-item receipts (base64, 2 MB guard), 14 categories (travel_flight/hotel/taxi/mileage/per_diem, meals, client_meeting, office_supplies, subscription, training, phone_internet, fuel, medical, other), optional project code + travel_request linkage.
  - Lifecycle: `draft → submitted → approved|rejected → reimbursed` (with link to payroll run).
  - Travel requests with destinations, mode (flight/train/road/mixed), accommodation flag, advance_required, estimated_cost. Statuses: draft → submitted → approved/rejected → booked → completed/cancelled.
  - Gated behind the `expense` module.

### Feb 24, 2026 — Phase 2A polish
- Wired `/app/payroll` route in `App.js`; added **Payroll** sidebar entry (₹ CurrencyInr icon); all 3 backend payroll routers gated via `router.dependencies`.
- Fixed ModulesContext race (now refetches on login), fixed non-idempotent `_ensure_mod` seed (flip-forwards disabled→active), fixed `leave-admin/types` reactivate-after-soft-delete, migrated legacy leave tests to `leave_type_id` v2 API.

### Feb 23, 2026 — Earlier phases
- **Phase 1D** Notifications Engine (in-app bell, prefs, Resend scaffolded).
- **Phase 1C** Attendance deepening (shifts, worksites, regularization, overtime, timesheets).
- **Phase 1B** Leave deepening (9 India types, policies, balance ledger, holidays).
- **Phase 1M** Self-Service Foundations (Knowledge Base, tooltips).
- **Phase 1A** Employee Lifecycle Core (profile, document vault, onboarding, offboarding).
- **Phase 0** Module entitlement framework (16 modules, 3 bundles, pricing, trial, activation requests, audit).
- Tenant isolation hardened; multi-currency; data residency; tenant export.

## Backlog — prioritized

### P0 (done ✅)
- ~~Phase 2A / 2B / 2C / 2D — Payroll India end-to-end.~~
- ~~React Native mobile app v0.1.~~
- ~~Phase 1E / 1F / 1G / 1H — Policy, Letters, Assets, Expense+Travel.~~

### P0 (next)
- **Frontend pages** for new phases — Phase 2B/2C/2D/1E-1H currently live as backend + mobile only. HR-facing Admin UI pages needed: Payroll Run dashboard, Statutory Exports hub, F&F Settlement list, Loans, Policies, Letters editor+viewer, Asset register + assignment UI, Expenses inbox + travel.
- **PDF generation for payslips + letters + Form 16** (use ReportLab or WeasyPrint).
- **Expense approval chain wiring** — hook into existing approval engine (currently simple HR decide).
- **Mobile v0.2** — push notifications, selfie capture on check-in, payslip PDF viewer, KB browsing.

### P1
- **Phase 1I** Helpdesk + POSH.
- **Phase 1J** Performance (OKR, PIP, 360, 9-box).
- **Phase 1K** Recruitment / ATS.
- **Phase 1L** Reports & MIS (custom builder, attrition, DEI).
- Procurement / Vendor Marketplace (RFQ sealed-bid, quote comparison, PO chain).
- Stripe subscription billing + reseller commission payouts.
- White-label per reseller: logo, brand color, custom domain.
- Biometric Attendance Integration (user deferred).
- Document vault migrate base64 → S3.

### P2
- SSO (SAML / OIDC).
- Audit log exports.
- Slack / Teams / Google Calendar / Gmail integrations.
- SOC 2 / ISO 27001 track.
- Per-country compliance packs (labour law, holidays, payroll rules beyond India).

## Next tasks
1. Ship HR-facing web UI pages for Phase 2B/2C/2D (Payroll Run dashboard, Statutory Exports, F&F & Loans).
2. Ship HR-facing web UI for Phase 1E-1H (Policies, Letters, Assets, Expenses).
3. PDF generation for payslips + letters + Form 16.
4. Mobile v0.2 push notifications + selfie + payslip viewer.
5. Hook Expense claims into the approval chain engine.
