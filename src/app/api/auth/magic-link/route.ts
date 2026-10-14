import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/http";

const schema = z.object({ email: z.string().trim().email().max(254) });
const genericSuccess = {
  ok: true,
  message: "If the address can receive sign-in links, an email will arrive shortly.",
};

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return jsonError("Invalid JSON body.", 400); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError("Enter a valid email address.", 400);

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    // Use the SSR client so the PKCE verifier is written to an HTTP-only cookie.
    // The callback needs that verifier to exchange the email link's code for a session.
    supabase = await createSupabaseServerClient();
  } catch {
    return jsonError("Authentication is not configured.", 503);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  let redirectTo: string;
  try { redirectTo = new URL("/auth/callback", appUrl).toString(); }
  catch { return jsonError("The application URL is invalid.", 503); }

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) {
    // Do not expose provider details or account-existence information to clients.
    console.warn("Magic-link request failed at the Supabase provider.");
  }
  return NextResponse.json(genericSuccess);
}
