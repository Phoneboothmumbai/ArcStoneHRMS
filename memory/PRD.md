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
- FastAPI backend with 12 routers (auth, resellers, companies, org, employees, approvals, leave, attendance, requests, vendors, dashboard, workflows)
- 16 MongoDB collections with proper indexes (including compound `{company_id, request_type, is_active}` for workflow lookup)
- Idempotent seed: 1 super admin + 1 reseller (Arlo Partners) + 1 company (ACME Global) + 2 regions + 2 countries + 2 branches + 2 departments + 6 employees + 5 sample approval workflows
- **Configurable approval engine (Feb 23)** — per-company, per-request-type, per-category workflows with cost/days/branch matchers, step resolvers (manager, department_head, branch_manager, company_admin, role, user), conditional cost thresholds, priority scoring, graceful fallback to manager walk-up when no workflow matches
- Generic multi-level approval engine walking the manager hierarchy (fallback path)
- Leave workflow (5 types, calendar range, days computed, routed through configurable approval engine)
- Attendance with check-in/check-out, hours calculation, per-day enforcement, WFO/WFH/field types
- Product/service request module with `item_category` (computer, stationery, furniture, etc.), vendor routing, configurable approval chain
- Landing page (marketing + reseller program CTA + architecture section)
- Unified login with 5 one-click demo persona shortcuts
- Role-based redirect post-login
- 5 persona dashboards (Platform, Reseller, HR, Manager, Employee)
- Employee directory with search + type filter
- Organization hierarchy tree (collapsible, per-level metadata)
- Approvals queue (inbox + submitted + all-involved tabs, decision dialogs with comment)
- My submissions page with step-by-step chain progress visualization
- **Workflow Builder UI (Feb 23)** — HR admin creates/edits/toggles/deletes workflows; drag-to-reorder steps; match rules for item category, leave type, cost/days range, branch scope
- Company/reseller onboarding flows for super admin + reseller
- 44/44 backend pytest tests passing (25 MVP + 19 workflow engine), all frontend persona flows verified

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
