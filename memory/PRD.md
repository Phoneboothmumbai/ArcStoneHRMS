# Arcstone HRMS SaaS — Product Requirements Document

## Original problem statement
> Build an HRMS SaaS with a reseller layer in between. Scale: 100s of companies, 1000s of employees. Need mobile apps for employees, employee login, HR admin login. Multi-level approval system. Companies with offices in multiple countries, regions, locations. Different employee types (WFH, WFO, field, hybrid). Employees can request products/services. Branches have hierarchy (manager, sub manager, assistant manager). Employees can request products/services to main branch or vendors.

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
