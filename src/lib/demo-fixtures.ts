/** Synthetic frontend fixtures for UI development only; never treated as scan evidence. */
import type { AuditLogDto, DashboardDto, FindingDto, IdentityDto, RemovalRequestDto, SourceDto } from "@/lib/api-types";

const timestamp = "2026-10-14T04:00:00.000Z";
export const demoIdentities: IdentityDto[] = [
  { id: "11111111-1111-4111-8111-111111111111", label: "Primary email", kind: "email", identifier: "demo@example.com", hasPrivateNotes: true, created_at: timestamp, updated_at: timestamp },
  { id: "22222222-2222-4222-8222-222222222222", label: "Portfolio website", kind: "website", identifier: "https://example.com/portfolio", hasPrivateNotes: false, created_at: timestamp, updated_at: timestamp },
];

export const demoSources: SourceDto[] = [
  { id: "33333333-3333-4333-8333-333333333333", name: "Example portfolio", reference: "https://example.com/portfolio", status: "authorized", authorization_note: "Synthetic demo fixture; no external checks are performed.", last_checked_at: timestamp, created_at: timestamp, updated_at: timestamp },
  { id: "44444444-4444-4444-8444-444444444444", name: "Social profile", reference: "https://example.com/profile", status: "unverified", authorization_note: null, last_checked_at: null, created_at: timestamp, updated_at: timestamp },
];

export const demoFindings: FindingDto[] = [
  { id: "55555555-5555-4555-8555-555555555555", source_id: demoSources[0].id, title: "Demo review: Example portfolio", description: "Synthetic presentation record. No external service was queried.", severity: "low", status: "open", is_demo: true, provider_name: null, evidence_url: null, evidence_summary: null, detected_at: timestamp, resolved_at: null, created_at: timestamp },
  { id: "66666666-6666-4666-8666-666666666666", source_id: null, title: "Provider-reported sample exposure", description: "Placeholder record for designing the finding details view.", severity: "medium", status: "resolved", is_demo: true, provider_name: "Demo provider", evidence_url: "https://example.com/report/demo", evidence_summary: "Synthetic evidence summary; no credential data included.", detected_at: timestamp, resolved_at: timestamp, created_at: timestamp },
];

export const demoRemovalRequests: RemovalRequestDto[] = [
  { id: "77777777-7777-4777-8777-777777777777", finding_id: demoFindings[0].id, kind: "manual_review", status: "submitted", target_url: "https://example.com/report/demo", provider_name: "Demo provider", notes: "Placeholder only. Submit real requests through the provider's official process.", external_reference: "DEMO-001", created_at: timestamp, updated_at: timestamp },
];

export const demoAuditLogs: AuditLogDto[] = [
  { id: "88888888-8888-4888-8888-888888888888", action: "finding.reported", entity_type: "finding", entity_id: demoFindings[1].id, metadata: { demo: true }, created_at: timestamp },
];

export const demoDashboard: DashboardDto = {
  counts: { identities: demoIdentities.length, sources: demoSources.length, findings: demoFindings.length, openFindings: demoFindings.filter((finding) => finding.status === "open").length, activeRemovalRequests: demoRemovalRequests.filter((request) => !["completed", "rejected"].includes(request.status)).length },
  recentFindings: demoFindings.slice(0, 5).map(({ id, title, severity, status, is_demo, detected_at, source_id }) => ({ id, title, severity, status, is_demo, detected_at, source_id })),
  generatedAt: timestamp,
};
