import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const providerError = requestUrl.searchParams.get("error");
  const providerDescription = requestUrl.searchParams.get("error_description");

  // Never log auth codes, access tokens, or complete callback URLs.
  if (providerError) {
    console.warn("Supabase auth callback returned an error:", providerError);
    const loginUrl = new URL("/login", requestUrl.origin);
    loginUrl.searchParams.set("error", "provider_error");
    if (providerDescription) loginUrl.searchParams.set("reason", providerError);
    return NextResponse.redirect(loginUrl);
  }

  if (!code) {
    console.warn("Supabase auth callback did not include a PKCE code.", {
      parameterNames: [...requestUrl.searchParams.keys()],
    });
    const loginUrl = new URL("/login", requestUrl.origin);
    loginUrl.searchParams.set("error", "missing_code");
    return NextResponse.redirect(loginUrl);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("Supabase code exchange failed:", error.message);
      const loginUrl = new URL("/login", requestUrl.origin);
      loginUrl.searchParams.set("error", "code_exchange_failed");
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.redirect(new URL("/", requestUrl.origin));
  } catch (error) {
    console.error("Auth callback configuration/runtime failure:", error instanceof Error ? error.message : "unknown");
    const loginUrl = new URL("/login", requestUrl.origin);
    loginUrl.searchParams.set("error", "callback_failed");
    return NextResponse.redirect(loginUrl);
  }
}
