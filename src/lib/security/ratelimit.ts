import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Fixed-window limiter backed by Postgres (public.rate_limit_hit).
 * Fails CLOSED: if the limiter itself errors, the request is refused.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("rate_limit_hit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("rate_limit_error", error.code);
    return false;
  }
  return data === true;
}
