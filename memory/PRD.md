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
- **Phase 0 complete (Feb 23)** — Module entitlement framework with 16 modules + 3 bundles (HR Essentials, People Ops Full, Enterprise Complete). Two-tier pricing (retail + wholesale) stored separately with role-gated visibility: super_admin sees both, reseller sees wholesale, company_admin/employee sees NONE. Module gate `requires_module()` returns HTTP 402 + clean upgrade payload when company lacks entitlement. Trial mode with auto-expiry. Bundle activation with proportional price distribution. Module activation requests flow from company_admin → reseller → super_admin. Full audit log of every enable/disable/request event.
- **Tenant isolation hardened (Feb 23)** — TenantDB query wrapper auto-injects `company_id` on every read/write; `requires_module()` + `require_roles()` dependencies; integrity scanner endpoint verifies no orphan documents per company. Fourth layer defense-in-depth.
- **Multi-currency support (Feb 23)** — Price model (`{amount, currency}`) supports INR/USD/EUR/GBP/AED/SGD from day one.
- **Data residency (Feb 23)** — Company model now has `region` field (in-blr, in-bom, eu-fra, etc.) for DPDP compliance. Migration-ready: region-aware Mongo URI switchable via env.
- **Tenant export (Feb 23)** — `POST /api/tenant/{id}/export` returns a zip containing every tenant-scoped collection as JSON (password_hash stripped). GDPR + DPDP right-to-portability compliant.
- FastAPI backend with 14 routers (auth, resellers, companies, org, employees, approvals, leave, attendance, requests, vendors, dashboard, workflows, modules, tenant)
- 19 MongoDB collections with proper indexes (compound `{company_id, module_id}` unique on company_modules; `{company_id, at}` on module_events)
- Idempotent seed: 1 super admin + 1 reseller + 1 company (ACME, region=in-blr, INR) + 2 regions + 2 countries + 2 branches + 2 departments + 6 employees + 5 sample approval workflows + 2 seeded module entitlements (base_hrms, procurement)
- Configurable approval engine with 5 sample workflows
- Leave, Attendance, Product/Service Requests, Vendors, Org Tree, Employee Directory
- Landing page, unified login, 5 persona dashboards, Workflow Builder UI, Approvals queue
- Super Admin Modules page (toggle modules per company, bundles, audit log)
- Company Admin Billing & Modules page (active modules, request activation, data export)
- 61/61 backend pytest tests passing, all frontend persona flows verified

## Backlog — prioritized

### P0 (next up)
- React Native (Expo) mobile app for Employee + Manager (same API surface)
- White-label per reseller: logo, brand color, custom domain mapping
- Employee create/edit UI (currently seeded only; API supports it)
- Org hierarchy CRUD UI (currently seeded only; API supports it)

### P1
- Stripe subscription billing per company + reseller commission payouts (Stripe Connect)
- Payroll module (per-country compliance — India PF/ESI, UK PAYE to start)
- Performance & Goals (OKRs, 1:1 notes, reviews)
- Recruitment / ATS (pipeline, interviews, offer management)
- Notifications: email (Resend/SendGrid) + in-app bell + mobile push
- Advanced approval engine: parallel chains, conditional routing (amount thresholds), OOO delegation, auto-escalation

### P2
- SSO (SAML / OIDC) for enterprise buyers
- Audit log (append-only) + exports
- Integrations: Slack, Teams, Gmail, Google Calendar
- Analytics: workforce planning, attrition, compensation benchmarks
- SOC 2 / ISO 27001 certification track
- Compliance packs per country (labor law, holidays, payroll rules)
- Document storage for employee files (S3/R2)

## Next tasks
1. Port Employee & Manager dashboards to React Native (Expo) using the same `/api/*` endpoints and `access_token` Bearer auth.
2. Build HR admin UIs for Employee CRUD and Org node CRUD (backend already exposes endpoints).
3. Wire Stripe billing: subscription per company, reseller commission payouts via Stripe Connect.
4. Add notifications layer (email on approval events + mobile push).
