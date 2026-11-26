import { UPLOAD } from "@/lib/config";

/** Detects the real file type from its first bytes. Returns null if not allowed. */
export function sniffMime(head: Uint8Array): string | null {
  const b = head;
  const starts = (sig: number[], offset = 0) => sig.every((x, i) => b[offset + i] === x);
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  // MP4: ....ftyp at offset 4
  if (starts([0x66, 0x74, 0x79, 0x70], 4)) return "video/mp4";
  // PPTX is a ZIP (PK\x03\x04). Verified further by the [Content_Types] check below.
  if (starts([0x50, 0x4b, 0x03, 0x04])) return "application/zip";
  return null;
}

/**
 * Validate declared name/type/size before issuing an upload URL.
 * Returns the canonical MIME or an error code.
 */
export function checkDeclaredFile(name: string, mime: string, size: number): { ok: true; mime: string; ext: string } | { ok: false; error: string } {
  if (!Number.isFinite(size) || size <= 0 || size > UPLOAD.maxBytes) return { ok: false, error: "file_too_large" };
  const exts = UPLOAD.types[mime];
  if (!exts) return { ok: false, error: "file_type_not_allowed" };
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  if (!exts.includes(ext)) return { ok: false, error: "file_type_not_allowed" };
  return { ok: true, mime, ext };
}

/** After upload: does the stored content match the declared type? */
export function contentMatchesDeclared(declared: string, head: Uint8Array, fullZipText?: string): boolean {
  const sniffed = sniffMime(head);
  if (declared === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
    // A PPTX is a zip containing ppt/ entries; checking the central-directory
    // text for "ppt/" is a cheap structural check (not a full parse).
    return sniffed === "application/zip" && (fullZipText === undefined || fullZipText.includes("ppt/"));
  }
  return sniffed === declared;
}

/** Storage object names never use the founder's filename (path traversal / PII). */
export function safeDisplayName(name: string): string {
  return name.replace(/[\\/\u0000-\u001f<>:"|?*]/g, "_").slice(0, 200) || "file";
}
