import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { jsonError, internalError, readJson } from "@/lib/http";
import { writeAudit } from "@/lib/audit";
import { createSourceSchema } from "@/lib/validators";
export async function GET() {
  const auth = await requireUser(); if ("response" in auth) return auth.response;
  const { data, error } = await auth.supabase.from("sources").select("id,name,reference,status,authorization_note,last_checked_at,created_at,updated_at").eq("user_id", auth.user.id).order("created_at", { ascending: false });
  if (error) return internalError(error); return NextResponse.json({ data: data ?? [] });
}
export async function POST(request: Request) {
  const auth = await requireUser(); if ("response" in auth) return auth.response;
  let parsed; try { parsed = createSourceSchema.safeParse(await readJson(request)); } catch { return jsonError("Request body must be valid JSON."); }
  if (!parsed.success) return jsonError("Invalid source payload.", 422, parsed.error.flatten());
  const { data, error } = await auth.supabase.from("sources").insert({ user_id: auth.user.id, name: parsed.data.name, reference: parsed.data.reference, status: "unverified" }).select("id,name,reference,status,created_at,updated_at").single();
  if (error) return internalError(error);
  try { await writeAudit(auth.supabase, auth.user.id, "source.created", "source", data.id, { status: "unverified" }); } catch (auditError) { console.error("Audit write failed after source create:", auditError); }
  return NextResponse.json({ data }, { status: 201 });
}
