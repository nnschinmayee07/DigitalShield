import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { internalError, jsonError, readJson } from "@/lib/http";

const createSchema = z.object({
  findingId: z.string().uuid().optional().nullable(),
  kind: z.enum(["site_takedown", "credential_reset", "manual_review"]).default("manual_review"),
  targetUrl: z.string().url().max(2048),
  providerName: z.string().trim().min(1).max(160),
  notes: z.string().max(4000).default(""),
}).refine((value) => ["http:", "https:"].includes(new URL(value.targetUrl).protocol), { message: "Target URL must use HTTP or HTTPS.", path: ["targetUrl"] });

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { data, error } = await auth.supabase.from("removal_requests").select("id,finding_id,kind,status,target_url,provider_name,notes,external_reference,created_at,updated_at").order("created_at", { ascending: false }).limit(100);
  if (error) return internalError(error);
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  let body: unknown;
  try { body = await readJson(request); } catch { return jsonError("Invalid JSON body.", 400); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid removal request.", 400, parsed.error.flatten());
  const input = parsed.data;
  if (input.findingId) {
    const { data: finding, error: findingError } = await auth.supabase.from("findings").select("id").eq("id", input.findingId).maybeSingle();
    if (findingError) return internalError(findingError);
    if (!finding) return jsonError("Finding not found.", 404);
  }
  const { data, error } = await auth.supabase.from("removal_requests").insert({
    user_id: auth.user.id,
    finding_id: input.findingId ?? null,
    kind: input.kind,
    target_url: input.targetUrl,
    provider_name: input.providerName,
    notes: input.notes,
    status: "draft",
  }).select("id,finding_id,kind,status,target_url,provider_name,notes,external_reference,created_at,updated_at").single();
  if (error) return internalError(error);
  await writeAudit(auth.supabase, auth.user.id, "removal_request.created", "removal_request", data.id, { kind: data.kind, status: data.status });
  return NextResponse.json({ data, note: "Request recorded. This does not automatically remove third-party content; submit it through the provider's authorized removal process." }, { status: 201 });
}
