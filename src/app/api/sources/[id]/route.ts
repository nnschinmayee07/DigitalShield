import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { jsonError, internalError, readJson } from "@/lib/http";
import { writeAudit } from "@/lib/audit";
import { updateSourceSchema } from "@/lib/validators";
type Context = { params: Promise<{ id: string }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function PATCH(request: Request, context: Context) {
 const auth = await requireUser(); if ("response" in auth) return auth.response;
 const { id } = await context.params; if (!uuid.test(id)) return jsonError("Invalid source id.", 400);
 let parsed; try { parsed = updateSourceSchema.safeParse(await readJson(request)); } catch { return jsonError("Request body must be valid JSON."); }
 if (!parsed.success) return jsonError("Invalid source payload.", 422, parsed.error.flatten());
 const input = parsed.data;
 if (input.status === "authorized" && !input.authorizationNote?.trim()) return jsonError("A short authorizationNote is required before marking a source authorized.", 422);
 const { data, error } = await auth.supabase.from("sources").update({ status: input.status, authorization_note: input.status === "authorized" ? input.authorizationNote : null }).eq("id", id).eq("user_id", auth.user.id).select("id,name,reference,status,authorization_note,last_checked_at,updated_at").maybeSingle();
 if (error) return internalError(error); if (!data) return jsonError("Source not found.", 404);
 try { await writeAudit(auth.supabase, auth.user.id, `source.${input.status}`, "source", id, { status: input.status }); } catch (auditError) { console.error("Audit write failed after source update:", auditError); }
 return NextResponse.json({ data });
}
export async function DELETE(_request: Request, context: Context) {
 const auth = await requireUser(); if ("response" in auth) return auth.response;
 const { id } = await context.params; if (!uuid.test(id)) return jsonError("Invalid source id.", 400);
 const { data, error } = await auth.supabase.from("sources").delete().eq("id", id).eq("user_id", auth.user.id).select("id").maybeSingle();
 if (error) return internalError(error); if (!data) return jsonError("Source not found.", 404);
 try { await writeAudit(auth.supabase, auth.user.id, "source.removed", "source", id); } catch (auditError) { console.error("Audit write failed after source delete:", auditError); }
 return NextResponse.json({ ok: true, id, message: "Removed from DigitalShield registry only; external content is unchanged." });
}
