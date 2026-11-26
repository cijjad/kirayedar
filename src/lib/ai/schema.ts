import { z } from "zod";

export const DIMENSIONS = [
  { key: "problem", weight: 0.15 },
  { key: "market", weight: 0.15 },
  { key: "trend", weight: 0.1 },
  { key: "economics", weight: 0.15 },
  { key: "feasibility", weight: 0.1 },
  { key: "competition", weight: 0.1 },
  { key: "gtm", weight: 0.1 },
  { key: "founder", weight: 0.1 },
  { key: "disruption", weight: 0.05 },
] as const;
export type DimensionKey = (typeof DIMENSIONS)[number]["key"];

export const VERDICTS = ["investor_ready", "promising", "early", "not_viable"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const FLAGS = [
  "PROMPT_INJECTION_ATTEMPT",
  "INSUFFICIENT_DETAIL",
  "OFF_TOPIC_OR_SPAM",
  "REGULATED_ACTIVITY",
  "UNVERIFIED_SOURCE",
] as const;
export type Flag = (typeof FLAGS)[number];

const claim = z.object({
  claim: z.string(),
  evidence_type: z.enum(["SOURCED", "FOUNDER_CLAIM", "AI_ESTIMATE"]),
  source_url: z.string().nullable(),
});

const dimension = z.object({
  score: z.number(),
  reasoning: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
  claims: z.array(claim),
});

/**
 * Schema sent to the API as the structured-output format. Kept free of
 * numeric/length constraints (enforced after parsing by `validateAnalysis`)
 * so it stays within what structured outputs supports.
 */
export const modelOutputSchema = z.object({
  summary: z.string(),
  dimensions: z.object({
    problem: dimension,
    market: dimension,
    trend: dimension,
    economics: dimension,
    feasibility: dimension,
    competition: dimension,
    gtm: dimension,
    founder: dimension,
    disruption: dimension,
  }),
  proposed_verdict: z.enum(VERDICTS),
  strengths: z.array(z.string()),
  risks: z.array(z.string()),
  red_flags: z.array(z.string()),
  what_to_fix: z.array(z.string()),
  missing_information: z.array(z.string()),
  regulatory_checks: z.array(z.string()),
  flags: z.array(z.enum(FLAGS)),
});
export type ModelOutput = z.infer<typeof modelOutputSchema>;

/** Stricter post-parse validation. Anything failing this is rejected, not saved. */
const strictClaim = claim.extend({
  claim: z.string().min(1).max(600),
  source_url: z.string().max(500).nullable(),
});
const strictDimension = dimension.extend({
  score: z.number().min(0).max(10),
  reasoning: z.string().min(1).max(1200),
  claims: z.array(strictClaim).max(8),
});
const shortList = (max: number) => z.array(z.string().min(1).max(500)).max(max);

export const strictOutputSchema = modelOutputSchema.extend({
  summary: z.string().min(1).max(1200),
  dimensions: z.object(
    Object.fromEntries(DIMENSIONS.map((d) => [d.key, strictDimension])) as Record<DimensionKey, typeof strictDimension>,
  ),
  strengths: shortList(3),
  risks: shortList(3),
  red_flags: shortList(8),
  what_to_fix: shortList(10),
  missing_information: shortList(10),
  regulatory_checks: shortList(8),
  flags: z.array(z.enum(FLAGS)).max(FLAGS.length),
});

/** What is stored in analyses.result after server-side post-processing. */
export type StoredAnalysis = z.infer<typeof strictOutputSchema> & {
  overall_score: number;
  verdict: Verdict;
  schema_version: 1;
};
