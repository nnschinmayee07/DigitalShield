import { createSupabaseServerClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/http";
import type { User } from "@supabase/supabase-js";
import type { NextResponse } from "next/server";

export async function requireUser(): Promise<{ user: User; supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> } | { response: NextResponse }> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return { response: jsonError("Authentication required.", 401) };
    return { user, supabase };
  } catch {
    return { response: jsonError("Authentication service is not configured.", 503) };
  }
}
