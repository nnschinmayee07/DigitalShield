import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { jsonError, internalError } from "@/lib/http";
import { writeAudit } from "@/lib/audit";
// Deliberately demo-only: no crawling, breach lookups, or third-party access.
export async function POST() {
 const auth = await requireUser(); if ("response" in auth) return auth.response;
 const { data: sources, error: sourceError } = await auth.supabase.from("sources").select("id,name,status").eq("status", "authorized");
 if (sourceError) return internalError(sourceError);
 if (!sources?.length) return jsonError("No authorized sources are available to check.", 409);
 const demoRows = sources.map((source) => ({ user_id: auth.user.id, source_id: source.id, title: `Demo review: ${source.name}`, description: "Synthetic demonstration finding. No external service was queried; replace this adapter with an authorized integration.", severity: "low" as const, status: "open" as const, is_demo: true }));
 const { data: findings, error } = await auth.supabase.from("findings").insert(demoRows).select("id,source_id,title,severity,status,is_demo,detected_at");
 if (error) return internalError(error);
 const now = new Date().toISOString();
 const { error: updateError } = await auth.supabase.from("sources").update({ last_checked_at: now }).in("id", sources.map((s) => s.id)).eq("status", "authorized");
 if (updateError) return internalError(updateError);
 try { await writeAudit(auth.supabase, auth.user.id, "monitor.demo_run", "source", undefined, { authorizedSourceCount: sources.length, createdFindingCount: findings?.length ?? 0, demoOnly: true }); } catch (e) { return internalError(e); }
 return NextResponse.json({ data: { mode: "demo", checkedSources: sources.length, createdFindings: findings ?? [], warning: "Synthetic results only. No real exposure checks were performed." } }, { status: 201 });
}
