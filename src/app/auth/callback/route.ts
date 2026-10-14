import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const appUrl = new URL(process.env.NEXT_PUBLIC_APP_URL || requestUrl.origin);
  const code = requestUrl.searchParams.get("code");
  const providerError = requestUrl.searchParams.get("error");

  if (providerError) {
    console.warn("Supabase auth callback returned an error:", providerError);
    const loginUrl = new URL("/login", appUrl);
    loginUrl.searchParams.set("error", "provider_error");
    return NextResponse.redirect(loginUrl);
  }

  if (!code) {
    console.warn("Supabase auth callback did not include a PKCE code.", {
      parameterNames: [...requestUrl.searchParams.keys()],
    });
    const loginUrl = new URL("/login", appUrl);
    loginUrl.searchParams.set("error", "missing_code");
    return NextResponse.redirect(loginUrl);
  }

  try {
    const { supabase, applyToResponse } = await createSupabaseRouteHandlerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("Supabase code exchange failed:", error.message);
      const loginUrl = new URL("/login", appUrl);
      loginUrl.searchParams.set("error", "code_exchange_failed");
      return NextResponse.redirect(loginUrl);
    }
    const dest = requestUrl.searchParams.get("type") === "recovery"
      ? new URL("/reset-password", appUrl)
      : new URL("/", appUrl);
    return applyToResponse(NextResponse.redirect(dest));
  } catch (error) {
    console.error("Auth callback configuration/runtime failure:", error instanceof Error ? error.message : "unknown");
    const loginUrl = new URL("/login", appUrl);
    loginUrl.searchParams.set("error", "callback_failed");
    return NextResponse.redirect(loginUrl);
  }
}
