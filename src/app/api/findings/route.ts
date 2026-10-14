import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { internalError, jsonError, readJson } from "@/lib/http";
import { writeAudit } from "@/lib/audit";

const createFindingSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).default(""),
  severity: z.enum(["low", "medium", "high", "critical"]).default("low"),
  providerName: z.string().trim().min(1).max(160),
  evidenceUrl: z.string().trim().url().max(2048).refine((value) => {
    try {
      return ["http:", "https:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, "Evidence URL must use HTTP or HTTPS."),
  evidenceSummary: z.string().trim().max(4000).default(""),
}).strict();

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  let query = auth.supabase
    .from("findings")
    .select(
      "id,source_id,title,description,severity,status,is_demo,provider_name,evidence_url,evidence_summary,detected_at,resolved_at,created_at"
    )
    .eq("user_id", auth.user.id)
    .order("detected_at", { ascending: false })
    .limit(100);

  const status = request.nextUrl.searchParams.get("status");

  if (
    status === "open" ||
    status === "resolved" ||
    status === "dismissed"
  ) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) return internalError(error);

  return NextResponse.json({ data: data ?? [] });
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

  const parsed = createFindingSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(
      "Invalid evidence payload.",
      422,
      parsed.error.flatten()
    );
  }

  const input = parsed.data;

  const { data, error } = await auth.supabase
    .from("findings")
    .insert({
      user_id: auth.user.id,
      title: input.title,
      description: input.description,
      severity: input.severity,
      status: "open",
      is_demo: false,
      provider_name: input.providerName,
      evidence_url: input.evidenceUrl,
      evidence_summary: input.evidenceSummary,
    })
    .select(
      "id,source_id,title,description,severity,status,is_demo,provider_name,evidence_url,evidence_summary,detected_at,resolved_at,created_at"
    )
    .single();

  if (error) return internalError(error);

  try {
    await writeAudit(
      auth.supabase,
      auth.user.id,
      "finding.manual_evidence_saved",
      "finding",
      data.id,
      {
        providerName: input.providerName,
        evidenceUrl: input.evidenceUrl,
        isDemo: false,
      }
    );
  } catch (error) {
    return internalError(error);
  }

  return NextResponse.json(
    {
      data,
      note: "Evidence saved for review. The page has not been independently verified.",
    },
    { status: 201 }
  );
}