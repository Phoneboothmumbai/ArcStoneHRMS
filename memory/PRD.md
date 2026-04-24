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

### Apr 24, 2026 — Phase 1J: Performance Management 🎯
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

### P0 (next)
- **Phase 1K — Recruitment / ATS** (job postings, candidate pipeline, interviews, offer letters — reuses Letters engine).
- **Phase 1L — Reports & MIS** (headcount, attrition, DEI, custom report builder, Excel export).
- **Form 16 PDF** (annual TDS certificate — currently JSON scaffold only).
- **Wire Expense → approval chain engine** (currently uses simple HR `/decide`).
- **Mobile v0.2** — Expo push notifications, selfie on check-in, payslip PDF viewer, Knowledge Base tab.

### P1
- **Phase 1I** Helpdesk + POSH.
- **Reseller white-label** (logo, brand color, custom domain).
- **Stripe subscription billing + Connect commission payouts**.
- **S3 migration** for document vault (currently base64).
- **ModulesContext first-render flash** — on cold login-navigate sequence, sidebar briefly renders without gated entries. Already has `useEffect([user])` refresh, but the network latency window shows empty sidebar. Optimistic cache via localStorage would eliminate.
- **Split Performance.jsx** (>700 lines with 6 sub-components) into per-page files.
- **A11y polish** — add explicit `<DialogTitle>` + `aria-describedby` on Radix dialogs (silences console warnings).

### P2
- Procurement / Vendor Marketplace (RFQ sealed-bid, quote compare, PO chain).
- SSO (SAML / OIDC).
- Slack / Teams / Gmail / GCal integrations.
- Per-country compliance packs.
- SOC 2 / ISO 27001 track.
- Biometric attendance integration (user deferred).
- Advanced approval engine (parallel chains, OOO delegation, auto-escalation).
- Test-data hygiene: phase1j tests leave demo rows in ACME; prefix TEST_ or use ephemeral tenant.

## Next tasks
1. Phase 1K Recruitment / ATS.
2. Phase 1L Reports & MIS.
3. Form 16 PDF.
4. Wire expense approval chain.
5. Mobile v0.2 push + selfie + payslip viewer.

## User personas
1. **Super Admin** — resellers, companies, platform metrics
2. **Reseller** — white-label, own customers, commission
3. **Company Admin / HR Admin** — employees, branches, approvals, payroll, performance
4. **Branch Manager / Sub / Assistant** — team roster, approval queue, goals, reviews
5. **Employee** — self-service: attendance, leave, requests, profile, payslip, my goals, my reviews

