import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";

/** Client IP from the platform proxy header (Vercel sets x-forwarded-for). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
}

/** Salted hash so the audit log/rate limiter never stores raw IPs. */
export function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT ?? "";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}
