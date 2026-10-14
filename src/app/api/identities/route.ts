import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { jsonError, internalError, readJson } from "@/lib/http";
import { writeAudit } from "@/lib/audit";
import { encryptField } from "@/lib/crypto";
import { createIdentitySchema } from "@/lib/validators";

export async function GET() {
  const auth = await requireUser(); if ("response" in auth) return auth.response;
  const { data, error } = await auth.supabase.from("identities").select("id,label,kind,identifier,created_at,updated_at,private_notes_ciphertext").eq("user_id", auth.user.id).order("created_at", { ascending: false });
  if (error) return internalError(error);
  return NextResponse.json({ data: (data ?? []).map(({ private_notes_ciphertext, ...row }) => ({ ...row, hasPrivateNotes: Boolean(private_notes_ciphertext) })) });
}
export async function POST(request: Request) {
  const auth = await requireUser(); if ("response" in auth) return auth.response;
  let parsed; try { parsed = createIdentitySchema.safeParse(await readJson(request)); } catch { return jsonError("Request body must be valid JSON."); }
  if (!parsed.success) return jsonError("Invalid identity payload.", 422, parsed.error.flatten());
  try {
    const input = parsed.data;
    const encrypted = input.privateNotes ? encryptField(input.privateNotes) : null;
    const { data, error } = await auth.supabase.from("identities").insert({ user_id: auth.user.id, label: input.label, kind: input.kind, identifier: input.identifier, private_notes_ciphertext: encrypted?.ciphertext ?? null, private_notes_iv: encrypted?.iv ?? null, private_notes_tag: encrypted?.tag ?? null }).select("id,label,kind,identifier,created_at,updated_at").single();
    if (error) return internalError(error);
    try { await writeAudit(auth.supabase, auth.user.id, "identity.created", "identity", data.id, { kind: input.kind }); } catch (auditError) { console.error("Audit write failed after identity create:", auditError); }
    return NextResponse.json({ data: { ...data, hasPrivateNotes: Boolean(encrypted) } }, { status: 201 });
  } catch (error) { return internalError(error); }
}
