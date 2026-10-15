import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  return NextResponse.json({ authenticated: true, user: { id: auth.user.id, email: auth.user.email ?? null } });
}
