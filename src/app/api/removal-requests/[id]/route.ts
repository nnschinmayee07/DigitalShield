import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { internalError, jsonError, readJson } from "@/lib/http";

const schema = z.object({ status: z.enum(["draft", "submitted", "in_progress", "completed", "rejected"]).optional(), externalReference: z.string().max(500).nullable().optional(), notes: z.string().max(4000).optional() }).refine((v) => Object.keys(v).length > 0, { message: "At least one field is required." });
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return jsonError("Invalid request ID.", 400);
  let body: unknown;
  try { body = await readJson(request); } catch { return jsonError("Invalid JSON body.", 400); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid update.", 400, parsed.error.flatten());
  const patch: Record<string, unknown> = {};
  if (parsed.data.status !== undefined) patch.status = parsed.data.status;
  if (parsed.data.externalReference !== undefined) patch.external_reference = parsed.data.externalReference;
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes;
  const { data, error } = await auth.supabase.from("removal_requests").update(patch).eq("id", id).select("id,finding_id,kind,status,target_url,provider_name,notes,external_reference,created_at,updated_at").maybeSingle();
  if (error) return internalError(error);
  if (!data) return jsonError("Removal request not found.", 404);
  await writeAudit(auth.supabase, auth.user.id, "removal_request.updated", "removal_request", data.id, { status: data.status });
  return NextResponse.json({ data });
}
