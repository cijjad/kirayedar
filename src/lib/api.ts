import "server-only";
import { NextResponse } from "next/server";

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
export const fail = (error: string, status: number) => json({ error }, status);

/** Parse a JSON body with a hard size cap (default 64 KB). */
export async function readJson(req: Request, maxBytes = 64 * 1024): Promise<unknown | null> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > maxBytes) return null;
  const text = await req.text();
  if (text.length > maxBytes) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
