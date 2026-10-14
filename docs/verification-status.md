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

## Deployment

The Vercel production project has its Supabase URL/key, field encryption key,
application URL, and Upstash REST credentials configured. Deploy and verify
the latest commit before treating hosting as complete. Add the deployed
`/auth/callback` URL to the Supabase Auth redirect allowlist. Production API
routes fail closed with `503` if Upstash rate limiting is unavailable.
