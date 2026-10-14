/** Frontend-safe API contracts. These describe response payloads, not database access. */
export type IdentityKind = "email" | "social_profile" | "website" | "username" | "phone" | "other";
export type SourceStatus = "unverified" | "authorized" | "disabled";
export type FindingSeverity = "low" | "medium" | "high" | "critical";
export type FindingStatus = "open" | "resolved" | "dismissed";
export type RemovalRequestKind = "site_takedown" | "credential_reset" | "manual_review";
export type RemovalRequestStatus = "draft" | "submitted" | "in_progress" | "completed" | "rejected";

export interface ApiError { error: { message: string; details?: unknown } }
export interface ApiList<T> { data: T[] }
export interface ApiItem<T> { data: T }
export interface IdentityDto { id: string; label: string; kind: IdentityKind; identifier: string; hasPrivateNotes?: boolean; privateNotes?: string | null; created_at: string; updated_at: string }
export interface SourceDto { id: string; name: string; reference: string; status: SourceStatus; authorization_note?: string | null; last_checked_at?: string | null; created_at: string; updated_at: string }
export interface FindingDto { id: string; source_id: string | null; title: string; description: string; severity: FindingSeverity; status: FindingStatus; is_demo: boolean; provider_name?: string | null; evidence_url?: string | null; evidence_summary?: string | null; detected_at: string; resolved_at: string | null; created_at: string }
export interface RemovalRequestDto { id: string; finding_id: string | null; kind: RemovalRequestKind; status: RemovalRequestStatus; target_url: string; provider_name: string; notes: string; external_reference: string | null; created_at: string; updated_at: string }
export interface DashboardDto { counts: { identities: number; sources: number; findings: number; openFindings: number; activeRemovalRequests: number }; recentFindings: Pick<FindingDto, "id" | "title" | "severity" | "status" | "is_demo" | "detected_at" | "source_id">[]; generatedAt: string }
export interface AuthMeDto { authenticated: true; user: { id: string; email: string | null } }
export interface MonitorDemoDto { mode: "demo"; checkedSources: number; createdFindings: Pick<FindingDto, "id" | "source_id" | "title" | "severity" | "status" | "is_demo" | "detected_at">[]; warning: string }
export interface AuditLogDto { id: string; action: string; entity_type: string; entity_id: string | null; metadata: Record<string, unknown>; created_at: string }
