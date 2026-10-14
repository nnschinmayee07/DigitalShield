# DigitalShield frontend contracts

Base URL during local development: `http://localhost:3001`. JSON requests should send `Content-Type: application/json`. Authenticated routes use the Supabase session cookie created by `/login`; call them from the same origin or configure credentials if the frontend is hosted separately. The magic-link route uses the SSR cookie adapter so the PKCE verifier survives the redirect and can be exchanged by `/auth/callback`.

## Shared response conventions

- Success list: `{ "data": [...] }`
- Success item: `{ "data": { ... } }`
- Error: `{ "error": { "message": "...", "details"?: ... } }`
- Dashboard/session/monitor routes have their documented specialized shapes below.
- Do not treat demo findings as real detected exposures: `is_demo: true` means synthetic demonstration data.

## Endpoint contract table

| Method | Path | Body/query | Successful response |
|---|---|---|---|
| GET | `/api/health` | none | `{ ok, service, version, configured, timestamp }` |
| GET | `/api/auth/me` | session cookie | `{ authenticated: true, user: { id, email } }`; otherwise 401 |
| POST | `/api/auth/magic-link` | `{ email }` | `{ ok: true, message }` (generic message avoids account enumeration) |
| POST | `/api/auth/logout` | session cookie | `{ ok: true }` |
| GET | `/api/dashboard` | session cookie | `{ data: { counts, recentFindings, generatedAt } }` |
| GET/POST | `/api/identities` | POST `{ label, kind?, identifier, privateNotes? }` | `{ data: [...] }` / `{ data: identity }` |
| GET/PATCH/DELETE | `/api/identities/:id` | PATCH any of `{ label, kind, identifier, privateNotes }` | item / item / `{ ok: true, id }` |
| GET/POST | `/api/sources` | POST `{ name, reference }` | list / new source (status starts `unverified`) |
| PATCH/DELETE | `/api/sources/:id` | PATCH `{ status, authorizationNote? }` | updated source / `{ ok: true, id, message }` |
| GET | `/api/findings?status=open` | optional status filter | `{ data: finding[] }` |
| POST | `/api/findings/report` | `{ sourceId?, providerName, title, severity?, evidenceUrl, evidenceSummary }` | `{ data: finding, note }` |
| PATCH | `/api/findings/:id` | `{ status }` | `{ data: finding status summary }` |
| POST | `/api/monitor` | `{ sourceId }` for a user-owned `authorized` source | `{ data: { source, pagesVisited, matchesFound, identitiesChecked, identitiesTruncated, newFindings, blockedByRobots, limitReached, warning } }` |
| GET/POST | `/api/removal-requests` | POST `{ findingId?, kind?, targetUrl, providerName, notes? }` | list / `{ data: request, note }` |
| PATCH | `/api/removal-requests/:id` | `{ status?, externalReference?, notes? }` | `{ data: request }` |
| GET | `/api/audit-logs` | none | `{ data: auditLog[] }` |

## Copy-ready mock data

### Dashboard (`GET /api/dashboard`)

```json
{
  "data": {
    "counts": {
      "identities": 3,
      "sources": 2,
      "findings": 4,
      "openFindings": 2,
      "activeRemovalRequests": 1
    },
    "recentFindings": [
      {
        "id": "a6bd7a21-33d8-4c7e-8b83-a6c8a4d5c101",
        "title": "Demo review: Personal website",
        "severity": "low",
        "status": "open",
        "is_demo": true,
        "detected_at": "2026-10-14T04:00:00.000Z",
        "source_id": "5be7e76a-a4f5-4b8c-90d0-4b7e2e6d9c10"
      }
    ],
    "generatedAt": "2026-10-14T04:00:00.000Z"
  }
}
```

### Identity create request

```json
{
  "label": "Primary email",
  "kind": "email",
  "identifier": "demo@example.com",
  "privateNotes": "Demo-only private note"
}
```

`privateNotes` is encrypted on the server using AES-256-GCM. It is never returned in list responses; the single identity GET returns `privateNotes` after decryption for the owner.

### Source create request

```json
{
  "name": "Personal website",
  "reference": "https://example.com/profile"
}
```

New sources always start `unverified`. To change the status to `authorized`, PATCH `/api/sources/:id` with `{ "status": "authorized", "authorizationNote": "I own this domain and authorize checks." }`. This is an explicit user attestation, not an external ownership verification.

### Authorized source scan

```json
{
  "sourceId": "5be7e76a-a4f5-4b8c-90d0-4b7e2e6d9c10"
}
```

`POST /api/monitor` requires a signed-in user, a source owned by that user and marked `authorized`, and at least one saved email, phone number, username, or social profile. It checks at most four public HTML pages beneath the registered URL path and the 100 most recently added supported identifiers, follows same-origin links only, honors `robots.txt` and crawl-delay, caps responses at 1 MiB, limits each source to one scan per minute, and stops after 20 seconds. Private/reserved IP addresses, nonstandard ports, and redirects outside the registered origin/path are rejected. Potential matches are heuristic; the matched value and fetched page contents are not stored. Review any result manually.

### Exposure report request

```json
{
  "providerName": "Example provider report",
  "title": "Possible public exposure reported",
  "severity": "medium",
  "evidenceUrl": "https://example.com/report/123",
  "evidenceSummary": "Provider-reported summary; no credentials included."
}
```

Never submit raw passwords, session cookies, API tokens, credential dumps, or other secrets in an evidence summary.

### Removal request

```json
{
  "kind": "manual_review",
  "targetUrl": "https://example.com/report/123",
  "providerName": "Example provider",
  "notes": "Please review the provider's official removal process."
}
```

This records and tracks a request only. It does not automatically contact the provider or remove external content.

## Frontend behavior recommendations

- Display a login state from `/api/auth/me`; handle 401 as signed out.
- Show loading, empty, success, and error states for every list.
- Show a visible “Demo data” label when `is_demo` is true. `/api/monitor` results are live heuristic checks and must be described as possible matches, not verified exposure.
- Ask for confirmation before DELETE actions or status changes.
- Do not put the Supabase service-role key, encryption key, or Upstash token in frontend variables.
- Prefer a shared fetch helper that parses `{ data }` and `{ error }` envelopes consistently.
