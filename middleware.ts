import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Rate-limit auth endpoint only
  if (path === "/api/auth/password") {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const key = `rl:${ip}`;
    const now = Date.now();
    const entry = rateBuckets.get(key);
    if (entry && entry.resetAt > now && entry.count >= 10) {
      return NextResponse.json(
        { error: { message: "Too many sign-in attempts. Wait a few minutes and try again." } },
        { status: 429, headers: { "Retry-After": String(Math.ceil((entry.resetAt - now) / 1000)) } },
      );
    }
    if (!entry || entry.resetAt <= now) rateBuckets.set(key, { count: 1, resetAt: now + 15 * 60_000 });
    else entry.count++;
  }

  let response = NextResponse.next({ request });

  // API routes handle their own auth — skip session refresh here
  if (path.startsWith("/api/")) return response;

  // Refresh session cookies for page routes
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
