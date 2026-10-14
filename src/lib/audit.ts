import type { SupabaseClient } from "@supabase/supabase-js";
export async function writeAudit(supabase: SupabaseClient, userId: string, action: string, entityType: string, entityId?: string, metadata: Record<string, unknown> = {}) {
  const { error } = await supabase.from("audit_logs").insert({
    user_id: userId, action, entity_type: entityType, entity_id: entityId ?? null, metadata,
  });
  if (error) throw error;
}
