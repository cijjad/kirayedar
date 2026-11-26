import { after } from "next/server";
import { z } from "zod";
import { analyzeIdea } from "@/lib/ai/analyze";
import { fail, json, readJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth";
import { LIMITS, UPLOAD } from "@/lib/config";
import { linkFiles, prepareContent, sendReceipts } from "@/lib/ideas/service";
import { isStuckAnalysis } from "@/lib/ideas/status";
import { rateLimit } from "@/lib/security/ratelimit";
import { clientIp, hashIp } from "@/lib/security/request";
import { createAdminClient } from "@/lib/supabase/admin";

const editBody = z.object({ content: z.unknown(), fileIds: z.array(z.string().uuid()).max(UPLOAD.maxFiles).default([]) });

async function ownIdea(id: string, userId: string) {
  if (!z.string().uuid().safeParse(id).success) return null;
  const { data } = await createAdminClient()
    .from("ideas")
    .select("id, founder_id, status, version, content_hash, public_code, updated_at")
    .eq("id", id)
    .single();
  return data && data.founder_id === userId ? data : null;
}

/** Edit & resubmit: new immutable version, back into the review pipeline. */
export async function PUT(req: Request, ctx: RouteContext<"/api/ideas/[id]">) {
  const user = await getSessionUser();
  if (!user) return fail("unauthorized", 401);
  const { id } = await ctx.params;
  const idea = await ownIdea(id, user.id);
  if (!idea) return fail("not_found", 404);
  // An analysis older than 15 minutes is considered stuck (e.g. function timeout), so editing is allowed.
  if (idea.status === "analysing" && !isStuckAnalysis(idea.status, idea.updated_at)) return fail("busy", 409);
  if (!(await rateLimit(`submit:u:${user.id}`, LIMITS.submitPerHourPerUser, 3600))) return fail("rate_limited", 429);

  const body = editBody.safeParse(await readJson(req));
  if (!body.success) return fail("bad_request", 400);
  const prepared = prepareContent(body.data.content);
  if (!prepared.ok) return json({ error: "validation", issues: prepared.issues }, 400);

  const db = createAdminClient();
  const { count } = await db.from("idea_files").select("id", { count: "exact", head: true }).eq("idea_id", id);
  const newFiles = body.data.fileIds;
  if ((count ?? 0) + newFiles.length > UPLOAD.maxFiles) return fail("too_many_files", 400);
  if (!(await linkFiles(user.id, id, newFiles))) return fail("bad_files", 400);

  const changed = prepared.hash !== idea.content_hash;
  const version = changed ? idea.version + 1 : idea.version;
  if (changed) {
    await db.from("idea_versions").insert({ idea_id: id, version, content: prepared.content, content_hash: prepared.hash });
  }
  await db
    .from("ideas")
    .update({
      title: prepared.content.title,
      kind: prepared.content.kind,
      sector: prepared.content.sector,
      stage: prepared.content.stage,
      content: prepared.content,
      content_hash: prepared.hash,
      version,
      status: "submitted",
      founder_feedback: null,
    })
    .eq("id", id);
  await audit({ actorId: user.id, action: "idea_resubmitted", entity: "idea", entityId: id, meta: { version, changed }, ipHash: hashIp(await clientIp()) });

  const { data: profile } = await db.from("profiles").select("email, phone").eq("id", user.id).single();
  const submittedAt = new Date().toISOString();
  after(async () => {
    if (changed && profile?.email && profile.phone) {
      await sendReceipts({ to: { email: profile.email, phone: profile.phone }, publicCode: idea.public_code, submittedAt, hash: prepared.hash, version, content: prepared.content });
    }
    await analyzeIdea(id); // re-uses cached analysis when content is unchanged
  });
  return json({ ok: true, version, changed });
}

/** Permanent deletion of the idea, all versions, analyses and stored files. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/ideas/[id]">) {
  const user = await getSessionUser();
  if (!user) return fail("unauthorized", 401);
  const { id } = await ctx.params;
  const idea = await ownIdea(id, user.id);
  if (!idea) return fail("not_found", 404);

  const db = createAdminClient();
  const { data: files } = await db.from("idea_files").select("storage_path").eq("idea_id", id);
  if (files?.length) {
    const { error } = await db.storage.from(UPLOAD.bucket).remove(files.map((f) => f.storage_path));
    if (error) return fail("storage_delete_failed", 500); // do not orphan files: abort
  }
  const { error } = await db.from("ideas").delete().eq("id", id); // cascades to versions/analyses/files/reviews
  if (error) return fail("server_error", 500);
  await audit({ actorId: user.id, action: "idea_deleted", entity: "idea", entityId: id, meta: { code: idea.public_code } });
  return json({ ok: true });
}

// AI analysis runs in after(); allow up to 5 minutes (needs a plan that permits it).
export const maxDuration = 300;
