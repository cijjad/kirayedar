"use server";
import { after } from "next/server";
import { refresh } from "next/cache";
import { z } from "zod";
import { analyzeIdea } from "@/lib/ai/analyze";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { APP_NAME } from "@/lib/config";
import { escapeHtml, sendEmail } from "@/lib/notify/email";
import { clientIp, hashIp } from "@/lib/security/request";
import { sanitizeText } from "@/lib/security/sanitize";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  ideaId: z.string().uuid(),
  action: z.enum(["start_review", "approve", "reject", "request_changes", "override_score", "retry_analysis"]),
  internalNote: z.string().max(2000).default(""),
  founderNote: z.string().max(2000).default(""),
  score: z.coerce.number().min(0).max(10).optional(),
});

const NEXT_STATUS = {
  start_review: "under_review",
  approve: "approved",
  reject: "rejected",
  request_changes: "changes_requested",
} as const;

export type ActionState = { ok: boolean; error?: string } | null;

export async function reviewIdea(_prev: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin(); // re-checked on every call: server actions are public endpoints
  const parsed = schema.safeParse({
    ideaId: form.get("ideaId"),
    action: form.get("action"),
    internalNote: form.get("internalNote") ?? "",
    founderNote: form.get("founderNote") ?? "",
    score: form.get("score") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { ideaId, action, score } = parsed.data;
  const internalNote = sanitizeText(parsed.data.internalNote);
  const founderNote = sanitizeText(parsed.data.founderNote);
  if ((action === "request_changes" || action === "reject") && founderNote.length < 10) return { ok: false, error: "founder_note_required" };
  if (action === "override_score" && (score === undefined || internalNote.length < 5)) return { ok: false, error: "score_and_note_required" };

  const db = createAdminClient();
  const { data: idea } = await db.from("ideas").select("id, public_code, founder_id, status").eq("id", ideaId).single();
  if (!idea) return { ok: false, error: "not_found" };

  if (action === "retry_analysis") {
    after(() => analyzeIdea(ideaId, { force: true }).then(() => undefined));
  } else if (action === "override_score") {
    await db.from("ideas").update({ admin_score: score, admin_note: internalNote }).eq("id", ideaId);
  } else {
    const update: Record<string, unknown> = { status: NEXT_STATUS[action] };
    if (internalNote) update.admin_note = internalNote;
    if (action === "reject" || action === "request_changes") update.founder_feedback = founderNote;
    if (action === "approve") update.founder_feedback = founderNote || null;
    await db.from("ideas").update(update).eq("id", ideaId);
  }

  await db.from("admin_reviews").insert({ idea_id: ideaId, admin_id: admin.id, action, note: internalNote || founderNote || null, score_override: action === "override_score" ? score : null });
  await audit({ actorId: admin.id, action: `admin_${action}`, entity: "idea", entityId: ideaId, ipHash: hashIp(await clientIp()) });

  if (action === "approve" || action === "reject" || action === "request_changes") {
    const { data: p } = await db.from("profiles").select("email").eq("id", idea.founder_id).single();
    if (p?.email) {
      const msg = { approve: "has been approved", reject: "was not accepted", request_changes: "needs some changes" }[action];
      const text = `Your idea ${idea.public_code} ${msg}. Log in to your dashboard to see details.`;
      after(() => sendEmail(p.email!, `${APP_NAME}: update on ${idea.public_code}`, `<p>${escapeHtml(text)}</p>`, text).then(() => undefined));
    }
  }
  refresh();
  return { ok: true };
}

/** Reveals founder contact details to an admin and records that it happened. */
export async function revealContact(ideaId: string) {
  const admin = await requireAdmin();
  if (!z.string().uuid().safeParse(ideaId).success) return null;
  const db = createAdminClient();
  const { data: idea } = await db.from("ideas").select("founder_id").eq("id", ideaId).single();
  if (!idea) return null;
  const { data: p } = await db.from("profiles").select("full_name, phone, email, city").eq("id", idea.founder_id).single();
  await audit({ actorId: admin.id, action: "contact_view", entity: "idea", entityId: ideaId, ipHash: hashIp(await clientIp()) });
  return p;
}
