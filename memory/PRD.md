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

### May 5, 2026 — Pre-launch wiring audit + 4 orphaned features wired ✅
**Go-live readiness sweep.** Tested green by testing_agent (iteration_20 exposed 4 issues, iteration_21 retest 6/6 pass).

- **Static audit** — programmatic cross-check of:
  - 64 sidebar links → 75 React Router routes → 0 dead links found
  - 251 backend endpoints → 8 routers had ZERO frontend usage
  - 4 confirmed orphaned features identified (had backend, no UI)
- **4 new pages built** for previously orphaned APIs:
  - `/app/comp-off` (`pages/CompOff.jsx`) — employee comp-off requests + admin approval queue. Wires to `/api/comp-off/credits`. Sidebar entry under Time & Leave.
  - `/app/declarations` (`pages/InvestmentDeclarations.jsx`) — multi-section investment declarations (80C, 80D, HRA, etc.) with FY selector, draft/save/submit, item add/remove. Wires to `/api/declarations/me`. Sidebar entry under Payroll.
  - `/app/bulk-import` (`pages/BulkEmployeeImport.jsx`) — drag-drop CSV with dry-run preview (errors/warnings highlighted), 2 toggles (skip-existing, create-user-accounts), apply-only-when-clean. Multipart upload to `/api/employees/bulk-import/dry-run|apply`. Template download. Sidebar entry under People.
  - `/app/audit-log` (`pages/AuditLog.jsx`) — read-only event viewer with action-prefix filter + actor search, color-coded badges (create=green, update=amber, delete=red, login=violet). Sidebar entry under People (admin-only).
- **4 fixes from testing_agent iteration_20**:
  - **CRITICAL**: `_ensure_balance` returns dict not id — comp-off approve was 500ing. Now `bal = _ensure_balance(...); bal_id = bal['id']`.
  - `bulk-import` template missing `ctc_annual` column — added.
  - `GET /api/declarations/me` 400-ed for users without employee_id (admins) — now returns empty placeholder so the page mounts.
  - `EmployeeDashboard.jsx` raw `Promise.all` rejected on any partial failure — wrapped in try/catch.
- **Outcome**: Every backend feature now has a UI surface. Every sidebar link goes somewhere live. RBAC verified for 3 roles (super_admin, company_admin, manager, employee).

### May 4, 2026 — Phase 3+2 deepening: integrations across the spine 🔗
**5 integration gaps closed in one pass.** Tested green by testing_agent (iteration_19, retest_needed=false). Self-tested via curl: ₹500 expense → budget snapshot + approval request created; ₹600K travel pre-flight → "Hard block — would exceed by ₹257,000".

- **(a) Hierarchical approval on every expense path**:
  - `POST /api/expenses/{id}/submit` now creates an `approval_requests` row via `create_approval_request()` with `request_type=expense`, context `{cost, branch_id}` so the Approval Matrix can route by branch + amount.
  - `_create_expense_from_template` (recurring) wraps AUTO_SUBMIT in the same approval call; the `approval_request_id` is stored on both `expense_claims` and `recurring_expense_runs`.
  - `POST /api/procurement/po/{id}/submit-for-approval` does the same with `request_type=purchase_order`.
- **(b) Budget enforcement engine** (`budget_helpers.py` shared module):
  - `check_budget(db, ...)` returns the same shape as `/api/budgets/check`. Used by:
    - `POST /api/expenses` → pre-flight on create. 422 if `block=true` and not admin-overridden via `?override_budget=true`. Snapshot stored in `expense_claims.budget_check`.
    - `POST /api/procurement/po/{id}/submit-for-approval` → same pattern; snapshot in `purchase_orders.budget_check`.
  - Utilization = approved/submitted/awaiting_approval expense_claims + non-cancelled POs scoped to branch + (optional) department + cost-center + category.
  - Most-specific scope match wins; warn at envelope's `soft_warn_pct` (80% default), block at `hard_block_pct` (100% default), `allow_override` flag respected.
- **(c) Branch Manager command center** at `/app/branch-dashboard`:
  - `GET /api/branches/{id}/ops-summary` — single-shot endpoint returning critical/soon-expiring docs, recurring fires due in next 7d, this-month expense counts (pending/approved/runs), and budget envelopes over warn-threshold.
  - 4 KPI tiles (Docs expiring, Recurring due, Budget burn %, Pending approvals) + 4 detail panels + quick CTAs for upload-doc / add-recurring / one-time expense. Branch picker preserved.
  - Sidebar entry "Branch dashboard" added under People module.
- **(d) One-time office expense quick form** embedded on `/app/branch-operations` header (button `bops-onetime-btn`):
  - Live budget pre-flight box (calls `/budgets/check` debounced as user types) — green/amber/red with envelope name + new utilization %.
  - Submit creates a draft expense_claim then calls `/expenses/{id}/submit` to fire approval chain. Single click, end-to-end.
- **(e) Bulk doc upload** via drag-drop dropzone (`docs-bulk-btn`):
  - Multi-file accept (PDFs/images, 5MB cap each), filename-based regex auto-classifier (`bescom-bill.pdf` → utility_bill, `lease-agreement.pdf` → rent_agreement, etc).
  - Per-file type override dropdown before final upload. Single API call per file in sequence with progress toast.
- **No new dependencies, no migrations, no data loss.** Existing flows (manual /api/expenses without override, single-doc upload, /api/budgets/check route) all preserved.

### Apr 30, 2026 — Phases 3 + 4 + 2: Branch Ops, Joining Kits, Budgets 🏢
**Built in one session, end-to-end backend + frontend with seeded demo data.**

**Phase 3 — Branch Operations:**
- **Branch Document Vault** (`models_branch_ops.py`, `routers/branch_ops_routes.py`):
  - 10 doc types (utility_bill, rent_agreement, property_tax, fire_safety, business_license, AMC, insurance, etc.)
  - Upload base64 PDFs/images (5MB cap), expiry tracking, vendor name + amount + period dates.
  - `GET /api/branches/{id}/documents`, POST/PUT/DELETE, `GET .../{id}/file` for download.
  - **Org-wide expiring alerts**: `GET /api/branch-documents/expiring?days=30` returns docs ranked by expiry with `days_until_expiry` annotated.
- **Recurring Expense Scheduler**:
  - `RecurringExpenseTemplate` with three modes per user spec: **AUTO_SUBMIT** (critical bills fire into approval), **AUTO_DRAFT** (manager reviews), **MANUAL_ONE_CLICK** (template library).
  - `RecurringExpenseRun` tracking with idempotency on (template_id, period_month) to prevent double-runs.
  - Cron tick wired into `cleanup_loop` (every 6h) — sweeps active templates whose `next_run_at` ≤ now.
  - Manual `run-now` endpoint for any template.
- **Frontend** `pages/BranchOperations.jsx` — branch picker + 3 tabs: Document Vault (upload modal, expiry badges), Recurring Expenses (mode picker UI, run-now button), Expiry Alerts (org-wide window: 7/15/30/60/90 days).
- **Seed**: 18 docs + 16 recurring templates (BESCOM electricity, Airtel internet, BWSSB water, tea/coffee, housekeeping, drinking water, SIM cards, stationery) across 2 branches.

**Phase 4 — Joining Kit + Procurement Categories:**
- **Procurement Category Catalog** (`models_joining_kit.PROCUREMENT_CATEGORIES`): 8 categories × 6-11 sub-items each (Stationery General/Printing, Joining Kit, Repair & Maintenance, Branding & Promotion, Gifting & Misc, Office Supplies, IT Hardware) — exposed at `GET /api/procurement/category-catalog` for RFQ/PO forms.
- **Kit Templates** + **Kit Issuances** (`routers/joining_kit_routes.py`):
  - Template: department/branch/employment_class scoping, `is_default` per scope, items list with `is_returnable` flag.
  - Issuance lifecycle: `draft → issued → completed` (employee e-signs) → `partial / returned` (on exit).
  - Endpoints: GET/POST/PUT/DELETE templates; create issuance (auto-clones template items); `/issue` marks all issued; `/sign` records employee signature; `/return` accepts list of returned SKUs.
- **Frontend** `pages/JoiningKit.jsx` — Issuances + Templates tabs with status badges and one-click actions.
- **Seed**: 2 templates ("Standard Joining Kit" 6 items default, "Engineering Onboarding Kit" 6 items with laptop+dock+headset).

**Phase 2 — Budget Module:**
- **BudgetEnvelope** model: Branch (req) × Department × Cost-Center × Category × FY × Period (yearly/quarterly/monthly).
- **Most-specific-match** algorithm picks the right envelope when multiple cover a request.
- **Real-time utilization** = approved/submitted expense_claims + non-cancelled POs scoped to branch.
- **Soft-warn 80% / hard-block 100%** thresholds configurable per envelope, with `allow_override` flag.
- Endpoints: `GET/POST/PUT/DELETE /api/budgets`, `GET /api/budgets/dashboard` (aggregated), **`POST /api/budgets/check`** (pre-flight before submitting an expense/PO — returns `{matched, block, warn, overridable, message, pct_after, ...}`).
- Indian fiscal-year convention: FY2027 = April 2026 → March 2027 (`_fy_label_now()`).
- **Frontend** `pages/Budgets.jsx` — FY selector, dashboard tiles (envelopes / total / utilized / remaining), envelope cards with progress bars (green/amber/red), create modal with all dimensions.
- **Seed**: 10 envelopes across 2 branches × 5 categories (OpEx, Travel, Stationery, IT Hardware, Joining Kit Spend).

**Sidebar & routes**: Added `/app/branch-operations`, `/app/budgets`, `/app/joining-kit` with role gating; new sidebar entries under **People** module.

**Verified end-to-end via curl**:
- Budget pre-flight on ₹50K travel → matched, 19.5% util, OK
- ₹420K travel → blocked at 112% (₹48K over)
- ₹600K travel → blocked at 157% (₹228K over)
- Recurring run-now creates expense_claim with status=submitted in current period.

### Apr 30, 2026 — Phase 1: Employment Classes (On-Roll / Off-Roll / Intern) 🪪
**New foundation for a 6-phase branch-operations rollout.** 12/12 backend tests + end-to-end frontend validation green.

- **New `employment_class` field** on Employee / EmployeeCreate: `on_roll | off_roll_consultant | off_roll_contractor | intern` (distinct from the work-mode `employee_type`). Startup migration backfills all existing employees → `on_roll`. New index `(company_id, employment_class)`.
- **Policy engine** (`/app/backend/employment_class_policy.py`):
  - 19 feature keys across 8 groups (Compensation, Time Off, Time & Attendance, Operations, Docs, Growth, Engagement).
  - Code-as-truth DEFAULTS matrix: on_roll full access; off_roll_consultant excludes payroll/PF/loans/leave/insurance but keeps timesheet+expenses+attendance; off_roll_contractor minimal (no expenses); intern gets stipend payroll without PF/loans/insurance.
  - `get_effective_matrix(db, company_id)` overlays defaults with per-company overrides from `employment_class_permissions` collection.
- **Endpoints** (`/app/backend/routers/employment_class_routes.py`):
  - `GET /api/employment-class/catalog` — public metadata.
  - `GET /api/employment-class/permissions` — each user's effective permissions (derived from their Employee record).
  - `GET /api/admin/employment-class/config` — full per-class × per-feature matrix (company_admin+).
  - `PUT /api/admin/employment-class/config` — save overrides.
  - `POST /api/admin/employment-class/reset` — wipe to defaults.
  - `GET /api/admin/employment-class/stats` — head-count per class.
- **Employees API** (`routers/employees_routes.py`) now accepts `?employment_class=` filter and persists the field on create + patch.
- **Frontend**:
  - New admin page `/app/employment-classes` (`pages/EmploymentClasses.jsx`) with 3 tabs: **Classes & Permissions** (toggle matrix grouped by section), **Workforce Breakdown** (cards + percentages + deep-links), **Approval Matrix** (CTA to existing `/app/workflows`).
  - `/app/employees` gains an **Employment** filter dropdown + **Class** column with coloured badge (On-Roll / Consultant / Contractor / Intern) in both table and card views; deep-link `?employment_class=X` auto-applies.
  - New `EmploymentClassProvider` (`context/EmploymentClassContext.jsx`) exposes `useEmploymentClass()` + `useFeatureAllowed(key)` for future feature-gating.
  - Sidebar item `Employment classes` added under the People module, role-gated to super_admin / company_admin.
- **Seed script** `/app/scripts/seed_employment_classes.py` — idempotent; adds 3 consultants, 2 contractors, 3 interns.
- **Tests**: `/app/backend/tests/test_employment_class.py` — 7 unit tests covering defaults, normalize() fallback behaviour, and the off-roll-consultant / intern contracts per user spec.
- **Phase roadmap** agreed with user:
  1. ✅ Foundation (On-Roll / Off-Roll + Approval Matrix UI) — **DONE**
  2. 🔜 Budget Module (Branch × Department × Cost-Center × Category; warn 80% / block 100%)
  3. 🔜 Branch Operations (Document Vault + Recurring Expense scheduler: auto-submit critical bills, auto-draft discretionary, manual one-click templates)
  4. 🔜 Procurement Extensions (Stationery/Joining Kit/Repair/Branding RFQ categories + Vendor portal POD/invoice upload + auto-route to vendor category)
  5. 🔜 Fixed Asset Management (depreciation, custodian transfer, write-off, AMC)
  6. 🔜 SOPs + Idea Factory (medium: upvotes + stages + reward points) + Recruitment Referral (full: pipeline-tracked, bonus on hire+90d retention)

### Apr 29, 2026 — Check-in resilience + Branches geocoding + Live tracking lat/lon 🛠️
- **Mobile check-in/out** (`/app/mobile/src/screens/AttendanceScreen.js`):
  - `startLocationTracking()` failure no longer surfaces a fake "Check-in failed" alert. Tracking errors are now logged and the user is offered to open Settings to grant `Allow all the time`.
  - Cancelling the camera now aborts check-in/check-out cleanly instead of silently submitting without a selfie.
  - `refresh()` runs immediately after a successful POST so the UI flips to "Checked in" before tracking starts.
- **Branches** (`/app/frontend/src/pages/Branches.jsx`): added explicit `Auto-detect from address` button that calls free OpenStreetMap Nominatim API + existing `Use my location` button (browser Geolocation).
- **Live Tracking** (`/app/frontend/src/pages/LiveTracking.jsx`):
  - Marker popup now shows the raw lat/lon (6 decimal places, selectable for copy).
  - Right-side detail drawer shows a dedicated `Coordinates` block + deep-link to OpenStreetMap.
  - New `View today's trail` toggle button — trail polyline only renders on demand (cleaner default map).
- **EAS Android build kicked off**: `323f008e-f10c-4d3a-8846-491cc154c9ba` (commit `94d2891`, runtime 1.0.2). Once it finishes, run `EXPO_TOKEN=... PROD_PASS=... /app/scripts/release-apk.sh --reuse 323f008e-f10c-4d3a-8846-491cc154c9ba` to publish to landing page.
- **Frontend pushed to Hetzner prod** (`yarn build` rerun on `138.199.146.191:/opt/arcstone/frontend`).

### Apr 26, 2026 (Evening) — Mobile feature parity + OTA pipeline 📱
- **APK v1.0.1**: https://expo.dev/artifacts/eas/mHYjVg76XK7jX63VR8rtG2.apk (build `a7d2fae1-ed8b-4e87-8e7d-2807cad13c15`, 70.7 MB).
- **Full employee parity**: Home / Attendance / Leave / Inbox / More — covers Payslips, Expenses (with native receipt camera), Policies, Goals, Reviews, Helpdesk, POSH, Loans, Insurance, Product/Service requests, My Submissions, Knowledge Base, Notifications, Profile.
- **Hybrid architecture**: native-first for daily-driver screens (Attendance, Leave, Payslips, Expenses, Inbox, Profile), reusable `<WebViewScreen>` for less-frequented screens — WebView injects JWT and hits the live web app with `?embed=mobile` so the chrome is hidden and only content renders.
- **`expo-updates` wired**: `runtimeVersion: appVersion`, channel `preview` ↔ branch `preview` linked. Push JS-only changes to all installed devices in seconds via `cd /app/mobile && EXPO_TOKEN=... eas update --branch preview --message "..."`. No reinstall needed.
- Web `AppShell.jsx` now respects `?embed=mobile` (renders content-only when inside the mobile WebView).



### Apr 26, 2026 (Late PM) — Native Android APK live 📱
- **APK ready for download/sideload**: https://expo.dev/artifacts/eas/agpTzX2bsvC8m2LgvN4AmG.apk (signed, internal-distribution build, ~50 MB).
- EAS project: `@phonebooth/arcstone-hrms` (id `5a04fa8a-bd56-43ee-89c1-bd1c08a87fcd`); keystore stored on Expo cloud and reusable for all future builds.
- Includes: geofenced check-in/out, background location pings, selfie camera, biometric unlock, push-notification stub. Hits `https://people-partner-cloud.preview.emergentagent.com/api/mobile/*` endpoints.
- **To rebuild**: `cd /app/mobile && EXPO_TOKEN=... eas build --profile preview --platform android --non-interactive` (no further setup needed — owner/projectId/keystore all linked).
- **To switch backend**: edit `expo.extra.apiBaseUrl` in `/app/mobile/app.json` (e.g., to the Hetzner prod URL `http://138.199.146.191:port`) and rebuild.



### Apr 26, 2026 (PM) — Group D: Org Chart, Directory & Multi-Location 🌳
**17/17 backend + frontend tests pass · production-deployed.**

**Backend** (`/api/org/*`, `/api/employees/{id}` PATCH):
- **Visual org chart endpoint** — `GET /api/org/chart?template=...` with **4 templates**:
  - `reporting`: manager_id-based hierarchy, returns `roots[]` with recursive `children[]`.
  - `functional`: groups employees by department, each with its own reporting subtree.
  - `location`: groups by branch — surfaces `is_head_office` + `state_code` for the LWF/PT context.
  - `project`: groups by project membership; project lead becomes the visual root.
- **Drag-drop manager reassignment** — `PATCH /api/employees/{id}` accepts manager_id / department_id / branch_id / project_ids. **Cycle-protected** (rejects self-management AND prevents creating reporting cycles by walking up the new manager's ancestry).
- **Projects CRUD** (`/api/org/projects`) — name/code/lead/members/status; gates the project chart view.
- **Branch CRUD enhanced** — `PUT /api/org/branches/{id}` supports `state_code`, `state_name`, `pincode`, `phone`, `is_head_office` (HQ singleton — setting one clears all others). `DELETE` blocked when employees still assigned.

**Frontend** (3 new/upgraded pages):
- **`/app/org-chart`** — `OrgChart.jsx`: 4 template tiles (Reporting / Functional / Location / Project), live search with ancestor+descendant highlighting, expandable employee cards with avatar / type / code badges, drag-and-drop tree reassignment (HR only), inline edit dialog for changing manager / dept / branch / project tags, employee profile preview.
- **`/app/employees`** (Directory) — full search, department + branch + type filters, table↔card view toggle, manager column, color-rotating avatars, rich cards with email/phone/dept/branch.
- **`/app/branches`** (Locations) — card grid of office locations with HQ badge, state code, pincode, phone; add/edit dialog with full Indian-states dropdown driving LWF mapping.
- Sidebar reorganised: Directory · Org Chart · Hierarchy map · Locations all under People.

**Performance/code quality**:
- `OrgChart.jsx` uses an iterative `flattenTree()` instead of recursive component to bypass a babel-traverse infinite-loop bug; preserves visual hierarchy via `marginLeft: depth * 24px`.
- New indexes: `employees(manager_id)`, `projects(company_id, is_active)`.

**Tests** — `/app/test_reports/iteration_16.json` — **17/17 green**: cycle protection (self-loop + descendant-loop), whitelist on PATCH, HQ singleton, in_use branch delete guard, all 4 chart templates (+invalid → 400), Project CRUD, employee list filters.

### Apr 26, 2026 (AM) — HR Lifecycle, Self-Service, State Statutory & Compliance 🌟
**Big Phase A+B+C ship — 4 new modules, 17/17 backend tests + frontend smokes pass. Production-deployed to Hetzner.**

**Backend** (`/api/lifecycle/*`, `/api/loan-requests`, `/api/insurance/*`, `/api/lwf-rules`, `/api/compliance-bulletins`, `/api/expenses/.../voucher-pdf`):
- **Lifecycle alerts engine** — `POST /api/lifecycle/scan` walks all employees and generates idempotent alerts for: probation completion (config months from DOJ), annual salary review (config months), employee birthday, festival greetings (7 default Indian festivals). Decisions: `yes/no/later/dismiss`. On YES:
  - **Probation** → auto-creates an `appointment` letter template if missing + generates a personalised employment letter + notifies the employee.
  - **Salary review** → takes new CTC, archives current compensation, recomputes lines via `_compute_lines`, inserts new `employee_salaries` row → next payroll run reflects automatically.
- **Lifecycle settings** (`/api/lifecycle/settings`) — probation/review months, birthday template, festivals list, default new-joiner broadcast scope.
- **New joiner welcome** (`POST /api/lifecycle/announce-new-joiner`) — HR picks scope (company/department/branch/team) → broadcasts a notification + records an audit alert.
- **Loan Requests** (`/api/loan-requests`) — employee submits → HR decides → on approve, creates a real `employee_loans` row via the existing scheduler with the chosen interest %, start month, and EMI breakdown.
- **Insurance Policies** (`/api/insurance/policies`) — HR uploads policy with TPA, sum insured, coverage notes, claim steps, family floater toggles. Employee `POST /api/insurance/claim` creates a helpdesk ticket pre-tagged in an auto-created "Insurance Claims" category — claims flow through the existing SLA engine.
- **State-wise LWF** (`/api/lwf-rules`) — 17 Indian states seeded with employee + employer amounts, cycle (monthly / half-yearly / yearly), and deduction months. HR can edit per state.
- **Payroll integration** — `payroll_run_routes::compute_run` now injects an `LWF` deduction line + `LWF_ER` employer-contribution line based on the employee's `branch.state_code` and the run month's calendar match against the state's `deduction_months`.
- **Compliance Bulletins** (`/api/compliance-bulletins`) — HR/super-admin authored notices (PF, ESIC, LWF, Tax) with category, impact states, source URL, and pinning. Auto-fans-out notifications to all HR users.
- **Expense Voucher PDF** (`GET /api/expenses/{id}/voucher-pdf`) — produces a signed PDF voucher (employee block, line items table, approval chain, sign-off) for any approved/reimbursed expense claim. Uses new `pdf_render::render_expense_voucher_pdf` (reportlab).
- **Branches** now carry `state_code`, `state_name`, `pincode`, `phone`, `is_head_office` — drives multi-location LWF/PT.
- **Employees** now carry `date_of_birth`, `probation_end_date`, `next_salary_review_on` — drives lifecycle scan.

**Frontend** (4 new pages + 1 enhancement):
- **`/app/hr-alerts`** — color-coded alert cards (probation/salary review/birthday/festival/joiner), Yes/No/Later inline actions, decision dialog with new-CTC input for salary reviews, snooze date picker for "later", Settings dialog with festival toggles.
- **`/app/loan-requests`** — employee submission form (type/amount/tenure/purpose), HR decision dialog with interest % + start month, status tabs.
- **`/app/insurance`** — HR add-policy dialog with kind/insurer/TPA/sum-insured/family-floater toggles + coverage/claim markdown; employee sees policy cards with collapsible coverage/claim sections + "Raise a claim" CTA.
- **`/app/compliance`** — Bulletins tab (publish + pin + categorize) + LWF rules tab (per-state edit dialog). 17 states pre-loaded.
- **`/app/expenses`** — "Voucher PDF" button surfaces for approved/reimbursed claims, downloads valid PDF.

**Sidebar** — "HR Alerts" added under People; "Loan Requests", "Compliance", "Insurance" added under Payroll.

**Tests** — `/app/test_reports/iteration_15.json` — **17/17 backend + 5/5 frontend smokes pass**, zero action items. Coverage: scan idempotency, decide flows (yes triggers letter/comp), loan request → real loan, insurance claim → ticket, LWF seed + role-gated update, compliance bulletin notification fan-out, expense PDF + 400 on non-approved.

**Production-deployed** to Hetzner (138.199.146.191): backend rsynced, frontend rebuilt, supervisor restarted. Smoke-tested live: scan generated 42 probation + 33 salary review alerts on the production seed.

### Apr 24, 2026 — Daily Attendance View + Demo Data Seeder 📅
**Closed the open in-progress task from the previous session.** 13/13 new backend tests + full frontend flow pass.

**Backend:**
- `GET /api/attendance/live-board?on_date=YYYY-MM-DD` — HR/manager daily board. Returns `{date, counts{present, late, half_day, on_leave, absent, holiday, week_off, wfh}, total, rows[{employee, status, check_in, check_out, hours, is_late, leave_type}]}`. Employee role gets 403.
- `GET /api/attendance/register?month=YYYY-MM` — Monthly heatmap. Returns `{month, dates[], rows[{employee, days[{date, code}], summary}]}` with codes P/P*/HD/A/L/H/WO.
- `POST /api/demo/seed-employees?count=N&years=Y&reset=bool` — HR-only bulk seeder. For 50×2y produces ~15.9K attendance, 670 payslips, 222 goals, 194 leaves, 21 tickets in **<1 second** (Mongo `insert_many` with `ordered=False`, per-month `run_id` on payslips, chunked 2K).
- `POST /api/demo/wipe-demo` — HR-only wipe of all DEMO-prefixed employees + cascading data.

**Frontend — `AttendanceAdmin.jsx` fully refactored into 6 tabs:**
- **Today's Board** (default): 8 clickable KPI filter cards (Present/Late/Half-day/On-leave/Absent/WFH/Holiday/Week-off) + live employee table with status pills, search, date picker, refresh.
- **Monthly Register**: Per-day heatmap grid with color-coded codes + per-employee P/A/L/HD summary columns, month picker, search.
- **Demo data (HR)**: Count/Years/Reset controls, Seed button with progress state, Wipe button, success card with seed stats + `login_hint` (password `Demo@12345`, emails `demo{N}@acme.io`).
- Shifts / Assignments / Work sites — unchanged from previous session.

**Minor fixes during pass:**
- Denormalized `department_name` + `branch_name` on demo-employee docs (Employee model uses `extra="ignore"`, so these need direct dict injection post-`model_dump`).
- Added `run_id: "demo-run-YYYY-MM"` to payslip bulk inserts — removes the `company_id_1_run_id_1_employee_id_1` duplicate-key collision that was blocking multi-month seeds.
- All seed `insert_many` calls now use `ordered=False` for tolerance.

**Tests — 13/13 green.** Covers: live-board counts + RBAC (employee 403), register codes + summary math, seed happy-path + re-run idempotency with reset=true, wipe-demo, HR-only gating, tenant isolation.

### Apr 24, 2026 — Procurement Deepening + Operations activation 🏗️
**Delivered in one pass: full Procurement & Vendor Marketplace (previously only basic vendor CRUD) + activated Expense/Asset/Travel modules.** 31/31 backend tests passing.

**Scope shipped:**

**Backend** — `models_procurement.py` + `routers/procurement_routes.py`
- **Vendors** — `/api/procurement/vendors` CRUD with auto V-#### codes, portal_token generation on create, HR-only token exposure (stripped from list/employee views), PATCH, `/rotate-token` for immediate revocation.
- **Vendor Ratings** — `/api/procurement/vendors/rate` (1–5 stars per PO completion) with rolling avg + count persisted on vendor doc; `/{id}/ratings` lists history.
- **RFQ sealed-bid** — `/api/rfqs` with auto RFQ-YYYY-#### codes, multi-line items with hidden `target_unit_price` (internal only, stripped from vendor portal), status machine (draft → open → closed → awarded → cancelled), `/invite` multi-vendor with dedupe, invited_vendors tracks `viewed_at` + `quote_id` per vendor.
- **Sealed-quote visibility** — `/api/rfqs/{id}/quotes` returns `{quotes[], sealed_count}`; HR sees zero quotes pre-deadline/close (sealed_count > 0). On status→closed OR deadline passed, quotes auto-unseal (`sealed:false`).
- **Quote comparison matrix** — `/api/rfqs/{id}/compare` returns `{rfq, vendors[savings_pct], matrix[item→vendor_prices], lowest_total}` for side-by-side evaluation.
- **Award** — `/api/rfqs/{id}/award {quote_id}` marks winner + auto-drafts a Purchase Order from RFQ items × winning quote unit prices; losing quotes → status=lost.
- **Purchase Order chain** — `/api/purchase-orders` full lifecycle:
  - Auto PO-YYYY-#### code. Auto-recalc `subtotal`/`tax_total`/`grand_total` on each line change.
  - `/submit-for-approval` fires into existing `approval_requests` engine (reuses leave/expense chain).
  - `/approve-decision {decision}` HR shortcut; `/send` flips to sent.
  - `/receive {lines[]}` supports partial receipt; flips to `partially_received` or `received` based on coverage.
  - `/invoice {invoice_number, invoice_amount}` → status=invoiced.
  - `/pay` → status=paid (400 if not invoiced first).
- **Vendor Portal** — `/api/vendor-portal/*` UNGATED routes, authenticated via `X-Vendor-Token` header OR `?token=` query param. Endpoints: `/me`, `/rfqs` (only invited, strips `target_unit_price`, auto-sets `viewed_at`), `/rfqs/{id}` (404 if not invited), `/quotes` (upserts, sealed:true, 400 after deadline), `/quotes/{id}/withdraw`, `/purchase-orders` (only own), `/acknowledge`.

**Frontend** — `pages/Procurement.jsx` + `pages/VendorPortal.jsx`
- **Procurement Overview** — 4 KPI cards (active vendors, open RFQs, POs awaiting approval, spend), 3 navigable tiles, Recent POs.
- **Vendors** — List with rating stars, detail dialog with portal_token (copy + rotate), full contact/GST/PAN view.
- **RFQs** — List with deadline tabular, quoted count, status pills; New RFQ dialog with dynamic line-item rows (target price hidden from vendors).
- **RFQ Detail** — Items table + Invited vendors table (with viewed/quoted badges) + **Quote Comparison Matrix** (lowest unit-price per row shaded emerald, Total row with Trophy badge on winner, Award buttons after close).
- **Purchase Orders** — List + detail with status-conditional action buttons (Submit → Approve → Send → Receive → Invoice → Pay). "Rate this vendor" section appears after paid with 5-star UI.
- **Vendor Portal `/vendor-portal`** — Standalone orange-themed login (separate from AppShell, no JWT); token input OR auto-login via `?token=` URL; tabs for RFQs + POs; **Submit Sealed Quote** modal with per-line price inputs + auto-total; Acknowledge PO button on status=sent.

**Operations Module activation:**
- `db.py` seed now enables `expense`, `assets`, `travel` modules for ACME in addition to the 8 already active. **All 11 modules** now active by default: `base_hrms`, `procurement`, `onboarding`, `payroll`, `performance`, `ats`, `analytics`, `helpdesk`, `expense`, `assets`, `travel`.

**Tests — 31/31 green.** Covers: 11-module activation, vendor CRUD + token rotation, ratings rollup, RFQ sealed-bid lifecycle, quote unseal on close, compare matrix, award→auto-PO, full PO chain (receive partial/full, invoice, pay), vendor portal auth (header+query), portal target-price hiding, module-gating (disable procurement → 402 on internal routes, portal still works), tenant isolation, blacklisted vendor 403.

**Minor fixes during pass:**
- `Vendor.kind` null-guard in list view (defensive optional chaining)
- Duplicate-key React warning on RFQ detail invited_vendors table (keyed by `${vendor_id}-${idx}`)
- Legacy module registry entries (old locked `recruitment` + `reports`) hidden

### Apr 24, 2026 — Phase 1K + 1L + 1I: Recruitment, Reports, Helpdesk & POSH 🎯
[See below — prior entry]
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
- ~~Hetzner production deploy.~~
- ~~Phase 1K — Recruitment / ATS.~~
- ~~Phase 1L — Reports & MIS.~~
- ~~Phase 1I — Helpdesk + POSH.~~
- ~~Form 16 PDF + Letters bulk PDF.~~
- ~~**Procurement deepening** — Full RFQ sealed-bid, quote compare, PO chain with approvals, vendor ratings, Vendor Portal.~~
- ~~**Expense + Assets + Travel** module activation for ACME.~~

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

