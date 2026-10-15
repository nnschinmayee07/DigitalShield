import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const { supabase, applyToResponse } = await createSupabaseRouteHandlerClient();
    const { error } = await supabase.auth.signOut();
    if (error) return NextResponse.json({ error: { message: "Could not end session." } }, { status: 500 });
    return applyToResponse(NextResponse.json({ ok: true }));
  } catch {
    return NextResponse.json({ error: { message: "Authentication service is not configured." } }, { status: 503 });
  }
}
