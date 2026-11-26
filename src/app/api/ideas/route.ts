import { after } from "next/server";
import { analyzeIdea } from "@/lib/ai/analyze";
import { fail, json, readJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth";
import { LIMITS } from "@/lib/config";
import { newPublicCode } from "@/lib/ideas/hash";
import { contactSchema, normalizePkPhone } from "@/lib/ideas/schema";
import { linkFiles, prepareContent, sendReceipts } from "@/lib/ideas/service";
import { verifyCaptcha } from "@/lib/security/captcha";
import { rateLimit } from "@/lib/security/ratelimit";
import { clientIp, hashIp } from "@/lib/security/request";
import { sanitizeDeep } from "@/lib/security/sanitize";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const envelope = z.object({
  content: z.unknown(),
  contact: z.unknown(),
  fileIds: z.array(z.string().uuid()).max(5).default([]),
  captchaToken: z.string().max(4096).optional(),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return fail("unauthorized", 401);
  const ip = await clientIp();
  const ipHash = hashIp(ip);

  const [userOk, ipOk] = await Promise.all([
    rateLimit(`submit:u:${user.id}`, LIMITS.submitPerHourPerUser, 3600),
    rateLimit(`submit:ip:${ipHash}`, LIMITS.submitPerHourPerIp, 3600),
  ]);
  if (!userOk || !ipOk) return fail("rate_limited", 429);

  const env = envelope.safeParse(await readJson(req));
  if (!env.success) return fail("bad_request", 400);
  if (!(await verifyCaptcha(env.data.captchaToken, ip))) return fail("captcha", 400);

  const prepared = prepareContent(env.data.content);
  const contact = contactSchema.safeParse(sanitizeDeep(env.data.contact));
  if (!prepared.ok || !contact.success) {
    return json({ error: "validation", issues: prepared.ok ? [] : prepared.issues }, 400);
  }
  const phone = normalizePkPhone(contact.data.phone)!;
  const city = contact.data.city === "other" ? contact.data.cityOther || "other" : contact.data.city;

  const db = createAdminClient();
  await db
    .from("profiles")
    .update({ full_name: contact.data.name, city, phone, email: contact.data.email.toLowerCase() })
    .eq("id", user.id);

  const now = new Date().toISOString();
  let idea: { id: string; public_code: string; submitted_at: string } | null = null;
  for (let attempt = 0; attempt < 3 && !idea; attempt++) {
    const { data, error } = await db
      .from("ideas")
      .insert({
        public_code: newPublicCode(),
        founder_id: user.id,
        status: "submitted",
        title: prepared.content.title,
        kind: prepared.content.kind,
        sector: prepared.content.sector,
        stage: prepared.content.stage,
        city,
        content: prepared.content,
        content_hash: prepared.hash,
        version: 1,
        consent_terms_at: now,
        consent_blind_at: now,
      })
      .select("id, public_code, submitted_at")
      .single();
    if (data) idea = data;
    else if (error?.code !== "23505") return fail("server_error", 500); // 23505 = code collision, retry
  }
  if (!idea) return fail("server_error", 500);

  await db.from("idea_versions").insert({ idea_id: idea.id, version: 1, content: prepared.content, content_hash: prepared.hash });
  if (!(await linkFiles(user.id, idea.id, env.data.fileIds))) {
    await db.from("ideas").delete().eq("id", idea.id);
    return fail("bad_files", 400);
  }
  await audit({ actorId: user.id, action: "idea_submitted", entity: "idea", entityId: idea.id, meta: { code: idea.public_code }, ipHash });

  // After the response: receipts + AI analysis (does not block the founder).
  const ideaId = idea.id;
  const receipt = { publicCode: idea.public_code, submittedAt: idea.submitted_at, hash: prepared.hash, version: 1, content: prepared.content };
  after(async () => {
    await sendReceipts({ to: { email: contact.data.email, phone }, ...receipt });
    await analyzeIdea(ideaId);
  });

  return json({ id: idea.id, publicCode: idea.public_code, submittedAt: idea.submitted_at, hash: prepared.hash }, 201);
}

// AI analysis runs in after(); allow up to 5 minutes (needs a plan that permits it).
export const maxDuration = 300;
