import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const memoryBuckets = new Map<string, { count: number; resetAt: number }>();
let redisLimiters: { regular: Ratelimit; magicLink: Ratelimit } | null | undefined;
function getRedisLimiters() {
  if (redisLimiters !== undefined) return redisLimiters;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) { redisLimiters = null; return redisLimiters; }
  const redis = new Redis({ url, token });
  redisLimiters = {
    regular: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(60, "1 m"), analytics: true, prefix: "digitalshield:api" }),
    magicLink: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, "15 m"), analytics: true, prefix: "digitalshield:magic-link" }),
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
      const limiter = path === "/api/auth/magic-link" ? limiters.magicLink : limiters.regular;
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
  const now = Date.now();
  const entry = memoryBuckets.get(key);
  const max = path === "/api/auth/magic-link" ? 5 : 60;
  const windowMs = path === "/api/auth/magic-link" ? 15 * 60_000 : 60_000;
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
