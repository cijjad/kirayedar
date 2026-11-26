import { NextResponse } from "next/server";
import { z } from "zod";
import { fail } from "@/lib/api";
import { audit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth";
import { UPLOAD } from "@/lib/config";
import { clientIp, hashIp } from "@/lib/security/request";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Short-lived (60 s) signed download URL, after authorization.
 * Owner: any of their files except infected ones.
 * Admin: only files that passed a virus scan. Every access is audit-logged.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/files/[id]">) {
  const user = await getSessionUser();
  if (!user) return fail("unauthorized", 401);
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return fail("not_found", 404);

  const db = createAdminClient();
  const { data: file } = await db.from("idea_files").select("id, idea_id, founder_id, storage_path, original_name, scan_status").eq("id", id).single();
  if (!file) return fail("not_found", 404);
  const isOwner = file.founder_id === user.id;
  const isAdmin = user.role === "admin";
  const allowed = (isOwner && file.scan_status !== "infected") || (isAdmin && file.scan_status === "clean");
  if (!allowed) return fail("forbidden", 403);

  const { data, error } = await db.storage.from(UPLOAD.bucket).createSignedUrl(file.storage_path, 60, { download: file.original_name });
  if (error || !data) return fail("server_error", 500);
  await audit({
    actorId: user.id,
    action: "file_download",
    entity: "file",
    entityId: file.id,
    meta: { idea: file.idea_id, as: isOwner ? "owner" : "admin" },
    ipHash: hashIp(await clientIp()),
  });
  return NextResponse.redirect(data.signedUrl, { status: 303, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}
