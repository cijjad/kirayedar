import "server-only";
import type { StoredAnalysis } from "@/lib/ai/schema";
import { createClient } from "@/lib/supabase/server";

/** Loads an idea through RLS: returns null unless the caller may see it. */
export async function loadIdeaForViewer(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data: idea } = await supabase
    .from("ideas")
    .select("id, public_code, founder_id, status, title, sector, stage, city, content, content_hash, version, submitted_at, updated_at, ai_score, ai_verdict, ai_flags, admin_score, founder_feedback")
    .eq("id", id)
    .maybeSingle();
  if (!idea) return null;
  const [{ data: analysis }, { data: files }] = await Promise.all([
    supabase.from("analyses").select("result, created_at").eq("idea_id", id).eq("ok", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("idea_files").select("id, original_name, mime, size_bytes, scan_status").eq("idea_id", id).order("created_at"),
  ]);
  return { idea, analysis: (analysis?.result as StoredAnalysis | undefined) ?? null, files: files ?? [] };
}
