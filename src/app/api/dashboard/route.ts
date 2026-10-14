import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { internalError } from "@/lib/http";

/** Summary endpoint for the frontend dashboard. Counts are scoped by Supabase RLS. */
export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const db = auth.supabase;
  const [identities, sources, findings, openFindings, removalRequests, recentFindings] = await Promise.all([
    db.from("identities").select("id", { count: "exact", head: true }),
    db.from("sources").select("id", { count: "exact", head: true }),
    db.from("findings").select("id", { count: "exact", head: true }),
    db.from("findings").select("id", { count: "exact", head: true }).eq("status", "open"),
    db.from("removal_requests").select("id", { count: "exact", head: true }).in("status", ["draft", "submitted", "in_progress"]),
    db.from("findings").select("id,title,severity,status,is_demo,detected_at,source_id").order("detected_at", { ascending: false }).limit(5),
  ]);

  const failed = [identities, sources, findings, openFindings, removalRequests, recentFindings].find((result) => result.error);
  if (failed?.error) return internalError(failed.error);

  return NextResponse.json({
    data: {
      counts: {
        identities: identities.count ?? 0,
        sources: sources.count ?? 0,
        findings: findings.count ?? 0,
        openFindings: openFindings.count ?? 0,
        activeRemovalRequests: removalRequests.count ?? 0,
      },
      recentFindings: recentFindings.data ?? [],
      generatedAt: new Date().toISOString(),
    },
  });
}
