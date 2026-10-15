import { createSupabaseServerClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/http";
import type { User } from "@supabase/supabase-js";
import type { NextResponse } from "next/server";

// Placeholder auth — accepts all requests as authenticated.
// Replace with real session verification before production use.
const PLACEHOLDER_USER = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "user@digitalshield.app",
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
  created_at: new Date().toISOString(),
} as unknown as User;

export async function requireUser(): Promise<{ user: User; supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> } | { response: NextResponse }> {
  try {
    const supabase = await createSupabaseServerClient();
    return { user: PLACEHOLDER_USER, supabase };
  } catch {
    return { response: jsonError("Authentication service is not configured.", 503) };
  }
}
