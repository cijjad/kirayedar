import { randomUUID } from "node:crypto";
import { z } from "zod";
import { fail, json, readJson } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { LIMITS, UPLOAD } from "@/lib/config";
import { checkDeclaredFile, safeDisplayName } from "@/lib/security/files";
import { rateLimit } from "@/lib/security/ratelimit";
import { createAdminClient } from "@/lib/supabase/admin";

const body = z.object({ name: z.string().min(1).max(255), mime: z.string().max(120), size: z.number().int().positive() });

/** Issues a one-time signed upload URL for a private object. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return fail("unauthorized", 401);
  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) return fail("bad_request", 400);
  const check = checkDeclaredFile(parsed.data.name, parsed.data.mime, parsed.data.size);
  if (!check.ok) return fail(check.error, 400);
  if (!(await rateLimit(`upload:${user.id}`, LIMITS.uploadSignPerHourPerUser, 3600))) return fail("rate_limited", 429);

  const db = createAdminClient();
  const { count } = await db.from("idea_files").select("id", { count: "exact", head: true }).eq("founder_id", user.id).is("idea_id", null);
  if ((count ?? 0) >= UPLOAD.maxFiles * 3) return fail("too_many_pending_files", 429);

  const id = randomUUID();
  // Object name never contains the user's filename.
  const path = `${user.id}/${id}.${check.ext}`;
  const { error: insErr } = await db.from("idea_files").insert({
    id,
    founder_id: user.id,
    storage_path: path,
    original_name: safeDisplayName(parsed.data.name),
    mime: check.mime,
    size_bytes: parsed.data.size,
    scan_status: "pending",
  });
  if (insErr) return fail("server_error", 500);
  const { data, error } = await db.storage.from(UPLOAD.bucket).createSignedUploadUrl(path);
  if (error || !data) return fail("server_error", 500);
  return json({ fileId: id, path: data.path, token: data.token });
}
