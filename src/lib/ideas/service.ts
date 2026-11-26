import "server-only";
import { APP_NAME } from "@/lib/config";
import { escapeHtml, sendEmail } from "@/lib/notify/email";
import { sendSms } from "@/lib/notify/sms";
import { safeUrl, sanitizeDeep } from "@/lib/security/sanitize";
import { createAdminClient } from "@/lib/supabase/admin";
import { contentHash } from "./hash";
import { type IdeaContent, ideaContentSchema } from "./schema";

/** Sanitise first, then validate, then canonicalise links. */
export function prepareContent(raw: unknown): { ok: true; content: IdeaContent; hash: string } | { ok: false; issues: string[] } {
  const parsed = ideaContentSchema.safeParse(sanitizeDeep(raw));
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map((i) => `${i.path.join(".")}:${i.message}`).slice(0, 20) };
  const content: IdeaContent = {
    ...parsed.data,
    competitors: parsed.data.noCompetitorsKnown ? [] : parsed.data.competitors.map((c) => ({ ...c, link: safeUrl(c.link) })),
  };
  return { ok: true, content, hash: contentHash(content) };
}

/** Attach the user's verified, unattached uploads to an idea. Returns false if any id is not theirs. */
export async function linkFiles(userId: string, ideaId: string, fileIds: string[]): Promise<boolean> {
  if (fileIds.length === 0) return true;
  const db = createAdminClient();
  const { data } = await db
    .from("idea_files")
    .select("id, founder_id, idea_id, scan_status")
    .in("id", fileIds);
  const ok =
    data?.length === fileIds.length &&
    data.every((f) => f.founder_id === userId && (f.idea_id === null || f.idea_id === ideaId) && f.scan_status !== "infected" && f.scan_status !== "pending");
  if (!ok) return false;
  const { error } = await db.from("idea_files").update({ idea_id: ideaId }).in("id", fileIds).eq("founder_id", userId);
  return !error;
}

const LABELS: Record<string, string> = {
  title: "Idea title", description: "What is the idea?", kind: "Type", sector: "Sector", stage: "Stage",
  problem: "Problem", targetMarket: "Target market", evidence: "Evidence", competitors: "Competitors",
  noCompetitorsKnown: "No known competitors", differentiation: "Differentiation", whyBetter: "Why better",
  disruption: "Disruption", revenueModels: "Revenue models", revenueExplanation: "How money is made",
  startCost: "Cost to start", fundingNeeded: "Funding needed", fundingUse: "Use of funds",
  requirements: "Requirements", hardestPart: "Hardest part", positioning: "Positioning",
  first100: "First 100 customers", timeline: "Timeline", timelineReasoning: "Timeline reasoning",
  founderStrength: "Founder strength",
};

function contentToText(c: IdeaContent): string {
  return Object.entries(c)
    .map(([k, v]) => {
      const val = Array.isArray(v)
        ? v.map((x) => (typeof x === "object" ? Object.values(x).filter(Boolean).join(" — ") : String(x))).join("; ")
        : String(v);
      return `${LABELS[k] ?? k}: ${val}`;
    })
    .join("\n\n");
}

/** Founder's proof-of-authorship receipt. Email carries the full copy; SMS only the ID. */
export async function sendReceipts(args: {
  to: { email: string; phone: string };
  publicCode: string;
  submittedAt: string;
  hash: string;
  version: number;
  content: IdeaContent;
}) {
  const { to, publicCode, submittedAt, hash, version, content } = args;
  const header = `Idea ID: ${publicCode}\nVersion: ${version}\nSubmitted (UTC): ${submittedAt}\nSHA-256 fingerprint: ${hash}`;
  const text = `${APP_NAME} — submission receipt\n\n${header}\n\nKeep this email as your record of what you submitted and when.\n\n---\n\n${contentToText(content)}`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:640px"><h2>${escapeHtml(APP_NAME)} — submission receipt</h2><pre style="background:#f6f8fb;padding:12px;border-radius:8px;white-space:pre-wrap">${escapeHtml(header)}</pre><p>Keep this email as your record of what you submitted and when.</p><hr/><pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(contentToText(content))}</pre></div>`;
  await Promise.all([
    sendEmail(to.email, `Your idea ${publicCode} was received`, html, text),
    sendSms(to.phone, `${APP_NAME}: idea received. ID ${publicCode}, ${submittedAt} UTC. Full copy sent to your email.`),
  ]);
}
