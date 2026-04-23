# Arcstone HRMS SaaS — Product Requirements Document

## Original problem statement
> Build an HRMS SaaS with a reseller layer in between. Scale: 100s of companies, 1000s of employees. Need mobile apps for employees, employee login, HR admin login. Multi-level approval system. Companies with offices in multiple countries, regions, locations. Different employee types (WFH, WFO, field, hybrid). Employees can request products/services. Branches have hierarchy (manager, sub manager, assistant manager). Employees can request products/services to main branch or vendors.

## Architecture (see `/app/ARCHITECTURE.md` for full blueprint)
- **4-tier tenancy**: Platform → Reseller → Company (Tenant) → Employees
- **Multi-tenancy model**: shared DB, shared schema, `company_id` discriminator (scales to 100s of tenants cost-effectively)
- **Backend**: FastAPI + MongoDB (motor), JWT auth (cookies + Bearer), role-based access control
- **Frontend**: React + Tailwind + shadcn/ui + phosphor-icons, Swiss High-Contrast design (Chivo + IBM Plex Sans)
- **Org hierarchy**: Region → Country → Branch → Department → Employee (every layer self-configurable)
- **Approval engine**: Generic chain, reusable across leave / requests / expenses, walks manager hierarchy

## User personas
1. **Super Admin** (platform owner) — resellers, companies, platform-wide metrics
2. **Reseller** (partner) — white-label, own customers, commission tracking
3. **Company Admin / HR Admin** — employees, branches, approvals, analytics
4. **Branch Manager / Sub / Assistant Manager** — team roster, approval queue
5. **Employee** — self-service: attendance, leave, product/service requests

## Core requirements (static)
- Multi-country / multi-region / multi-branch org support
- Employee types: WFO, WFH, Field, Hybrid
- Multi-level approval engine (sequential chain walk-up)
- Product/service request routing (main branch or vendor)
- Role-based dashboards (5 personas)
- Tenant isolation at API layer via `company_id` JWT claim + row-level query filter

## What's been implemented (2026-02-23)
- **Phase 1M complete (Feb 23)** — Self-Service Foundations. In-app Knowledge Base with 9 categories, markdown article rendering (react-markdown + @tailwindcss/typography), full-text search, category filter, and deep-linkable article URLs at /app/help/:slug. Public read API (auth-only); Super Admin CRUD under /api/kb/admin/*. 8 seed articles covering: Welcome tour, Adding first employee, India statutory (PF/UAN/ESIC/PT/LWF/NPS), KYC documents, Onboarding how-to, Offboarding/Exit playbook, Approval workflows, Modules & billing. Contextual `<HelpHint>` tooltip component deployed on India statutory fields (PAN/Aadhaar on KYC tab; UAN/PF/ESIC/PT on Statutory tab; IFSC on Bank tab) with deep links to the relevant KB article. Universal `Help & Knowledge Base` nav item in every role's sidebar + floating Help link in header. Admin editor UI at /app/kb-admin (super_admin only). 16/16 new pytest cases passing.
- **Phase 1A complete (Feb 23)** — Employee Lifecycle Core (India-first). Rich employee profile with 10 sections: Personal (gender/blood group/languages/category), Contact (current + permanent address with 36 Indian states), KYC (PAN/Aadhaar-last4/passport/DL/voter), Statutory India (UAN/PF/ESIC/PT state/NPS/LWF opt-in flags), Bank (IFSC/account type), Employment Details (grade/band/employment type/probation/notice period), Emergency Contacts, Family & Nominees (with share %), Education, Prior Employment. Profile completeness scoring (0-100%). Per-section access control: HR roles edit everything, employees self-edit Personal/Contact/Family/Education/Prior Employment/Emergency (KYC/Statutory/Bank/Employment HR-only). Document vault (base64 storage, 2 MB/file, 12 doc categories: identity/education/offer_letter/relieving_letter/PF/tax/insurance/medical/...). Onboarding module with template CRUD + instance workflow: seeded default "Standard India Onboarding" template (12 tasks across 5 stages — pre_joining/day_1/week_1/month_1/probation); auto-computes due_date per task from DOJ; auto-completes onboarding when all tasks done; flips employee.status onboarding→active. Offboarding with 8 default clearance items across 6 departments (IT/admin/finance/HR/manager/security); exit interview (overall_rating/reason/what_worked/what_can_improve/would_recommend/would_rejoin); complete-exit action blocked until all clearance cleared, then issues relieving+experience letters, marks F&F settled, terminates employee, deactivates user login. Onboarding+Offboarding gated behind `onboarding` module (returns 402 when not entitled). 19/19 new pytest cases passing.
- **Phase 0 complete (Feb 23)** — Module entitlement framework with 16 modules + 3 bundles (HR Essentials, People Ops Full, Enterprise Complete). Two-tier pricing (retail + wholesale) stored separately with role-gated visibility: super_admin sees both, reseller sees wholesale, company_admin/employee sees NONE. Module gate `requires_module()` returns HTTP 402 + clean upgrade payload when company lacks entitlement. Trial mode with auto-expiry. Bundle activation with proportional price distribution. Module activation requests flow from company_admin → reseller → super_admin. Full audit log of every enable/disable/request event.
- **Tenant isolation hardened (Feb 23)** — TenantDB query wrapper auto-injects `company_id` on every read/write; `requires_module()` + `require_roles()` dependencies; integrity scanner endpoint verifies no orphan documents per company. Fourth layer defense-in-depth.
- **Multi-currency support (Feb 23)** — Price model (`{amount, currency}`) supports INR/USD/EUR/GBP/AED/SGD from day one.
- **Data residency (Feb 23)** — Company model now has `region` field (in-blr, in-bom, eu-fra, etc.) for DPDP compliance. Migration-ready: region-aware Mongo URI switchable via env.
- **Tenant export (Feb 23)** — `POST /api/tenant/{id}/export` returns a zip containing every tenant-scoped collection as JSON (password_hash stripped). GDPR + DPDP right-to-portability compliant.
- FastAPI backend with 18 routers (auth, resellers, companies, org, employees, approvals, leave, attendance, requests, vendors, dashboard, workflows, modules, tenant, profile, documents, onboarding, offboarding)
- 23 MongoDB collections with proper indexes (employee_profiles unique on employee_id; employee_documents+onboardings+offboardings compound on company_id)
- Idempotent seed: 1 super admin + 1 reseller + 1 company (ACME, region=in-blr, INR) + 2 regions + 2 countries + 2 branches + 2 departments + 6 employees + 5 sample approval workflows + 3 seeded module entitlements (base_hrms, procurement, onboarding) + 1 default onboarding template (12 tasks)
- Configurable approval engine with 5 sample workflows
- Leave, Attendance, Product/Service Requests, Vendors, Org Tree, Employee Directory
- Landing page, unified login, 5 persona dashboards, Workflow Builder UI, Approvals queue
- Super Admin Modules page (toggle modules per company, bundles, audit log)
- Company Admin Billing & Modules page (active modules, request activation, data export)
- Employee Profile page (unified self-service + HR view with left-nav tabs & completeness bar)
- Onboarding page (list + detail with stage-grouped task checklist + start-onboarding dialog)
- Offboarding page (list + detail with clearance checklist + exit interview form + complete-exit action)
- 80/80 backend pytest tests passing (61 Phase 0 + 19 Phase 1A), all frontend persona flows verified

## Backlog — prioritized

### P0 (next up — HRMS completion phases, in order)
- **Phase 1B** Leave deepening: leave types (CL/SL/EL/comp-off/maternity/paternity), per-grade policies, balance + accrual engine, holiday calendar (country + region specific), encashment
- **Phase 1C** Attendance deepening: shifts & rosters, regularization, overtime tracking, WFH/WFO/Field policy per employee, geo-fencing for field staff, policies (late mark, half-day, grace period)
- **Phase 1D** Notifications Engine: unified email (Resend) + in-app bell + per-event templates
- **Phase 1E** Policy & Settings: company settings, policy library, pay cycle, fiscal year
- **Phase 1F** Documents & Letters: letter templates (offer, experience, relieving, NOC) with merge fields, e-sign stub
- **Phase 1G** Asset Management: laptop/device register, assign/return flow, depreciation (migrate document vault to S3 here)
- **Phase 1H** Expense Claims: submit with receipts, approve, reimburse, category policy
- **Phase 1I** Helpdesk / Grievance: ticket categories, SLA, escalations
- **Phase 1J** Performance: Goals/OKRs, review cycles, 360 feedback, PIP
- **Phase 1K** Recruitment / ATS: job postings, candidate pipeline, interviews, offer letters
- **Phase 1L** Reports & Analytics: headcount, attrition, DEI, attendance, leave, custom builder
- React Native (Expo) mobile app for Employee + Manager (same API surface)
- White-label per reseller: logo, brand color, custom domain mapping

### P1
- Procurement / Vendor Marketplace (Phase 2 — deferred to after HRMS phases): Vendor portal, RFQ sealed-bid, quote comparison, PO via approval engine
- Stripe subscription billing per company + reseller commission payouts (Stripe Connect)
- Advanced approval engine: parallel chains, conditional routing, OOO delegation, auto-escalation

### P2
- SSO (SAML / OIDC) for enterprise buyers
- Audit log (append-only) + exports
- Integrations: Slack, Teams, Gmail, Google Calendar
- SOC 2 / ISO 27001 certification track
- Compliance packs per country (labor law, holidays, payroll rules beyond India)

## Next tasks
1. **Phase 1B — Leave deepening** (leave types, policies, balance/accrual, holiday calendar)
2. **Phase 1C — Attendance deepening** (shifts, rosters, regularization, overtime, geo-fencing)
3. **Phase 1D — Notifications Engine** (Resend email + in-app bell, unlocks reminders everywhere)
4. Continue through Phases 1E–1L as per the ordered roadmap above
