import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Append-only audit trail. `meta` must never contain submission text, prompts
 * or contact details — only identifiers and small enums.
 */
export async function audit(entry: {
  actorId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: Record<string, string | number | boolean | null>;
  ipHash?: string | null;
}) {
  const { error } = await createAdminClient().from("audit_log").insert({
    actor_id: entry.actorId,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entityId ?? null,
    meta: entry.meta ?? {},
    ip_hash: entry.ipHash ?? null,
  });
  if (error) console.error("audit_insert_failed", error.code);
}
