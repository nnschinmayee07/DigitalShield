import { NextResponse } from "next/server";
import { z } from "zod";
import { crawlAuthorizedSource, CrawlerError } from "@/lib/crawler";
import { requireUser } from "@/lib/auth";
import { internalError, jsonError, readJson } from "@/lib/http";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 30;

const scanRequestSchema = z.object({ sourceId: z.string().uuid() }).strict();
const MIN_SCAN_INTERVAL_MS = 60_000;
const MAX_IDENTITIES_PER_SCAN = 100;

function crawlerErrorMessage(error: unknown): string {
  if (!(error instanceof CrawlerError)) {
    return "The source could not be reached safely. No page content was scanned.";
  }

  switch (error.code) {
    case "invalid_url":
      return "The registered source must be a valid HTTP or HTTPS URL on port 80 or 443.";
    case "unsafe_host":
      return "The source or a redirect did not resolve to a public address within its registered site.";
    case "robots_unavailable":
      return "The site's robots.txt could not be read safely, so the scan was stopped.";
    case "robots_blocked":
      return "The site's crawling policy blocked this scan.";
    case "response_too_large":
      return "A page exceeded the crawler's size limit and was skipped.";
    case "unsupported_content":
      return "The source returned an unsupported content encoding.";
    case "network_error":
      return "The site could not be reached within the crawler's safety limits.";
  }
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await readJson(request);
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  const parsed = scanRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("Select an authorized source to scan.", 422, parsed.error.flatten());
  }

  const { data: source, error: sourceError } = await auth.supabase
    .from("sources")
    .select("id,name,reference,status,last_checked_at")
    .eq("id", parsed.data.sourceId)
    .eq("user_id", auth.user.id)
    .eq("status", "authorized")
    .maybeSingle();

  if (sourceError) return internalError(sourceError);
  if (!source) return jsonError("Authorized source not found.", 404);

  const scanStartedAt = new Date();
  const retryAfterMs = source.last_checked_at
    ? MIN_SCAN_INTERVAL_MS -
      (scanStartedAt.getTime() - new Date(source.last_checked_at).getTime())
    : 0;
  if (retryAfterMs > 0) {
    const response = jsonError("This source was scanned recently. Please wait before scanning it again.", 429);
    response.headers.set("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
    return response;
  }

  const { data: identities, error: identityError } = await auth.supabase
    .from("identities")
    .select("kind,identifier,created_at")
    .eq("user_id", auth.user.id)
    .in("kind", ["email", "phone", "username", "social_profile"])
    .order("created_at", { ascending: false })
    .limit(MAX_IDENTITIES_PER_SCAN + 1);

  if (identityError) return internalError(identityError);
  if (!identities?.length) {
    return jsonError(
      "Add an email, phone number, username, or social profile before scanning.",
      409,
    );
  }
  const identitiesTruncated = identities.length > MAX_IDENTITIES_PER_SCAN;
  const scanIdentities = identities
    .slice(0, MAX_IDENTITIES_PER_SCAN)
    .map(({ kind, identifier }) => ({ kind, identifier }));

  const checkedAt = scanStartedAt.toISOString();
  const cutoff = new Date(scanStartedAt.getTime() - MIN_SCAN_INTERVAL_MS).toISOString();
  const { data: claimedSource, error: claimError } = await auth.supabase
    .from("sources")
    .update({ last_checked_at: checkedAt })
    .eq("id", source.id)
    .eq("user_id", auth.user.id)
    .eq("status", "authorized")
    .or(`last_checked_at.is.null,last_checked_at.lt.${cutoff}`)
    .select("id")
    .maybeSingle();

  if (claimError) return internalError(claimError);
  if (!claimedSource) {
    const response = jsonError("This source was scanned recently or is no longer authorized.", 429);
    response.headers.set("Retry-After", "60");
    return response;
  }

  let scan;
  try {
    scan = await crawlAuthorizedSource(source.reference, scanIdentities);
  } catch (error) {
    if (!(error instanceof CrawlerError)) return internalError(error);
    if (error.code === "unsafe_host" || error.code === "invalid_url") {
      return jsonError(crawlerErrorMessage(error), 422);
    }
    return jsonError(crawlerErrorMessage(error), 502);
  }

  const { data: existingFindings, error: existingError } = await auth.supabase
    .from("findings")
    .select("evidence_url")
    .eq("user_id", auth.user.id)
    .eq("source_id", source.id)
    .eq("is_demo", false)
    .eq("status", "open")
    .limit(500);

  if (existingError) return internalError(existingError);

  const existingUrls = new Set(
    (existingFindings ?? [])
      .map((finding) => finding.evidence_url)
      .filter((url): url is string => typeof url === "string"),
  );
  const newMatches = scan.matches.filter(
    (match) => !existingUrls.has(match.evidenceUrl),
  );

  let findings: Array<{ id: string; title: string; evidence_url: string }> = [];
  if (newMatches.length > 0) {
    const rows = newMatches.map((match) => ({
      user_id: auth.user.id,
      source_id: source.id,
      title: "Potential exposure found",
      description:
        "A saved identifier matched this public page. Review the page manually; the matched value is not stored in this finding.",
      severity: "medium" as const,
      status: "open" as const,
      is_demo: false,
      provider_name: source.name,
      evidence_url: match.evidenceUrl,
      evidence_summary: `A saved ${match.identityKinds.join(", ")} identifier matched public page text.`,
    }));
    const { data, error } = await auth.supabase
      .from("findings")
      .insert(rows)
      .select("id,title,evidence_url");

    if (error) return internalError(error);
    findings = data ?? [];
  }

  try {
    await writeAudit(
      auth.supabase,
      auth.user.id,
      "monitor.authorized_scan",
      "source",
      source.id,
      {
        pagesVisited: scan.pagesVisited,
        matchesFound: scan.matches.length,
        newFindings: findings.length,
        blockedByRobots: scan.blockedByRobots,
      },
    );
  } catch (auditError) {
    console.error("Audit write failed after scan:", auditError);
  }

  const warnings = [];
  if (scan.blockedByRobots) {
    warnings.push("The site's robots.txt blocked some or all of this scan.");
  }
  if (scan.limitReached) {
    warnings.push("The scan reached its page or time limit; results cover only pages checked.");
  }
  if (identitiesTruncated) {
    warnings.push(`Only the ${MAX_IDENTITIES_PER_SCAN} most recently added identifiers were checked.`);
  }
  if (findings.length > 0) {
    warnings.push("Possible matches need manual review; content is not independently verified.");
  } else if (scan.matches.length > 0) {
    warnings.push("Possible matches already have open findings; review those records.");
  } else if (scan.pagesVisited > 0) {
    warnings.push("No saved identifiers were found in the pages checked.");
  } else if (!scan.blockedByRobots) {
    warnings.push("No eligible public HTML pages were available to check.");
  }

  return NextResponse.json(
    {
      data: {
        source: { id: source.id, name: source.name },
        pagesVisited: scan.pagesVisited,
        matchesFound: scan.matches.length,
        identitiesChecked: scanIdentities.length,
        identitiesTruncated,
        newFindings: findings,
        blockedByRobots: scan.blockedByRobots,
        limitReached: scan.limitReached,
        warning: warnings.join(" "),
      },
    },
    { status: 200 },
  );
}
