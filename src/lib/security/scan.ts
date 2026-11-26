import "server-only";

export type ScanResult = "clean" | "infected" | "unscanned" | "error";

/**
 * Virus scanning hook. Supabase Storage has no built-in AV, so this posts the
 * file to a scanner you operate (e.g. a ClamAV REST container) at
 * MALWARE_SCAN_URL, expecting JSON { infected: boolean }.
 *
 * With no scanner configured the result is "unscanned": the owner can still
 * see their own file, but NO other party (admin download, investors in
 * Phase 3) is given a download URL for it.
 */
export async function scanFile(bytes: ArrayBuffer, filename: string): Promise<ScanResult> {
  const url = process.env.MALWARE_SCAN_URL;
  if (!url) return "unscanned";
  try {
    const form = new FormData();
    form.append("file", new Blob([bytes]), filename);
    const headers: Record<string, string> = {};
    if (process.env.MALWARE_SCAN_TOKEN) headers.authorization = `Bearer ${process.env.MALWARE_SCAN_TOKEN}`;
    const res = await fetch(url, { method: "POST", body: form, headers, signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return "error";
    const json = (await res.json()) as { infected?: boolean };
    return json.infected === true ? "infected" : json.infected === false ? "clean" : "error";
  } catch {
    return "error";
  }
}
