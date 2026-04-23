# Arcstone HRMS SaaS — Product Requirements Document

## Original problem statement
> Build an HRMS SaaS with a reseller layer in between. Scale: 100s of companies, 1000s of employees. Need mobile apps for employees, employee login, HR admin login. Multi-level approval system. Companies with offices in multiple countries, regions, locations. Different employee types (WFH, WFO, field, hybrid). Employees can request products/services. Branches have hierarchy (manager, sub manager, assistant manager). Employees can request products/services to main branch or vendors.

## Architecture
- **4-tier tenancy**: Platform → Reseller → Company (Tenant) → Employees
- **Multi-tenancy**: shared DB, shared schema, `company_id` discriminator
- **Backend**: FastAPI + MongoDB (motor), JWT auth, RBAC, module-gating via `requires_module`
- **Frontend**: React + Tailwind + shadcn/ui + phosphor-icons
- **Approval engine**: Generic chain, walks manager hierarchy with configurable per-type workflows

## User personas
1. **Super Admin** — resellers, companies, platform metrics
2. **Reseller** — white-label, own customers, commission
3. **Company Admin / HR Admin** — employees, branches, approvals
4. **Branch Manager / Sub / Assistant** — team roster, approval queue
5. **Employee** — self-service: attendance, leave, requests, profile

## What's been implemented

### Feb 24, 2026 — Phase 2A COMPLETE + regression hardening
- **Phase 2A wired end-to-end**: Payroll India (salary components, structures, CTC assignment) backend + frontend now live.
  - Backend: all 3 payroll routers (`salary-components`, `salary-structures`, `compensation`) gated behind `requires_module("payroll")` via `router.dependencies`.
  - Frontend: `/app/payroll` route wired in `App.js`; "Payroll" sidebar entry (₹ CurrencyInr icon) added under `company_admin` nav with module-based filtering.
  - Sidebar nav now supports optional `module` key — items filtered via `useHasModule` so disabled modules hide their links.
  - ACME seeded with `payroll` module active (price_source=retail).
- **India statutory math verified** (Phase 2A): PF 12% capped at ₹15k basic; ESIC 0.75%/3.25% if gross ≤ ₹21k; PT flat ₹200; Gratuity 4.81% of basic; TDS placeholder (Phase 2B).
- **Critical bug fix — ModulesContext race**: `ModulesProvider` was fetching `/api/modules/mine` at mount (pre-login), hitting 401 and locking into `["base_hrms"]` fallback, which hid every module-gated nav item until a manual reload. Fixed by subscribing to `AuthContext` user state and refetching on user changes (login/logout/tenant switch).
- **Critical bug fix — non-idempotent seed**: `_ensure_mod` bailed when a `company_modules` row existed even with `status=disabled`. Now flip-forwards to `active` when seed requests active.
- **Leave-admin dup-code fix**: `POST /api/leave-admin/types` now reactivates soft-deleted rows with the same code instead of 500-ing on the unique index.
- **Approval workflow matcher** aligned with Phase 1B leave types: seeded workflows now use code-based match keys (`cl`, `lop`) instead of legacy names (`casual`, `unpaid`). Existing rows migrated inline.
- **Test suite**: 144/144 backend pytest passing (up from 134/144). Legacy tests in `test_hrms_backend.py` and `test_workflows.py` migrated to the new `leave_type_id` v2 API; added autouse cleanup fixtures to prevent CL balance exhaustion across modules; dates moved to relative `_future_weekday(offset)` so notice-days policy stops blocking.

### Feb 23, 2026 — Earlier phases
- **Phase 1D complete** — Notifications Engine. In-app bell (60-s polling, unread badge), preferences page (channel toggles, digest cadence, mute-events, dedup), event hooks on approvals + onboarding + offboarding, Resend email scaffolded. 13/13 pytest.
- **Phase 1C complete** — Attendance deepening. Shifts, geo-fence sites, regularization, overtime, timesheets, monthly register. 17/17 pytest.
- **Phase 1B complete** — Leave deepening. 9 India leave types, per-grade policies, balance ledger, 22 India 2026 holidays, team calendar, admin UI, gender filters. 18/18 pytest.
- **Phase 1M complete** — Self-Service Foundations. Knowledge Base with markdown articles, search, categories, `<HelpHint>` tooltips on statutory fields, admin CRUD. 8 seed articles.
- **Phase 1A complete** — Employee Lifecycle Core. Rich profile (10 sections), document vault (12 categories), onboarding templates + instances (12 tasks / 5 stages), offboarding with clearance + exit interview + auto-generated letters. 19/19 pytest.
- **Phase 0 complete** — Module entitlement framework: 16 modules, 3 bundles, two-tier pricing (retail/wholesale) with role-gated visibility, trial auto-expiry, 402 Payment Required on gated routes, activation request flow, audit log. 61/61 pytest.
- **Tenant isolation** — TenantDB query wrapper auto-injects `company_id`; `requires_module` + `require_roles` deps; integrity scanner; defence-in-depth.
- **Multi-currency & data residency** — Price `{amount, currency}` model; Company `region` field for DPDP compliance; tenant export → zip of all scoped collections.

## Backlog — prioritized

### P0 (next up)
- **Phase 2B — Monthly payroll run engine**: compute PF/ESIC/PT/TDS/LOP per month per employee, payslip PDF, lock/unlock cycle, bulk actions.
- **Phase 2C — Statutory forms & bank files**: Form 16, Form 24Q, 3A, 6A, NEFT bank advice CSV, investment declarations portal.
- **Phase 2D — F&F settlement engine**: loans, reimbursement-to-payroll pipeline, separation payout.
- **Phase 1E** — Policy & Settings: company settings, fiscal year, policy library (force-acknowledge).
- **Phase 1F** — Letters & e-Sign: offer/experience/relieving templates with merge fields.
- **Phase 1G** — Asset Management + migrate document vault from base64 to S3.
- **Phase 1H** — Expense + Reimbursement + Travel.
- **React Native mobile app** — Employee + Manager.
- **White-label per reseller** — logo, brand color, custom domain.

### P1
- **Phase 1I** — Helpdesk + POSH compliance.
- **Phase 1J** — Performance (OKR, PIP, 360, 9-box).
- **Phase 1K** — Recruitment / ATS.
- **Phase 1L** — Reports & MIS (custom builder, attrition analytics).
- Procurement / Vendor Marketplace Phase 2 — RFQ sealed-bid, quote comparison, PO chain.
- Stripe subscription billing + reseller commission payouts.
- Biometric Attendance Integration (user deferred).

### P2
- SSO (SAML / OIDC), audit log exports, Slack/Teams/GCal integrations, SOC 2 track, per-country compliance packs.

## Next tasks
1. **Phase 2B — Monthly payroll run engine** (the big payroll unlock)
2. **Phase 1E — Policy & Settings** (smaller ship, clears settings debt)
3. **Phase 1F — Letters & e-Sign**
4. Continue through remaining P0 items in order.
