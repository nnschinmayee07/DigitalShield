import { NextResponse } from "next/server";
import { isEncryptionKeyConfigured } from "@/lib/crypto";
export async function GET() {
  return NextResponse.json({ ok: true, service: "digitalshield-api", version: "0.1.0", configured: { supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY), fieldEncryption: isEncryptionKeyConfigured() }, timestamp: new Date().toISOString() });
}
