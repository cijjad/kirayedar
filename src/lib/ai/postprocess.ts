import { safeUrl } from "@/lib/security/sanitize";
import { DIMENSIONS, type Flag, type StoredAnalysis, strictOutputSchema, type Verdict } from "./schema";

/** Weighted 0-10 score, rounded to 2 dp. Computed here, never taken from the model. */
export function weightedScore(scores: Record<string, number>): number {
  let total = 0;
  for (const d of DIMENSIONS) {
    const s = scores[d.key];
    if (typeof s !== "number" || Number.isNaN(s)) throw new Error(`missing score: ${d.key}`);
    total += Math.min(10, Math.max(0, s)) * d.weight;
  }
  return Math.round(total * 100) / 100;
}

/**
 * Deterministic verdict from the score. The model's proposed verdict is kept
 * for reference but cannot upgrade an idea. Red flags or an injection attempt
 * cap the verdict at "promising" so a human must look closely.
 */
export function verdictFor(score: number, opts: { redFlags: number; flags: Flag[] }): Verdict {
  let v: Verdict = score >= 7.5 ? "investor_ready" : score >= 6 ? "promising" : score >= 4 ? "early" : "not_viable";
  const capped = opts.redFlags > 0 || opts.flags.includes("PROMPT_INJECTION_ATTEMPT") || opts.flags.includes("OFF_TOPIC_OR_SPAM");
  if (capped && v === "investor_ready") v = "promising";
  return v;
}

function normalizeForMatch(u: string): string {
  return safeUrl(u).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "").toLowerCase();
}

/**
 * A claim may only be labelled SOURCED if its URL is one we can vouch for:
 * in Phase 1 that means a URL the founder supplied (e.g. competitor links).
 * Anything else is a URL the model produced from memory, which may be
 * invented, so it is downgraded to AI_ESTIMATE and the URL dropped.
 */
export function enforceEvidence(
  output: ReturnType<typeof strictOutputSchema.parse>,
  trustedUrls: string[],
): { output: typeof output; downgraded: number } {
  const trusted = new Set(trustedUrls.map(normalizeForMatch).filter(Boolean));
  let downgraded = 0;
  for (const d of DIMENSIONS) {
    for (const c of output.dimensions[d.key].claims) {
      if (c.evidence_type === "SOURCED") {
        const ok = c.source_url && trusted.has(normalizeForMatch(c.source_url));
        if (!ok) {
          c.evidence_type = "AI_ESTIMATE";
          c.source_url = null;
          downgraded++;
        } else {
          c.source_url = safeUrl(c.source_url);
        }
      } else {
        c.source_url = null;
      }
    }
  }
  return { output, downgraded };
}

export function finalizeAnalysis(
  raw: unknown,
  opts: { trustedUrls: string[]; heuristicFlags: Flag[] },
): StoredAnalysis {
  const parsed = strictOutputSchema.parse(raw);
  const { output, downgraded } = enforceEvidence(parsed, opts.trustedUrls);
  const flags = new Set<Flag>([...output.flags, ...opts.heuristicFlags]);
  if (downgraded > 0) flags.add("UNVERIFIED_SOURCE");
  const flagList = [...flags];
  const scores = Object.fromEntries(DIMENSIONS.map((d) => [d.key, output.dimensions[d.key].score]));
  const overall = weightedScore(scores);
  return {
    ...output,
    flags: flagList,
    overall_score: overall,
    verdict: verdictFor(overall, { redFlags: output.red_flags.length, flags: flagList }),
    schema_version: 1,
  };
}
