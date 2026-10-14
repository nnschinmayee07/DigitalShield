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
  } catch (error) {
    console.error(
      "Could not initialize Supabase for magic-link sign-in.",
      error instanceof Error ? error.name : "unknown",
    );
    return jsonError("Authentication is not configured.", 503);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  let redirectTo: string;
  try {
    const origin = new URL(appUrl);
    if (!["http:", "https:"].includes(origin.protocol)) throw new Error("Unsupported application URL protocol.");
    if (process.env.NODE_ENV === "production" && origin.protocol !== "https:") {
      throw new Error("Production application URL must use HTTPS.");
    }
    redirectTo = new URL("/auth/callback", origin).toString();
  } catch {
    return jsonError("The application URL is invalid. Check NEXT_PUBLIC_APP_URL.", 503);
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) {
    // Provider errors are generic to callers to avoid account enumeration.
    console.error("Supabase could not send a magic link.", {
      code: error.code ?? "unknown",
      status: error.status ?? "unknown",
    });
    return jsonError(
      "Sign-in email could not be sent. Check Supabase email delivery settings and try again.",
      503,
    );
  }
  return NextResponse.json(genericSuccess);
}
