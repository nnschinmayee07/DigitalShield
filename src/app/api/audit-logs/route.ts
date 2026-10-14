import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { internalError } from "@/lib/http";
export async function GET() {
 const auth = await requireUser(); if ("response" in auth) return auth.response;
 const { data, error } = await auth.supabase.from("audit_logs").select("id,action,entity_type,entity_id,metadata,created_at").eq("user_id", auth.user.id).order("created_at", { ascending: false }).limit(100);
 if (error) return internalError(error); return NextResponse.json({ data: data ?? [] });
}
