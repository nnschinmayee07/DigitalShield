import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { jsonError, readJson } from "@/lib/http";
import { passwordAuthSchema } from "@/lib/auth-schemas";

function getCallbackUrl(request: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const origin = new URL(appUrl);
  if (!["http:", "https:"].includes(origin.protocol)) throw new Error("Unsupported application URL protocol.");
  if (process.env.NODE_ENV === "production" && origin.protocol !== "https:") {
    throw new Error("Production application URL must use HTTPS.");
  }
  return new URL("/auth/callback", origin).toString();
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await readJson(request);
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const parsed = passwordAuthSchema.safeParse(body);
  if (!parsed.success) return jsonError("Check the email and password fields.", 400, parsed.error.flatten());
  const input = parsed.data;

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    console.error("Could not initialize Supabase password authentication.", error instanceof Error ? error.name : "unknown");
    return jsonError("Authentication is not configured.", 503);
  }

  if (input.action === "sign-in") {
    const { error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (error) {
      if (error.code === "email_not_confirmed") {
        return NextResponse.json({
          error: {
            code: "email_not_confirmed",
            message: "If you recently registered, confirm your email using the message from DigitalShield, then sign in again.",
          },
        }, { status: 401 });
      }
      return jsonError("Email or password is incorrect.", 401);
    }
    return NextResponse.json({ ok: true, authenticated: true });
  }

  if (input.action === "sign-up") {
    let emailRedirectTo: string;
    try {
      emailRedirectTo = getCallbackUrl(request);
    } catch {
      return jsonError("The application URL is invalid. Check NEXT_PUBLIC_APP_URL.", 503);
    }
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: { emailRedirectTo },
    });
    if (error) {
      console.error("Supabase account registration failed.", {
        code: error.code ?? "unknown",
        status: error.status ?? "unknown",
      });
      return jsonError("Could not create the account. Check the details and try again.", 400);
    }
    return NextResponse.json({
      ok: true,
      authenticated: Boolean(data.session),
      confirmationRequired: !data.session,
    }, { status: 201 });
  }

  if (input.action === "reset-password") {
    let redirectTo: string;
    try {
      redirectTo = getCallbackUrl(request);
    } catch {
      return jsonError("The application URL is invalid. Check NEXT_PUBLIC_APP_URL.", 503);
    }
    const { error } = await supabase.auth.resetPasswordForEmail(input.email, { redirectTo });
    if (error) {
      console.error("Supabase password reset request failed.", {
        code: error.code ?? "unknown",
        status: error.status ?? "unknown",
      });
      return jsonError("Password reset could not be started. Try again shortly.", 503);
    }
    return NextResponse.json({
      ok: true,
      message: "If an account exists for that address, password reset instructions will arrive shortly.",
    });
  }

  const { error } = await supabase.auth.updateUser({ password: input.password });
  if (error) {
    console.error("Supabase password update failed.", {
      code: error.code ?? "unknown",
      status: error.status ?? "unknown",
    });
    return jsonError("The password could not be updated. Request a new reset email and try again.", 400);
  }
  return NextResponse.json({ ok: true, message: "Your password has been updated." });
}
