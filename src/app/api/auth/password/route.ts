import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import { jsonError, readJson } from "@/lib/http";
import { z } from "zod";

const schema = z.object({
  action: z.enum(["sign-in", "sign-up"]),
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  let body: unknown;
  try { body = await readJson(request); } catch { return jsonError("Invalid JSON body.", 400); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError("Check the email and password fields.", 400);
  const { action, email, password } = parsed.data;

  let supabase: Awaited<ReturnType<typeof createSupabaseRouteHandlerClient>>["supabase"];
  let applyToResponse: Awaited<ReturnType<typeof createSupabaseRouteHandlerClient>>["applyToResponse"];
  try {
    ({ supabase, applyToResponse } = await createSupabaseRouteHandlerClient());
  } catch {
    return jsonError("Authentication is not configured.", 503);
  }

  if (action === "sign-in") {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return jsonError("Email or password is incorrect.", 401);
    return applyToResponse(NextResponse.json({ ok: true }));
  }

  // sign-up — email confirmation is disabled in Supabase dashboard so session is returned immediately
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return jsonError("Could not create account. That email may already be registered.", 400);
  if (!data.session) return jsonError("Account created but sign-in failed. Please sign in manually.", 500);
  return applyToResponse(NextResponse.json({ ok: true }, { status: 201 }));
}
