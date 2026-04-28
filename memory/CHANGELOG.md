### Feb 26, 2026 (Late evening) — Live Location Tracking for admins 🗺️
**HR admins / managers / designated viewers can now see their field team on a live map.**

**Backend** (`/app/backend/`):
- New `routers/live_tracking_routes.py` (~200 LoC) with `/api/admin/locations/*`:
  - `GET /live` — latest ping per tracked employee. Computes distance-from-home-branch via Haversine, tags status (`on_duty` / `signed_out` / `offline`), sorts active employees first.
  - `GET /trail/{eid}?date=YYYY-MM-DD` — day's polyline for one employee (reads `location_pings` collection).
  - `GET/PATCH /viewers/{eid}` — admin-only: add/remove specific users (TL, mentor, etc.) who can view a particular employee's map beyond the default HR+direct-manager visibility.
  - `POST /field-flag/{eid}` — toggle `is_field_tracked` + optional `geofence_radius_m` override.
  - `GET /breaches` — recent geofence-breach notifications (manager-visibility-filtered).
- `_can_view()` helper enforces RBAC: super_admin / company_admin / country_head / region_head → all employees. branch_manager/sub_manager/assistant_manager → direct reports only. Anyone in `location_viewers[]` → that one employee. Else 403.
- **Geofence breach detection** wired into `POST /api/mobile/locations/ping`: if the latest ping is outside `geofence_radius_m` (or branch radius, default 500 m) from the employee's home branch, fires an in-app `geofence.breach` notification to every company_admin / country_head / region_head. Throttled to 1 alert / employee / hour so HR isn't spammed. Failures are swallowed — never blocks ping writes.
- `employees_routes.py` PATCH allowlist extended with `is_field_tracked` + `geofence_radius_m` so admins can set these inline.

**Frontend** (`/app/frontend/`):
- New `pages/LiveTracking.jsx` (~400 LoC) — Leaflet + OpenStreetMap (no API key, free forever).
  - **Left sidebar**: search, stats (On-duty / Tracked / Breaches badge), filtered employee list with status dots + distance-from-office. Click an employee to pan+zoom the map to them.
  - **Full-screen map**: pulsing dot markers (green on-duty, zinc signed-out, red breached), popups with last-seen/distance, branch geofence circles (semi-transparent 500m ring), polyline trail for the selected employee + date.
  - **Right drawer** (when employee selected): photo, status, last-seen, distance-from-branch, trail-date picker (with ping count), "Manage viewers" button.
  - **Viewers modal**: admin-only, search employees with logins and add/remove as location viewers. Current viewers shown as chip list.
  - **Flag employees modal**: admin-only, checkbox list to toggle `is_field_tracked` in bulk. Saves battery by ensuring only field staff send background pings.
  - Auto-refresh every 30s.
- Installed `leaflet` + `react-leaflet` (yarn). Leaflet CSS imported. Marker default icons pinned to cloudflare CDN URLs (avoids webpack's broken path resolution).
- Privacy footer on every page render explaining the visibility rules.

**Route wiring**: `/app/live-tracking` (ROLE_MANAGER+) → added under Time & Leave module next to Team Leave Planner.

**Production deploy** (Hetzner `138.199.146.191`): 4 backend files + 5 frontend files + `package.json/yarn.lock` rsync'd, `yarn install --frozen-lockfile` + `yarn build` + backend restart. Verified `/api/admin/locations/live` returns 200 on prod.

**SpineHR feature progress**: 5 / 8 quick-win features delivered (Loan EMI, Leave Planner, Resource Booking, Visitor Management, Live Tracking). Still pending: Document versioning + expiry alerts · Exit interview UI · Parallel approvals · Backdated/arrears payroll.


### Feb 26, 2026 (Late evening) — SpineHR Sprint 1: Loan EMI + Resource Booking + Visitor Mgmt + Leave Planner 🚀

**Loan EMI auto-deduction in payroll** (`/app/backend/routers/payroll_run_routes.py`):
- During `compute_run`, fetches all active `employee_loans` for each employee and pulls any `schedule[]` instalment matching the run's `period_month`. Adds it as a `LOAN_*` deduction line on the payslip.
- During `finalise_run`, marks those instalments as `paid` and reduces the loan's `outstanding`. Auto-closes the loan when outstanding reaches 0.
- No new schema — reuses the existing schedule rows from `fnf_routes._build_schedule()`.

**Resource Booking module** (new): `routers/resource_booking_routes.py` (~190 LoC) + `pages/ResourceBooking.jsx` (~280 LoC).
- `GET/POST/PATCH/DELETE /api/resources` — meeting rooms, vehicles, equipment, hot desks. HR-admin owns CRUD.
- `GET/POST/DELETE /api/resource-bookings` — anyone in the company can book. Overlap detection at insert time (returns `409` with the conflicting time range).
- Frontend: card grid of resources with type-specific icons, "Next bookings" preview per resource, two modals (Add resource / New booking), upcoming-bookings list with cancel-by-creator-or-admin.
- Verified via curl: created Conference Room A, booked it 10:00-11:00, second overlapping booking returned `HTTP 409`.

**Visitor Management module** (new): `routers/visitors_routes.py` (~150 LoC) + `pages/VisitorManagement.jsx` (~250 LoC).
- `POST /api/visitors` — front-desk check-in with name, company, phone, host (type-ahead employee search), purpose, ID-proof type + last-4 digits, badge #, optional photo (base64, ≤500 KB).
- Auto-fires an in-app notification to the host employee on check-in.
- `POST /api/visitors/{vid}/checkout` — sign out with optional notes.
- `GET /api/visitors/today` — kiosk-friendly feed with `{counts: {checked_in, checked_out, total}, rows: [...]}`.
- Frontend: 3 stat tiles (on-premises now / signed out / total today), auto-refresh every 30 s, badge for checked_in vs checked_out, clean check-in modal with phone-camera capture.

**Visual Leave Planner** (new): `pages/LeavePlanner.jsx` (~110 LoC). Reads existing `/api/leave/team-calendar` API (no backend changes). Renders a month-grid where each row is an employee and each cell is a day — coloured by leave type, shaded amber for pending. Sticky employee-name column, prev/next/today nav, weekend tinting, hover for full leave details.

**Routes & sidebar wiring**:
- `App.js` → 3 new routes: `/app/leave-planner`, `/app/resource-booking`, `/app/visitors`.
- `lib/moduleRegistry.js` → "Team leave planner" added under Time & Leave; new **Workplace** module group with Resource Booking + Visitor Management.

**Production deploy** (Hetzner `138.199.146.191`):
- 4 backend files rsync'd to `/opt/arcstone/backend/`.
- 5 frontend files rsync'd to `/opt/arcstone/frontend/src/`.
- `yarn build` + `supervisorctl restart arcstone-backend`. Verified `/api/resources` returns 200.

**SpineHR feature progress**: 4 / 8 quick-win features delivered (Loan EMI, Visual Leave Planner, Resource Booking, Visitor Management). Still pending: Document versioning + expiry alerts · Exit interview UI · Parallel approvals · Backdated/arrears payroll.


### Feb 26, 2026 (Late evening) — Company logo upload + branded PDFs 🎨
**Every company can now upload a logo in settings, and it auto-prints on every generated PDF.**

**Backend** (`/app/backend/`):
- `models_policy.py` → added `logo_mime_type` field to `CompanySettings` and `CompanySettingsUpdate`.
- `routers/policy_routes.py` → PATCH `/company-settings` now strips data-URI prefix, persists clean base64 + mime, enforces ~500 KB cap, surfaces `logo_mime_type` to employee minimal view.
- `pdf_render.py` → new `_logo_flowable()` (decodes base64 → ReportLab `Image`, fits to bbox, caches per session) and `_branded_header()` (two-column layout with title+subtitle on left, logo on right). Falls back gracefully (no logo → unchanged).
- All 6 PDF renderers extended with `logo_base64` parameter and use `_branded_header()`:
  - `render_payslip_pdf`
  - `render_letter_pdf`
  - `render_form16_pdf`
  - `render_expense_voucher_pdf`
  - `render_orgchart_pdf`
  - `render_directory_pdf`
- 6 PDF endpoints updated to fetch `company_settings` and pass `logo_base64`:
  - `payroll_run_routes.py` (`/payslips/{id}/pdf`)
  - `letters_routes.py` (`/letters/{id}/pdf` + `/letters/bulk-pdf`)
  - `expenses_routes.py` (`/expenses/{eid}/voucher-pdf`)
  - `org_routes.py` (`/org/chart-pdf`)
  - `employees_routes.py` (`/employees/directory-pdf`)
  - `statutory_routes.py` (`/companies/{cid}/exports/form-16/{emp_id}/pdf`)

**Frontend** (`/app/frontend/`):
- New page `pages/CompanySettings.jsx` — single-screen settings hub for HR admins. 4 sections:
  - **Branding**: 120px logo preview tile + Upload/Change/Remove buttons (PNG/JPEG/WebP, ≤ 500 KB), legal entity name (drives PDF heading), registered address.
  - **Fiscal & payroll cycle**: FY start month, payroll cutoff day, pay day.
  - **Statutory identifiers**: PAN, TAN, GSTIN, CIN, PF code, ESIC code (auto-uppercase).
  - **Localization**: currency (3-char), timezone.
  - Sticky save bar at bottom with dirty-state indicator + Discard button. Toasts for success/error. Auto-fetches on mount.
- Wired route `/app/company-settings` in `App.js`.
- Added "Company settings" entry under People module in `lib/moduleRegistry.js` (HR-only via `roles: ROLE_HR`).

**Verification**:
- Uploaded a 40×40 red PNG via `PATCH /company-settings`. Returned `saved logo bytes: 140`, mime `image/png`.
- Downloaded a payslip PDF; PDF renders with ✅ logo (top-right), ✅ "Acme Technologies Pvt Ltd" heading, ✅ all payslip content intact (verified via `pdftoppm` → image analysis).
- Frontend page on preview + prod renders all 4 sections, save bar sticks, logo preview shows the uploaded image / empty-state placeholder correctly.

**Production deploy** (Hetzner `138.199.146.191`):
- `rsync`'d 9 backend files + 3 frontend files → `/opt/arcstone/{backend,frontend}/`
- Rebuilt frontend on prod (`yarn build` baked prod backend URL)
- Restarted `arcstone-backend`. Verified `/api/company-settings` returns the new `logo_mime_type` key, and `/app/company-settings` page renders correctly for `hr@acme.io`.


### Feb 26, 2026 (Late evening) — Production deploy + auto-publish pipeline 🚀
**Production landing page now serves the latest APK live, and a single command will keep it that way forever.**

- **Pushed to prod** (`138.199.146.191`):
  - `backend/routers/public_routes.py` (new EAS-redirect logic + httpx HEAD/Range size fetch)
  - `frontend/src/components/AppShell.jsx` + `frontend/src/pages/Landing.jsx`
  - Patched `/opt/arcstone/backend/.env` with `MOBILE_APK_REMOTE_URL` + `MOBILE_APP_VERSION="1.0.1"`
  - Installed `httpx` in the prod venv
  - Rebuilt frontend in-place (`yarn build`) so static bundle picks up the prod backend URL
  - Restarted `arcstone-backend` via supervisor
- **Verified live**: `http://138.199.146.191/` shows "Mobile · v1.0.1", "8.0 (Oreo) · 70.7 MB APK", "Install Arcstone app" button → 302 → live EAS APK, "Signed native APK · Play Store listing coming soon" subtitle, QR code encodes redirect endpoint.
- **New: `/app/scripts/release-apk.sh`** (also at `/opt/arcstone/scripts/release-apk.sh` on prod) — one-shot release pipeline:
  - `EXPO_TOKEN=… ./release-apk.sh` → kicks off EAS build, polls status every 30s, parses APK URL, SSH-patches prod `.env`, restarts backend, validates `/api/public/mobile-app`.
  - `./release-apk.sh --reuse <build-id>` → republishes an already-finished build (zero rebuild cost).
  - `./release-apk.sh --ota "fix: payslip layout"` → ships a JS-only OTA update via `eas update --branch preview` (no APK rebuild, reaches devices on next launch).
- Future flow: push web change → `eas update --branch preview` → done in 30 seconds. Push native change → `release-apk.sh` → APK rebuilt, prod auto-updated, ~10 min total. The QR/button on the landing page **always** serves the latest.


### Feb 26, 2026 (Late PM) — Mobile feature parity + OTA pipeline 📱✨
**Mobile app now mirrors the entire employee web experience.** APK v1.0.1 (versionCode 2) shipped. From here, every web change reaches phones in seconds via `eas update --branch preview` — no APK rebuild, no reinstall.

**New native screens** (`/app/mobile/src/screens/`):
- **`HomeScreen`** rebuilt — quick-action grid (Check in / Apply leave / Payslips / Expenses / Policies / Helpdesk), live stat cards, manager approvals callout, inbox preview row.
- **`PayslipsScreen`** — fetches `/api/payslips` (employee-filtered server-side), per-row PDF download via `expo-print` + `expo-sharing` + `expo-file-system`, native period/net-pay/LOP rendering. Disabled state for unpublished slips.
- **`ExpensesScreen`** — full claim list with status pills, status-tinted colors. Floating "+ New" pill button opens a sheet modal with: title, purpose, horizontal category picker, amount (decimal pad), date, description, and **native receipt picker** (camera or gallery, base64-uploaded, ≤2 MB enforced). Submits to `/api/expenses` and auto-fires `/expenses/{id}/submit`.
- **`NotificationsScreen`** — `/api/notifications` list, unread tinting, mark-one-read on tap, "Mark all read" header CTA.
- **`MoreScreen`** — sectioned hub (Money / Performance / Workplace / Account) listing all 11+ secondary features. Auto-dims modules the company hasn't entitled (queries `/api/modules/mine`). Sign-out lives here with confirmation dialog.
- **`WebViewScreen`** — single reusable component for content-heavy screens. Pre-injects JWT into `localStorage` via `injectedJavaScriptBeforeContentLoaded`, appends `?embed=mobile` to every URL, hardware back-button drives WebView history, pull-to-retry on network errors.

**WebView-backed screens (use existing web pages)**: Policies, My Goals, My Reviews, Helpdesk, PoSH, Product Requests, My Submissions, Loans, Insurance, Knowledge Base — all surfaced from `MoreScreen` and the Home quick-actions.

**Web ↔ Mobile bridge** (`/app/frontend/src/components/AppShell.jsx`):
- New `isEmbeddedMobile()` helper. When `?embed=mobile` is in the URL or `embed_mobile=1` in sessionStorage, AppShell renders content-only — strips sidebar, top header, hamburger, module switcher. The native shell already provides nav/title/back-button.

**Navigation rebuilt** (`AppNavigator.js`):
- 5 bottom tabs: Home / Attendance / Leave / **Inbox** / **More** (badge-aware, polled every 60 s)
- Inbox = unified Notifications + Approvals (managers see both, switched via top tabs)
- Stack screens for Profile, Payslips, Expenses, WebView (push-style nav)

**OTA Updates** (`expo-updates`):
- `runtimeVersion: { policy: "appVersion" }` + `updates.url` configured in `app.json`.
- `App.js` calls `Updates.checkForUpdateAsync()` on launch and on every foreground (`AppState` listener) — fetches new JS bundle silently, applies on next cold start.
- EAS project channel `preview` ↔ branch `preview` are auto-created and bound.
- **To push a JS-only change**: `cd /app/mobile && EXPO_TOKEN=... eas update --branch preview --message "..."`. Reaches every installed device on next launch (~3 s).

**APK build #2 (v1.0.1)**:
- ID `a7d2fae1-ed8b-4e87-8e7d-2807cad13c15` (preview, Android, internal, SDK 51, versionCode 2)
- Download URL: `https://expo.dev/artifacts/eas/mHYjVg76XK7jX63VR8rtG2.apk` (70.7 MB)
- `MOBILE_APK_REMOTE_URL` and `MOBILE_APP_VERSION` updated in `/app/backend/.env` — landing-page QR + button now redirect here.
- Reuses the same auto-generated keystore as v1 → users can update by reinstalling without losing data signature.


### Feb 26, 2026 — Native Android APK shipped 📱✅
**The mobile app is real.** First production-grade APK successfully built via Expo EAS cloud.

- **EAS project linked**: `@phonebooth/arcstone-hrms` (project ID: `5a04fa8a-bd56-43ee-89c1-bd1c08a87fcd`) — https://expo.dev/accounts/phonebooth/projects/arcstone-hrms
- **Build #1**: `4b092079-b3d7-4bb0-9ce8-bb9cca58beb0` (preview profile, Android, internal distribution, SDK 51, v1.0.0, versionCode 1) — finished 4/26/2026 at 18:04 UTC, ~6 min build time.
- **APK download URL**: https://expo.dev/artifacts/eas/agpTzX2bsvC8m2LgvN4AmG.apk
- **Keystore**: auto-generated and stored on Expo's servers (reused for all future builds — same signing identity).
- **Bundle**: `io.arcstone.hrms` (Android package), with full geofence + background location + camera + biometric + notification permissions wired in `app.json`.
- **API base URL** baked into the build: `https://people-partner-cloud.preview.emergentagent.com`. Change `expo.extra.apiBaseUrl` in `app.json` and rebuild to point to a different backend (e.g., Hetzner production).
- **Next builds**: just run `EXPO_TOKEN=... eas build --profile preview --platform android --non-interactive` from `/app/mobile/` — keystore and project are already linked.


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
