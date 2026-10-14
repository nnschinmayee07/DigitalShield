import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { internalError } from "@/lib/http";
export async function GET(request: NextRequest) {
 const auth = await requireUser(); if ("response" in auth) return auth.response;
 let query = auth.supabase.from("findings").select("id,source_id,title,description,severity,status,is_demo,provider_name,evidence_url,evidence_summary,detected_at,resolved_at,created_at").order("detected_at", { ascending: false }).limit(100);
 const status = request.nextUrl.searchParams.get("status");
 if (status === "open" || status === "resolved" || status === "dismissed") query = query.eq("status", status);
 const { data, error } = await query; if (error) return internalError(error);
 return NextResponse.json({ data: data ?? [] });
}
