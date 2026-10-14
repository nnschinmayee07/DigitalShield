import { createServerClient } from "@supabase/ssr";
import type { CookieMethodsServer } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type CookieEntry = { name: string; value: string; options?: Record<string, unknown> };

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  const cookieMethods: CookieMethodsServer = {
    getAll() { return cookieStore.getAll(); },
    setAll(cookiesToSet) {
      try {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        );
      } catch {
        // Server Components cannot write cookies; middleware handles session refresh.
      }
    },
  };
  return createServerClient(url, key, { cookies: cookieMethods });
}

export async function createSupabaseRouteHandlerClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");

  const pending: CookieEntry[] = [];

  const cookieMethods: CookieMethodsServer = {
    getAll() { return cookieStore.getAll(); },
    setAll(cookiesToSet) {
      cookiesToSet.forEach((c) => pending.push(c));
      try {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        );
      } catch { /* ignore in Server Component context */ }
    },
  };

  const supabase = createServerClient(url, key, { cookies: cookieMethods });

  function applyToResponse(response: NextResponse): NextResponse {
    pending.forEach(({ name, value, options }) =>
      response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
    );
    return response;
  }

  return { supabase, applyToResponse };
}
