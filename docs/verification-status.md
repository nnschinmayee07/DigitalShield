# Verification status

Last verified: 2026-10-15

## Automated checks

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm test` — passed (15 tests), including password-auth payload validation.
- `npm run build` — passed with Next.js 15.5.27.
- `npm audit --omit=dev` — passed (0 production dependency vulnerabilities).

The full development dependency audit still reports high-severity findings in
the ESLint dependency chain. The suggested forced fix would downgrade the
Next.js ESLint configuration, so it has not been applied.

## Live smoke checks

- The configured Supabase Auth health endpoint returned HTTP 200.
- A fresh production build served `/` and `/login` successfully.
- Supabase reports the Email auth provider enabled and sign-up allowed; email
  confirmation is required for newly created accounts.
- A live Upstash Redis `PING` returned `PONG`.
- Unauthenticated requests to protected API routes returned HTTP 401.
- Core identity, source, finding, and audit-log tables and columns were visible
  through the Supabase API.
- The live Supabase API returned `PGRST205` for `removal_requests`, and the
  findings evidence fields (`provider_name`, `evidence_url`, and
  `evidence_summary`) are not currently visible. The removal-request workflow
  and evidence/findings workflows therefore cannot be considered available
  until migrations `0002_removal_requests.sql` and
  `0003_finding_evidence.sql` are applied, or the PostgREST schema cache is
  refreshed if those migrations were already applied.
- No account was registered and no sign-in or password-reset email was sent.
  Email delivery, successful callback/session creation, authenticated CRUD,
  and crawler persistence still need an end-to-end test using an authorized
  account.
- The live Supabase schema cache does not expose the `removal_requests` table
  or findings evidence columns. Removal-request and evidence workflows remain
  blocked until migrations `0002_removal_requests.sql` and
  `0003_finding_evidence.sql` are applied or the schema cache is refreshed.
- Supabase Auth publicly reports the Email provider enabled, registration
  enabled, and email confirmation required. A production password request with
  deliberately invalid credentials returned the expected generic HTTP 401.
- Recently registered accounts now receive a non-enumerating reminder to
  confirm their email if password sign-in fails for that reason. A real
  account's successful login and session creation remain unverified.
- The production auth redirect allowlist, actual email delivery, account
  registration, recovery email, and successful session creation have not been
  verified.

## Deployment

The Vercel production project has its Supabase URL/key, field encryption key,
application URL, and Upstash REST credentials configured. Commit
`5f973ef` is deployed and Ready at `https://digitalshield-ten.vercel.app`.
Production `/`, `/login`, and `/reset-password` returned HTTP 200;
`/api/health` reports Supabase and field encryption configured; unauthenticated
private API routes return HTTP 401. Upstash connectivity was verified with
`PING`/`PONG`. Add `https://digitalshield-ten.vercel.app/auth/callback` to the
Supabase Auth redirect allowlist and configure custom SMTP delivery before
relying on account confirmation and password recovery emails. Production API
routes fail closed with `503` if Upstash rate limiting is unavailable.
