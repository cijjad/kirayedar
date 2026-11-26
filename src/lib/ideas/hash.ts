import { createHash, randomInt } from "node:crypto";

/** Deterministic JSON (sorted keys) so the same content always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function contentHash(content: unknown): string {
  return createHash("sha256").update(canonicalJson(content)).digest("hex");
}

// No 0/O/1/I/L to avoid misreading over the phone.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Human-readable Idea ID, e.g. IB-2611-7KQ9XM (year-month + 6 random chars). */
export function newPublicCode(now = new Date()): string {
  const yymm = `${String(now.getUTCFullYear()).slice(2)}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  let rand = "";
  for (let i = 0; i < 6; i++) rand += ALPHABET[randomInt(ALPHABET.length)];
  return `IB-${yymm}-${rand}`;
}
