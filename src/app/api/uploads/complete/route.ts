import { z } from "zod";
import { fail, json, readJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth";
import { UPLOAD } from "@/lib/config";
import { contentMatchesDeclared } from "@/lib/security/files";
import { scanFile } from "@/lib/security/scan";
import { createAdminClient } from "@/lib/supabase/admin";

const body = z.object({ fileId: z.string().uuid() });

/** Verifies an uploaded object: real size, real type (magic bytes), virus scan. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return fail("unauthorized", 401);
  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) return fail("bad_request", 400);

  const db = createAdminClient();
  const { data: file } = await db
    .from("idea_files")
    .select("id, founder_id, storage_path, original_name, mime, scan_status")
    .eq("id", parsed.data.fileId)
    .single();
  if (!file || file.founder_id !== user.id) return fail("not_found", 404);
  if (file.scan_status !== "pending") return json({ status: file.scan_status });

  const bucket = db.storage.from(UPLOAD.bucket);
  const { data: blob, error } = await bucket.download(file.storage_path);
  if (error || !blob) return fail("upload_missing", 400);

  const reject = async (reason: string) => {
    await bucket.remove([file.storage_path]);
    await db.from("idea_files").delete().eq("id", file.id);
    await audit({ actorId: user.id, action: "upload_rejected", entity: "file", entityId: file.id, meta: { reason } });
    return fail(reason, 400);
  };

  if (blob.size <= 0 || blob.size > UPLOAD.maxBytes) return reject("file_too_large");
  const buf = await blob.arrayBuffer();
  const head = new Uint8Array(buf.slice(0, 16));
  // For PPTX, look for "ppt/" entry names in the zip directory (latin1 view).
  const zipText = file.mime.includes("presentationml") ? Buffer.from(buf).toString("latin1") : undefined;
  if (!contentMatchesDeclared(file.mime, head, zipText)) return reject("file_type_mismatch");

  const result = await scanFile(buf, file.original_name);
  if (result === "infected") {
    await bucket.remove([file.storage_path]);
    await db.from("idea_files").update({ scan_status: "infected" }).eq("id", file.id);
    await audit({ actorId: user.id, action: "upload_infected", entity: "file", entityId: file.id });
    return fail("file_infected", 400);
  }
  await db.from("idea_files").update({ scan_status: result, size_bytes: blob.size }).eq("id", file.id);
  return json({ status: result });
}
