# DigitalShield — Privacy Command Center

A unified Next.js App Router + TypeScript + Supabase application with a responsive frontend dashboard and its backend API in one project. The workspace includes overview metrics, identity vault, findings, source registry, removal-request tracking, and an activity log. It is designed for local development and project demonstration; review the security notes before production use.

## Included

- Responsive frontend dashboard with navigation for Overview, Identities, Findings, Sources, Removal Requests, and Activity Log.
- Clearly labelled preview workspace with sample records before sign-in; signed-in views load data through the protected API.
- Identity and source creation forms connected to the API.
- Supabase cookie-based user authentication helpers; every private route checks the signed-in user.
- PostgreSQL schema with Row Level Security (RLS) and ownership policies.
- Identity CRUD; sensitive `private_notes` encrypted server-side with AES-256-GCM.
- Source registry CRUD; new sources are `unverified`, and only `authorized` sources are eligible for monitoring.
- Findings listing/resolution, audit event listing, manual evidence reports, and an authorized public-page crawler.
- Zod request validation and consistent JSON error responses.

## 1. Requirements

- Node.js 20.9+
- A Supabase project (free tier is fine)
- VS Code or another editor

## 2. Install

```bash
npm install
cp .env.example .env.local
```

On Windows PowerShell use `Copy-Item .env.example .env.local` instead of `cp`.

In `.env.local`, set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from Supabase → Project Settings → API (the Supabase publishable key is suitable for this variable). Generate an encryption key with Node.js (works in Windows Command Prompt, PowerShell, macOS, and Linux):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Paste the result into `FIELD_ENCRYPTION_KEY`. If you already shared a key publicly, generate a new one and use the new value before storing real data. It must be a base64-encoded 32-byte key. Keep `.env.local` private and never commit it. Do not use a Supabase service-role key in this app; these routes use the signed-in user's session and RLS.

## 3. Create the database

In Supabase → SQL Editor → New query, run the migrations in order: `0001_initial_schema.sql`, `0002_removal_requests.sql`, then `0003_finding_evidence.sql`, then `0004_security_hardening.sql`. If you already applied migration 0001, run migrations 0002, 0003, and 0004 in that order. If migrations 0002 or 0003 are already applied, run only the migrations not yet applied. Each migration is intended to be applied once.

Enable the Email provider in Supabase Authentication settings and allow email/password sign-in and registration. Add `http://localhost:3001/auth/callback` and `http://localhost:3000/auth/callback` to allowed redirect URLs for whichever local port you use. Set `NEXT_PUBLIC_APP_URL` to that exact origin (for this project: `http://localhost:3001`). The `/login` page supports email/password sign-in, registration, and password recovery. Supabase may require email confirmation for new accounts depending on the project’s Auth settings. Password recovery links return to `/auth/callback`, exchange the one-time code for a secure session, and continue to `/reset-password`. Password auth is rate-limited; the callback logs safe diagnostics and uses HTTP-only Supabase session cookies. Each protected API route independently verifies the user.

## 4. Run

```bash
npm run dev
```

Open http://localhost:3001. Check `GET /api/health` for configuration status. The health route never returns secrets.

## Deploy to Vercel

Import `nnschinmayee07/DigitalShield` in Vercel as a Next.js project. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `FIELD_ENCRYPTION_KEY`, `NEXT_PUBLIC_APP_URL`, `UPSTASH_REDIS_REST_URL`, and `UPSTASH_REDIS_REST_TOKEN` to the Vercel environment settings. API routes fail closed with `503` in production if Upstash rate limiting is not configured. Set `NEXT_PUBLIC_APP_URL` to the deployed HTTPS origin, then add `<deployed-origin>/auth/callback` to the Supabase Auth redirect allowlist. Apply all database migrations before using authenticated routes. Keep server secrets out of `NEXT_PUBLIC_` variables and source control.

## Automated checks

Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`. Or run `npm run check` to run all four in sequence. The tests cover AES-256-GCM round-trips/tamper detection and core identity payload validation. A successful local build does not replace an end-to-end test against your own Supabase project.

## Frontend and API

The frontend lives in `src/app/page.tsx` with styling in `src/app/globals.css`; the login flow is at `/login`. The UI calls the same-origin API routes, so no separate frontend server or CORS configuration is needed. Import shared TypeScript DTOs from `src/lib/api-types.ts`. Copy-ready payloads and endpoint contracts are in `docs/frontend-contracts.md`. All protected endpoints require a Supabase session cookie; do not put service-role keys in the browser.

## API overview

Authentication checks: `GET /api/auth/me` returns the current signed-in user or `401`; `POST /api/auth/logout` ends the current session.

All data routes require a valid Supabase user session except the public health check and `/api/auth/password` (which is rate-limited). Requests and responses are JSON. For writes, send `Content-Type: application/json`.

| Method | Endpoint | Purpose |
|---|---|---|
| GET, POST | `/api/identities` | List/create identity records |
| GET | `/api/dashboard` | Current-user dashboard counts and recent findings |
| GET, PATCH, DELETE | `/api/identities/:id` | Read/update/delete an identity |
| GET, POST | `/api/sources` | List/register a source (new source is always unverified) |
| PATCH, DELETE | `/api/sources/:id` | Change status/remove from registry |
| GET | `/api/findings` | List findings, optional `?status=open` |
| POST | `/api/findings/report` | Record an exposure report from an authorized provider/user |
| PATCH | `/api/findings/:id` | Resolve/reopen a finding |
| GET | `/api/audit-logs` | List recent audit events |
| GET, POST | `/api/removal-requests` | Create/list authorized remediation requests |
| PATCH | `/api/removal-requests/:id` | Update remediation request status/reference |
| POST | `/api/auth/password` | Rate-limited email/password sign-in, sign-up, reset request, and password update |
| GET | `/api/auth/me` | Verify the current session |
| POST | `/api/auth/logout` | End the current session |
| POST | `/api/monitor` | Crawl one authorized source with `{ "sourceId": "..." }` |

### Example: create an identity

```bash
curl -X POST http://localhost:3001/api/identities \
  -H 'Content-Type: application/json' \
  -d '{"label":"Personal email","kind":"email","identifier":"me@example.com","privateNotes":"Sensitive note"}'
```

This example assumes you send an authenticated session cookie (adjust port if your app uses 3000). An unauthenticated request correctly returns `401`.

### Source status rules

- A source created through the API is always `unverified`; clients cannot self-assert authorization in the create request.
- Transitioning to `authorized` is an explicit user attestation and records an audit event; it does not independently verify ownership or consent.
- The crawler only considers a source owned by the signed-in user and currently marked `authorized`. It checks up to four public HTML pages below the registered path and the 100 most recently added supported identities, follows same-origin links only, rejects private/reserved DNS results and redirects, respects `robots.txt` and crawl-delay, caps response sizes and total request time, and allows one scan per source per minute.
- Scans compare public page text against the signed-in user's saved email, phone, username, and social-profile identifiers. Possible matches require manual review; only the evidence URL and identifier category are stored, not the matched value or page contents. The crawler does not query search engines, breach databases, authenticated pages, or third-party takedown APIs.
- Source authorization is self-attested, so verify ownership/permission before enabling real scans. Do not scan sources without permission.
- Removing a source deletes only the DigitalShield registry row; it cannot remove content hosted by another service. Removal requests track provider remediation, but do not automatically delete third-party content; use the provider's authorized takedown or credential-reset process.

## Redis rate limiting

Create an Upstash Redis database and set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in `.env.local` for distributed rate limiting. API requests are limited by IP and path; password-authentication requests have a stricter limit. Without these variables, a best-effort in-memory fallback is used only during local development; production requests fail closed with `503`. Never expose the Redis token in client-side variables.

## Security notes before real deployment

This is a strong starting scaffold, not a completed security audit. Before production: implement email verification and recovery UX, independently verify source ownership/consent, configure Upstash distributed rate limiting, configure CSP/security headers, review data retention/deletion, configure Supabase backups, and conduct a security review. The included in-memory rate-limit fallback is not suitable for multi-instance production. Keep encryption keys backed up securely; losing the key makes encrypted notes unrecoverable. Rotating the key requires a migration/re-encryption procedure.

Crawler results are heuristic and are not independently verified evidence of exposure. `POST /api/findings/report` records evidence metadata from an authorized provider or user-submitted report; it does not crawl threat sites. The linked Cryptography-final-year-project repository currently exposes a README describing a classical multi-cipher concept, not the implementation source. Do not use classical ciphers for storing real credentials; AES-256-GCM remains the storage encryption. Any additional exposure-provider or takedown integration must be authorized and configured separately.
"# DigitalShield" 
