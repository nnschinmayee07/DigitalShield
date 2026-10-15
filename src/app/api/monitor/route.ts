import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/http";
import { writeAudit } from "@/lib/audit";
import { scanIdentitiesOnline } from "@/lib/searcher";

export const runtime = "nodejs";
export const maxDuration = 60;

const MIN_SCAN_INTERVAL_MS = 5 * 60_000; // 5 minutes between scans

export async function POST() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  // Rate-limit: check when the user last ran a scan via audit log
  const { data: lastScan } = await auth.supabase
    .from("audit_logs")
    .select("created_at")
    .eq("user_id", auth.user.id)
    .eq("action", "monitor.identity_scan")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastScan?.created_at) {
    const elapsed = Date.now() - new Date(lastScan.created_at).getTime();
    if (elapsed < MIN_SCAN_INTERVAL_MS) {
      const retryAfter = Math.ceil((MIN_SCAN_INTERVAL_MS - elapsed) / 1000);
      const res = jsonError(`Scan ran recently. Wait ${retryAfter}s before scanning again.`, 429);
      res.headers.set("Retry-After", String(retryAfter));
      return res;
    }
  }

  // Load all user identities
  const { data: identities, error: identityError } = await auth.supabase
    .from("identities")
    .select("id,kind,identifier,label")
    .eq("user_id", auth.user.id)
    .in("kind", ["email", "phone", "username", "social_profile"])
    .order("created_at", { ascending: false })
    .limit(20);

  if (identityError) return internalError(identityError);
  if (!identities?.length) {
    return jsonError("Add an email, phone number, username, or social profile identity before scanning.", 409);
  }

  // Search the internet for each identity
  let scan;
  try {
    scan = await scanIdentitiesOnline(identities);
  } catch (error) {
    return internalError(error);
  }

  // Load existing open finding URLs to avoid duplicates
  const { data: existingFindings } = await auth.supabase
    .from("findings")
    .select("evidence_url")
    .eq("user_id", auth.user.id)
    .eq("is_demo", false)
    .eq("status", "open")
    .limit(500);

  const existingUrls = new Set(
    (existingFindings ?? []).map((f) => f.evidence_url).filter(Boolean)
  );

  const newFindings = scan.findings.filter((f) => !existingUrls.has(f.evidenceUrl));

  let savedFindings: { id: string }[] = [];
  if (newFindings.length > 0) {
    const rows = newFindings.map((f) => ({
      user_id: auth.user.id,
      title: `Exposure found: ${f.identityLabel}`,
      description: f.snippet || "Your identity was found on a public page. Review the link and decide if a removal request is needed.",
      severity: f.identityKind === "email" || f.identityKind === "phone" ? "high" as const : "medium" as const,
      status: "open" as const,
      is_demo: false,
      provider_name: (() => { try { return new URL(f.evidenceUrl).hostname; } catch { return "Unknown"; } })(),
      evidence_url: f.evidenceUrl,
      evidence_summary: `Your ${f.identityKind} (${f.identityLabel}) was found on this page.`,
    }));

    const { data, error } = await auth.supabase
      .from("findings")
      .insert(rows)
      .select("id");

    if (error) return internalError(error);
    savedFindings = data ?? [];
  }

  try {
    await writeAudit(auth.supabase, auth.user.id, "monitor.identity_scan", "finding", undefined, {
      identitiesScanned: scan.identitiesScanned,
      resultsFound: scan.findings.length,
      newFindings: savedFindings.length,
      errors: scan.errors,
    });
  } catch (auditError) {
    console.error("Audit write failed after identity scan:", auditError);
  }

  return NextResponse.json({
    data: {
      identitiesScanned: scan.identitiesScanned,
      resultsFound: scan.findings.length,
      newFindings: savedFindings.length,
      warning: scan.errors.length ? scan.errors.join(" ") : undefined,
    },
  });
}

