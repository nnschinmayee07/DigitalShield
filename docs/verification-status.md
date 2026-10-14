# Verification status

Last verified: 2026-10-15

## Automated checks

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm test` — passed (11 tests).
- `npm run build` — passed with Next.js 15.5.27.
- `npm audit --omit=dev` — passed (0 production dependency vulnerabilities).

The full development dependency audit still reports high-severity findings in
the ESLint dependency chain. The suggested forced fix would downgrade the
Next.js ESLint configuration, so it has not been applied.

## Live smoke checks

- The configured Supabase Auth health endpoint returned HTTP 200.
- A fresh production build served `/` and `/login` successfully.
- Invalid magic-link input returned HTTP 400; unauthenticated requests to
  protected API routes returned HTTP 401.
- Core identity, source, finding, and audit-log tables and columns were visible
  through the Supabase API.
- The live Supabase API returned `PGRST205` for `removal_requests`, and the
  findings evidence fields (`provider_name`, `evidence_url`, and
  `evidence_summary`) are not currently visible. The removal-request workflow
  and evidence/findings workflows therefore cannot be considered available
  until migrations `0002_removal_requests.sql` and
  `0003_finding_evidence.sql` are applied, or the PostgREST schema cache is
  refreshed if those migrations were already applied.
- No sign-in email was sent and no authenticated database writes were made;
  email delivery, successful callback/session creation, authenticated CRUD,
  and crawler persistence still need an end-to-end test using an authorized
  account.

## Deployment

Vercel deployment has not been verified. Configure Supabase,
`FIELD_ENCRYPTION_KEY`, `NEXT_PUBLIC_APP_URL`, and Upstash Redis credentials in
the deployment environment before exposing the application. Production API
routes fail closed with `503` when Upstash rate limiting is not configured.
