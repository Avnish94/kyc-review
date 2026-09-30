# KYC Review — internal tool proof of concept

A working prototype of an internal **KYC (Know Your Customer) review queue** for a hypothetical Series C fintech.
Compliance analysts sign in, work through a queue of customers flagged by automated screening, review each
case, and approve / reject / request more information. Every decision is recorded in an audit trail.

> **Prototype only.** Authentication and authorization are mock implementations for demonstration. They are
> **not** production-grade security. All customer data is **synthetic** (generated with Faker); the app does
> not connect to any real customer, KYC, banking or payment system.

![Queue](docs/screenshots/queue.png)

## Quick start

Requirements: **Node.js 20+** and npm. No database server is needed (SQLite file).

```bash
npm install          # also runs `prisma generate`
cp .env.example .env # local dev defaults (SQLite path + dev-only session secret)
npm run setup        # creates prisma/dev.db, applies migrations, seeds synthetic data
npm run dev          # http://localhost:3000
```

Reset the demo data at any time with `npm run db:reset`.

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm test` | Unit + integration tests (Vitest, uses a throwaway `prisma/test.db`) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run db:reset` | Drop, re-migrate and re-seed the local database |

## Demo credentials

| Role | Email | Password | Can do |
| --- | --- | --- | --- |
| Analyst | `analyst@demo.local` | `analyst123` | View queue, request info, approve/reject **Low/Medium** risk cases |
| Analyst | `analyst2@demo.local` | `analyst123` | Same as above (second reviewer for demos) |
| Admin | `admin@demo.local` | `admin123` | Everything an Analyst can do, plus decide **High** risk cases and **reopen** decided cases |

The credentials are also shown on the login page.

### Suggested demo script (≈3 minutes)

1. Sign in as the **Analyst**. Show the queue: status summary cards, search (name / case ref / email), and the status + risk filters.
2. Filter to **High risk + Pending review** and open a case. Approve/Reject are disabled with the reason "High-risk decisions require an Admin".
3. Click **Request more info** without a note → validation error. Add a note and submit → status changes and a new audit entry appears.
4. Sign out, sign in as the **Admin**, open the same case: **Mark info received** → **Approve**. The audit history shows the full trail, with who did what and when.
5. As Admin, **Reopen** the decided case (note required). Sign back in as the Analyst to show that Reopen is Admin-only.

## Features

- **Mock login** with two roles (Analyst, Admin) and a signed, HTTP-only session cookie.
- **Review queue** of 60 seeded synthetic cases: customer, case ref, risk score, risk level, reason for review, status, last updated; server-side search and filtering via URL query params (shareable/bookmarkable).
- **Case detail**: reason for review with risk score, customer profile, KYC document info (masked), decision panel and audit timeline.
- **Enforced workflow**: only valid status transitions are offered or accepted; role rules are enforced on the server.
- **Audit history**: every status change writes an append-only audit record (actor, action, from → to status, note, timestamp) in the same DB transaction.
- **Local persistence** in a SQLite file, so demo actions survive restarts.

## Business rules

### Status transitions

```
                    ┌──────── Request info (note) ───────┐
                    │                                    ▼
             ┌──────────────┐                    ┌────────────────┐
  created ──▶│ PENDING_REVIEW│◀─ Mark info rec'd ─│ INFO_REQUESTED │
             └──────────────┘                    └────────────────┘
               │         │                                │
       Approve │         │ Reject (note)                  │ Reject (note)
               ▼         ▼                                ▼
         ┌──────────┐ ┌──────────┐ ◀──────────────────────┘
         │ APPROVED │ │ REJECTED │
         └──────────┘ └──────────┘
               └─────┬─────┘
                     └── Reopen (Admin only, note) ──▶ PENDING_REVIEW
```

| From | Action | To | Note |
| --- | --- | --- | --- |
| Pending review | Approve | Approved | optional |
| Pending review | Reject | Rejected | **required** |
| Pending review | Request more info | Info requested | **required** |
| Info requested | Mark info received | Pending review | optional |
| Info requested | Reject | Rejected | **required** |
| Approved / Rejected | Reopen | Pending review | **required** |

Anything else (for example approving directly from *Info requested*, or rejecting an approved case) is refused.
The *Mark info received* action stands in for the customer responding, since there is no customer portal.

### Permissions

| Action | Analyst | Admin |
| --- | --- | --- |
| View queue and cases | ✓ | ✓ |
| Request more info / Mark info received | ✓ | ✓ |
| Approve / Reject — Low & Medium risk | ✓ | ✓ |
| Approve / Reject — **High** risk | ✗ | ✓ |
| Reopen a decided case | ✗ | ✓ |

Risk level comes from the screening risk score: `0–39 Low`, `40–69 Medium`, `70–100 High`.

## Architecture

```
Browser
  │  HTML (React Server Components) + small client components (forms, filters)
  ▼
Next.js 15 (App Router, single Node process)
  ├─ middleware.ts ─────────── redirects to /login when there's no valid session cookie
  ├─ app/login, app/cases ──── pages (server components read data directly)
  ├─ Server Actions ────────── login/logout, submitCaseAction
  │        │
  │        ▼
  ├─ lib/kyc/service.ts ────── performCaseAction: transaction { re-check status → evaluate → update → audit }
  │        │
  │        ├─ lib/kyc/workflow.ts ── pure state machine: transition table + note rules
  │        └─ lib/authz.ts ───────── pure role policy: canPerformAction(role, action, riskLevel)
  ▼
Prisma ORM ──▶ SQLite (prisma/dev.db)
```

All business rules live in two small, framework-free modules — `src/lib/kyc/workflow.ts` and
`src/lib/authz.ts`. The UI uses them to decide which buttons to show or disable (and why); the service layer calls
them again on the server before any write, so the UI is never the enforcement point.

### Project structure

```
prisma/
  schema.prisma            User, KycCase, AuditEvent
  migrations/              SQL migrations (Prisma Migrate)
  seed.ts                  deterministic synthetic data; history replayed through the real workflow rules
src/
  middleware.ts            session gate
  app/
    login/                 login page + client form
    cases/layout.tsx       authenticated shell (header, role badge, sign out)
    cases/page.tsx         review queue (search, filters, summary cards)
    cases/[id]/page.tsx    case detail
    cases/[id]/actions.ts  Server Action for review decisions
  components/              ActionPanel, AuditTimeline, CaseFilters, Badges
  lib/
    auth/                  session (JWT sign/verify), current-user, login/logout actions
    authz.ts               role-based permission policy
    kyc/types.ts           enums, labels, risk-level mapping
    kyc/workflow.ts        status state machine
    kyc/service.ts         transactional action + audit write
    kyc/queries.ts         queue / detail read queries
tests/
  authz.test.ts            permission matrix
  workflow.test.ts         every (status × action) combination + note rules
  service.test.ts          DB integration: atomic audit, forbidden, invalid, stale-conflict, not-found
```

### Data model

- **User** — `email`, `name`, `role` (`ANALYST` | `ADMIN`; the seed also creates a non-login `SYSTEM` user that authors "Case created" events), `passwordHash` (bcrypt).
- **KycCase** — `caseRef`, customer identity fields, masked document info, `riskScore`, `riskLevel`, `reviewReason`, `reasonDetail`, `status`, timestamps.
- **AuditEvent** — `caseId`, `actorId`, `action`, `fromStatus`, `toStatus`, `note`, `createdAt`. Rows are only ever inserted; the app has no update or delete path for them.

### Key technical decisions

| Decision | Why |
| --- | --- |
| **Next.js (App Router) + TypeScript**, one app | Full-stack in one language and process; Server Actions remove the need for a separate REST layer. Closest familiar replacement for a Power Apps form-over-data app. |
| **SQLite + Prisma** | Zero setup for a demo, typed queries, real migrations. Moving to Postgres is mostly a `provider` change. |
| **Pure workflow + authz modules** | Business rules are easy to read, reuse (UI, service, seed) and exhaustively unit-test without a DB or framework. |
| **Transaction with compare-and-set on status** | Status change and its audit record commit together; a user acting on a stale page gets a clear "updated by someone else" error rather than silently overwriting. |
| **Signed JWT cookie (`jose`) + bcrypt** | Mock auth that still follows real patterns (hashed passwords, HTTP-only cookie, server-side re-validation of the user on every request). |
| **URL-driven filters** | Queue state is shareable and back-button friendly, and filtering happens in the database. |
| **Deterministic Faker seed** | Same data on every reset; seeded histories go through `evaluateAction`, so demo data can never violate the rules. |

### Compromises made for the 2-hour scope

- **SQLite has no enums**, so statuses, roles, etc. are stored as strings and validated in TypeScript (`src/lib/kyc/types.ts`) instead of by the database.
- **Search** uses SQLite `LIKE` (case-insensitive for ASCII only). There is no pagination, since 60 rows don't need it.
- **Session secret** defaults to a dev-only value in `.env.example`. Sessions are stateless JWTs, so logout clears the cookie but can't revoke a copied token before it expires (8h).
- **Middleware** uses the Node.js runtime (`runtime: "nodejs"`) to avoid Edge-runtime warnings from `jose`. It only checks the cookie signature; pages then re-load the user from the DB.
- **Timestamps** are shown in UTC to keep server rendering deterministic.
- **"Mark info received"** is an analyst action that stands in for a customer-facing document upload flow.
- **Tests** cover business logic and the service layer. There are no automated browser (E2E) tests.

## What's needed before production

**Security and identity**
- Replace mock login with the company IdP (SSO via OIDC/SAML, e.g. Entra ID / Okta) and MFA; map IdP groups to roles.
- Server-side session store or short-lived tokens with revocation; secret management (KMS/Vault); rotate secrets.
- CSRF review beyond Next.js Server Action defaults, rate limiting, security headers/CSP, dependency and container scanning.
- Fine-grained authorization (for example case assignment, four-eyes approval so the requester can't also approve, and data scoping by region or entity).

**Data and compliance**
- Managed Postgres with backups, point-in-time recovery, encryption at rest, and field-level encryption or tokenization for PII.
- Tamper-evident audit log (DB-level append-only permissions or hash chaining, or ship events to a WORM/SIEM store); also log logins and case views.
- Data retention and deletion policies (GDPR/CCPA), PII masking in logs, and access reviews.
- Real integrations: screening/KYC vendors, document storage and viewer, customer outreach for information requests, case-management webhooks.

**Product**
- Case assignment and locking, SLAs and ageing, escalation queues, bulk actions, pagination and sorting, reporting and dashboards.
- Reason codes (structured rejection reasons), attachments, richer customer history.
- Accessibility audit (WCAG 2.1 AA), responsive polish, i18n and time-zone handling.

**Engineering and operations**
- CI (lint, typecheck, tests, build), E2E tests (e.g. Playwright), preview environments.
- Containerization, IaC, environment configuration, migrations in the deploy pipeline.
- Observability: structured logging, metrics, tracing, error tracking, alerting.
