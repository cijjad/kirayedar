export const STUCK_AFTER_MS = 15 * 60_000;

/** An analysis still "running" after 15 minutes almost certainly died (e.g. function timeout). */
export function isStuckAnalysis(status: string, updatedAt: string, now: number = Date.now()): boolean {
  return status === "analysing" && now - new Date(updatedAt).getTime() > STUCK_AFTER_MS;
}
