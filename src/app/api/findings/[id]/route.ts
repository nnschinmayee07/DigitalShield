import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { jsonError, internalError, readJson } from "@/lib/http";
import { writeAudit } from "@/lib/audit";
import { updateFindingSchema } from "@/lib/validators";
type Context = { params: Promise<{ id: string }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function PATCH(request: Request, context: Context) {
 const auth = await requireUser(); if ("response" in auth) return auth.response;
 const { id } = await context.params; if (!uuid.test(id)) return jsonError("Invalid finding id.", 400);
 let parsed; try { parsed = updateFindingSchema.safeParse(await readJson(request)); } catch { return jsonError("Request body must be valid JSON."); }
 if (!parsed.success) return jsonError("Invalid finding payload.", 422, parsed.error.flatten());
 const status = parsed.data.status;
 const { data, error } = await auth.supabase.from("findings").update({ status, resolved_at: status === "resolved" ? new Date().toISOString() : null }).eq("id", id).select("id,title,status,resolved_at").maybeSingle();
 if (error) return internalError(error); if (!data) return jsonError("Finding not found.", 404);
 try { await writeAudit(auth.supabase, auth.user.id, `finding.${status}`, "finding", id, { status }); } catch (e) { return internalError(e); }
 return NextResponse.json({ data });
}
