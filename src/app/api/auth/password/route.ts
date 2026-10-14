import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import { jsonError, readJson } from "@/lib/http";
import { z } from "zod";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sign-in"), email: z.string().email().max(254), password: z.string().min(8).max(128) }),
  z.object({ action: z.literal("sign-up"), email: z.string().email().max(254), password: z.string().min(8).max(128) }),
  z.object({ action: z.literal("update-password"), password: z.string().min(8).max(128) }),
]);

export async function POST(request: Request) {
  let body: unknown;
  try { body = await readJson(request); } catch { return jsonError("Invalid JSON body.", 400); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError("Check the email and password fields.", 400);

  let supabase: Awaited<ReturnType<typeof createSupabaseRouteHandlerClient>>["supabase"];
  let applyToResponse: Awaited<ReturnType<typeof createSupabaseRouteHandlerClient>>["applyToResponse"];
  try {
    ({ supabase, applyToResponse } = await createSupabaseRouteHandlerClient());
  } catch {
    return jsonError("Authentication is not configured.", 503);
  }

  if (parsed.data.action === "sign-in") {
    const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
    if (error) return jsonError("Email or password is incorrect.", 401);
    return applyToResponse(NextResponse.json({ ok: true }));
  }

  if (parsed.data.action === "sign-up") {
    const { data, error } = await supabase.auth.signUp({ email: parsed.data.email, password: parsed.data.password });
    if (error) return jsonError("Could not create account. That email may already be registered.", 400);
    if (!data.session) return jsonError("Account created but sign-in failed. Please sign in manually.", 500);
    return applyToResponse(NextResponse.json({ ok: true }, { status: 201 }));
  }

  // update-password — called from /reset-password after email recovery link
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return jsonError("Password could not be updated. Request a new reset link and try again.", 400);
  return applyToResponse(NextResponse.json({ ok: true, message: "Your password has been updated." }));
}
