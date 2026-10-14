import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { internalError, jsonError, readJson } from "@/lib/http";

const schema = z.object({
  sourceId: z.string().uuid().nullable().optional(),
  providerName: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(200),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  evidenceUrl: z.string().url().max(2048),
  evidenceSummary: z.string().trim().min(1).max(4000),
}).refine((v) => ["http:", "https:"].includes(new URL(v.evidenceUrl).protocol), { message: "Evidence URL must use HTTP or HTTPS.", path: ["evidenceUrl"] });

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  let body: unknown;
  try { body = await readJson(request); } catch { return jsonError("Invalid JSON body.", 400); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid exposure report.", 400, parsed.error.flatten());
  const input = parsed.data;
  if (input.sourceId) {
    const { data: source, error } = await auth.supabase.from("sources").select("id,status").eq("id", input.sourceId).maybeSingle();
    if (error) return internalError(error);
    if (!source) return jsonError("Source not found.", 404);
    if (source.status !== "authorized") return jsonError("Only authorized sources can be associated with a reported exposure.", 403);
  }
  // Store a summary and evidence URL only; never submit or store a raw password, session token, or credential dump here.
  const { data, error } = await auth.supabase.from("findings").insert({
    user_id: auth.user.id,
    source_id: input.sourceId ?? null,
    title: input.title,
    description: input.evidenceSummary,
    severity: input.severity,
    status: "open",
    is_demo: false,
    provider_name: input.providerName,
    evidence_url: input.evidenceUrl,
    evidence_summary: input.evidenceSummary,
  }).select("id,source_id,title,description,severity,status,is_demo,provider_name,evidence_url,evidence_summary,detected_at,resolved_at,created_at").single();
  if (error) return internalError(error);
  try {
    await writeAudit(auth.supabase, auth.user.id, "finding.reported", "finding", data.id, { severity: data.severity, providerName: data.provider_name });
  } catch (auditError) {
    console.error("Audit write failed after finding report:", auditError);
  }
  return NextResponse.json({ data, note: "Exposure report recorded. This endpoint does not crawl or access the linked site." }, { status: 201 });
}
