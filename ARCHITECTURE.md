# Arcstone HRMS SaaS — Architecture Blueprint

> **Target scale:** 100s of companies, 1000s of employees per tenant, multi-country, multi-region, multi-language-ready. Mobile + web + API-first.

---

## 1. Four-tier tenancy model

```
Platform (Super Admin)
   └── Reseller  (white-label, commissions)
         └── Company / Tenant  (HR Admin)
               └── Region → Country → Branch → Department
                     └── Manager → Sub Manager → Assistant Manager → Employee
```

**Why this model**
- The **Platform** owns infrastructure, billing, compliance.
- The **Reseller** is the go-to-market layer that onboards customers under its own brand. This is where your revenue multiplies — *you* build the product, *they* bring the customers.
- The **Company (Tenant)** is the HR customer. Every operational row (employee, leave, attendance, request) carries `company_id`.
- The org hierarchy (region → country → branch → department) lives inside a tenant and is completely self-defined.

---

## 2. Data-isolation strategy

### Chosen: **Shared database, shared schema, `company_id` discriminator (row-level scoping)**

**Why**
- Cost-efficient at 100s of tenants. No DB per tenant operations overhead.
- Cross-tenant analytics (platform-wide MRR, portfolio KPIs) are one query.
- Every MongoDB collection carries `company_id`, and every query pipe-mixes with the current user's `company_id` pulled from the JWT.
- Compound indexes (`{company_id: 1, <domain-field>: 1}`) keep query performance linear even at 100k+ employees.

**Defense in depth**
1. **Access layer (dependency)** — `get_current_user` attaches `company_id` to every request; each router filters by it.
2. **Role layer** — `require_roles("super_admin", "company_admin", ...)` dependencies stop unauthorized access.
3. **Network layer** — CORS strict origin list in prod.
4. **Data layer** — Mongo indexes on `company_id`; a planned background job will verify no cross-tenant references exist nightly.

### Escape hatch: dedicated DB for premium / regulated customers
- Same codebase, different `DB_NAME` selected by JWT claim `tenant_db`. Toggle flag on tenant record.
- Useful for healthcare, defense, or government clients that demand physical isolation.

---

## 3. Core services

| Module | Responsibilities | Key collections |
|---|---|---|
| Identity & auth | JWT (cookies + Bearer), bcrypt, roles, brute-force lockout | `users`, `login_attempts`, `password_reset_tokens` |
| Tenancy | Reseller, company, plans, white-label | `resellers`, `companies` |
| Org graph | Regions, countries, branches, departments | `regions`, `countries`, `branches`, `departments` |
| People | Employee profiles, roles, manager links | `employees` |
| Approval engine | Generic chain; sequential with conditional hooks | `approval_requests` |
| Work modules | Leave, attendance, product/service requests, vendors | `leave_requests`, `attendance`, `product_service_requests`, `vendors` |
| Dashboards | Role-based aggregates | (reads) |

---

## 4. Multi-level approval engine

A single generic engine runs every approval type — leave, expense, product/service request, hiring, policy acknowledgement, etc.

### Shape
```json
{
  "id": "uuid",
  "company_id": "...",
  "request_type": "leave | product_service | expense | ...",
  "requester_user_id": "...",
  "title": "Casual leave, 2 days",
  "status": "pending | approved | rejected",
  "current_step": 2,
  "linked_id": "<domain-object-id>",
  "steps": [
    { "step": 1, "approver_user_id": "u1", "approver_name": "Rahul", "approver_role": "branch_manager", "status": "approved", "decided_at": "...", "comment": "OK" },
    { "step": 2, "approver_user_id": "u2", "approver_name": "Priya", "approver_role": "company_admin", "status": "pending" }
  ]
}
```

### Chain construction
1. Start from the requester's `employee_id`.
2. Walk up `manager_id` chain (employee → manager → sub_manager → branch_manager). Each hop that has a linked login user becomes a step.
3. Append final fallback: the tenant's `company_admin` — ensures the chain always terminates at the top.

### Decision flow
- Only the current-step approver can act.
- `approve` → advance `current_step`. If no next step, overall status = `approved`.
- `reject` → short-circuit. Overall status = `rejected`.
- The engine writes back to the linked document (`leave_requests` / `product_service_requests`) so domain queries stay fast.

### Future extensions
- Conditional branches (amount > $10k → add CFO).
- Parallel approvals (any-of, all-of).
- Time-based escalations (auto-approve after N hours).
- Delegation (OOO user ⇒ approver swap).

---

## 5. Employee types & location semantics

| Type | Behaviour |
|---|---|
| `wfo` | Must check-in at their assigned branch (optionally geofenced). |
| `wfh` | Check-in from anywhere; location tag stored as `"remote"`. |
| `field` | Check-in with live GPS; geocoded against allowed area. |
| `hybrid` | Mix — their daily entry chooses type. |

All types use the same `/api/attendance/checkin` endpoint — type is a per-day field, not per-employee global.

---

## 6. Mobile strategy (Phase 2)

- **Single API surface** — the mobile app talks to `/api/*` just like the web SPA. `access_token` returned in body enables Bearer auth for RN/Expo clients without cookies.
- **React Native (Expo)** app targeting:
  - Employee workspace (check-in with GPS, leave, requests, profile)
  - Manager workspace (approvals queue, team roster)
- **Shared component contracts** — colors, typography, icon library (phosphor-icons). Port directly.
- **Offline-first tactics** — queue attendance events and replay on reconnect.
- **Push notifications** — FCM/APNs triggered from the approval engine on new items.

---

## 7. Scale plan — path to 100,000 employees per tenant

| Layer | Action |
|---|---|
| MongoDB | Sharded cluster keyed on `company_id`; compound indexes; TTL indexes on audit logs. |
| App | FastAPI behind an ASGI worker pool; stateless → horizontal scale. |
| Cache | Redis in front of employee directory and dashboard stats. |
| Queue | Worker queue (Celery / RQ / BullMQ) for async emails, PDFs, payroll runs. |
| Search | Elastic/Typesense for directory search (>10k employees). |
| Observability | Prometheus metrics, OpenTelemetry traces, structured JSON logs. |
| Storage | S3 (or R2) for docs/pay-stubs/uploaded attachments. |

---

## 8. Security & compliance

- Password hashing: bcrypt, ≥12 rounds.
- JWT: 12h access + 14d refresh, rotate refresh on use. Secret rotation via config.
- Cookies: `httpOnly`, `SameSite=Lax`, `Secure` in prod.
- Brute force: 5-attempt lockout per IP+email, 15 min cooldown.
- Role matrix enforced at dependency layer; secondary enforcement at the data layer via `company_id` filter.
- Audit log collection (planned) capturing all writes, append-only.
- Data residency: per-region Mongo clusters selectable via `tenant.region` (roadmap).
- GDPR / SOC 2: Right-to-erasure flow, data export endpoint, tenant off-boarding script (roadmap).

---

## 9. Billing & reseller commissions

- Subscription model: per-company, per-plan (Starter / Growth / Enterprise) — billed to the reseller OR directly to the company.
- Reseller commission = `commission_rate × company.MRR`. Calculated monthly, surfaced on the reseller dashboard.
- Stripe integration (Phase 2): `Subscription` objects per company, `Connect` accounts per reseller for automated payouts.

---

## 10. Roadmap

**Phase 1 (shipped in this MVP)**
- 4-tier tenancy model with row-level isolation
- Role-based auth (JWT + cookies)
- Org hierarchy CRUD + tree visualization
- Employee directory with filters
- Multi-level approval engine (generic)
- Leave, attendance, product/service request modules
- 5 persona dashboards + marketing landing

**Phase 2**
- React Native mobile app (Expo)
- Stripe billing + reseller payouts
- White-label theme/domain per reseller
- Payroll module (per-country rules)
- Performance / Goals / 1:1s
- Recruitment / ATS

**Phase 3**
- Advanced analytics & workforce planning
- SOC 2 / ISO 27001 certification track
- SSO (SAML, OIDC) for enterprise buyers
- Integrations: Slack, Teams, Gmail, Google Calendar
- Country-specific compliance packs (India PF/ESI, UK PAYE, etc.)

---

## 11. Proposed repo layout (current + forward-looking)

```
/app
├── backend/
│   ├── server.py                 # app bootstrap
│   ├── auth.py                   # JWT + bcrypt
│   ├── db.py                     # Mongo client + seeds
│   ├── models.py                 # Pydantic contracts
│   ├── routers/
│   │   ├── auth_routes.py
│   │   ├── resellers_routes.py
│   │   ├── companies_routes.py
│   │   ├── org_routes.py
│   │   ├── employees_routes.py
│   │   ├── approvals_routes.py
│   │   ├── leave_routes.py
│   │   ├── attendance_routes.py
│   │   ├── requests_routes.py
│   │   └── dashboard_routes.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/                # Landing, Login, 5 dashboards, 7 modules
│   │   ├── components/
│   │   ├── context/
│   │   └── lib/
│   └── package.json
├── ARCHITECTURE.md               # this file
└── memory/
    ├── PRD.md
    └── test_credentials.md
```

---

## 12. Default seeded demo

- **Platform:** `admin@hrms.io` / `Admin@123`
- **Reseller:** `reseller@demo.io` / `Reseller@123` (*Arlo Partners*, 20% rate)
- **HR Admin:** `hr@acme.io` / `Hr@12345` (*ACME Global*, enterprise plan)
- **Manager:** `manager@acme.io` / `Manager@123` (*Bengaluru HQ, Engineering*)
- **Employee:** `employee@acme.io` / `Employee@123` (*WFH*, reports to the manager above)

ACME Global is seeded with 2 regions (APAC, EMEA), 2 countries (India, UK), 2 branches (Bengaluru HQ, London), 2 departments (Engineering, Sales), and 6 employees.
