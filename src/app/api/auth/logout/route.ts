import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
export async function POST() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { error } = await auth.supabase.auth.signOut();
  if (error) return NextResponse.json({ error: { message: "Could not end session." } }, { status: 500 });
  return NextResponse.json({ ok: true });
}
