import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { jsonError, internalError, readJson } from "@/lib/http";
import { writeAudit } from "@/lib/audit";
import { encryptField, decryptField } from "@/lib/crypto";
import { updateIdentitySchema } from "@/lib/validators";
type Context = { params: Promise<{ id: string }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function GET(_request: Request, context: Context) {
  const auth = await requireUser(); if ("response" in auth) return auth.response;
  const { id } = await context.params; if (!uuid.test(id)) return jsonError("Invalid identity id.", 400);
  const { data, error } = await auth.supabase.from("identities").select("id,label,kind,identifier,private_notes_ciphertext,private_notes_iv,private_notes_tag,created_at,updated_at").eq("id", id).maybeSingle();
  if (error) return internalError(error); if (!data) return jsonError("Identity not found.", 404);
  try { const privateNotes = data.private_notes_ciphertext ? decryptField({ ciphertext: data.private_notes_ciphertext, iv: data.private_notes_iv, tag: data.private_notes_tag }) : null;
    return NextResponse.json({ data: { id: data.id, label: data.label, kind: data.kind, identifier: data.identifier, created_at: data.created_at, updated_at: data.updated_at, privateNotes } });
  } catch (e) { return internalError(e); }
}
export async function PATCH(request: Request, context: Context) {
  const auth = await requireUser(); if ("response" in auth) return auth.response;
  const { id } = await context.params; if (!uuid.test(id)) return jsonError("Invalid identity id.", 400);
  let parsed; try { parsed = updateIdentitySchema.safeParse(await readJson(request)); } catch { return jsonError("Request body must be valid JSON."); }
  if (!parsed.success) return jsonError("Invalid identity payload.", 422, parsed.error.flatten());
  try {
    const input = parsed.data; const update: Record<string, unknown> = {};
    if (input.label !== undefined) update.label = input.label;
    if (input.kind !== undefined) update.kind = input.kind;
    if (input.identifier !== undefined) update.identifier = input.identifier;
    if (input.privateNotes !== undefined) { const enc = input.privateNotes ? encryptField(input.privateNotes) : null; update.private_notes_ciphertext = enc?.ciphertext ?? null; update.private_notes_iv = enc?.iv ?? null; update.private_notes_tag = enc?.tag ?? null; }
    const { data, error } = await auth.supabase.from("identities").update(update).eq("id", id).select("id,label,kind,identifier,created_at,updated_at").maybeSingle();
    if (error) return internalError(error); if (!data) return jsonError("Identity not found.", 404);
    await writeAudit(auth.supabase, auth.user.id, "identity.updated", "identity", id, { fields: Object.keys(input) });
    return NextResponse.json({ data });
  } catch (e) { return internalError(e); }
}
export async function DELETE(_request: Request, context: Context) {
  const auth = await requireUser(); if ("response" in auth) return auth.response;
  const { id } = await context.params; if (!uuid.test(id)) return jsonError("Invalid identity id.", 400);
  const { data, error } = await auth.supabase.from("identities").delete().eq("id", id).select("id").maybeSingle();
  if (error) return internalError(error); if (!data) return jsonError("Identity not found.", 404);
  try { await writeAudit(auth.supabase, auth.user.id, "identity.deleted", "identity", id); } catch (e) { return internalError(e); }
  return NextResponse.json({ ok: true, id });
}
