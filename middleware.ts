import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const memoryBuckets = new Map<string, { count: number; resetAt: number }>();
let redisLimiters: { regular: Ratelimit; passwordAuth: Ratelimit } | null | undefined;
function getRedisLimiters() {
  if (redisLimiters !== undefined) return redisLimiters;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) { redisLimiters = null; return redisLimiters; }
  const redis = new Redis({ url, token });
  redisLimiters = {
    regular: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(60, "1 m"), analytics: true, prefix: "digitalshield:api" }),
    passwordAuth: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, "15 m"), analytics: true, prefix: "digitalshield:password-auth" }),
  };
  return redisLimiters;
}

async function rateLimit(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (!path.startsWith("/api/") || path === "/api/health") return null;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const key = `${ip}:${path}`;
  const limiters = getRedisLimiters();
  if (limiters) {
    try {
      const limiter = path === "/api/auth/password" ? limiters.passwordAuth : limiters.regular;
      const result = await limiter.limit(key);
      if (!result.success) {
        return NextResponse.json({ error: { message: "Too many requests. Please wait and try again." } }, {
          status: 429,
          headers: { "Retry-After": String(Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))) },
        });
      }
      return null;
    } catch (error) {
      console.error("Redis rate-limit check failed.", error instanceof Error ? error.message : "unknown");
      return NextResponse.json({ error: { message: "Rate-limit service is temporarily unavailable. Please retry shortly." } }, { status: 503 });
    }
  }
  // Local-development fallback only. Use Upstash credentials for distributed production rate limiting.
  if (process.env.NODE_ENV === "production") {
    console.error("Production rate limiting is not configured.");
    return NextResponse.json(
      { error: { message: "Rate-limit service is not configured. Please contact the administrator." } },
      { status: 503 },
    );
  }

  const now = Date.now();
  const entry = memoryBuckets.get(key);
  const isPasswordAuth = path === "/api/auth/password";
  const max = isPasswordAuth ? 10 : 60;
  const windowMs = isPasswordAuth ? 15 * 60_000 : 60_000;
  if (!entry || entry.resetAt <= now) memoryBuckets.set(key, { count: 1, resetAt: now + windowMs });
  else if (entry.count >= max) return NextResponse.json({ error: { message: "Too many requests. Please wait and try again." } }, { status: 429, headers: { "Retry-After": String(Math.ceil((entry.resetAt - now) / 1000)) } });
  else entry.count++;
  if (memoryBuckets.size > 5000) for (const [bucketKey, bucket] of memoryBuckets) if (bucket.resetAt <= now) memoryBuckets.delete(bucketKey);
  return null;
}

export async function middleware(request: NextRequest) {
  const limited = await rateLimit(request);
  if (limited) return limited;

  let response = NextResponse.next({ request });
  // API handlers verify the user themselves. Avoid a second auth network call
  // here; their SSR client can refresh and persist cookies when needed.
  if (request.nextUrl.pathname.startsWith("/api/")) return response;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[],
      ) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"] };
