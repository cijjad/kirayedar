import { z } from "zod";
import {
  CITIES,
  COST_RANGES,
  FUNDING_RANGES,
  KINDS,
  REVENUE_MODELS,
  SECTORS,
  STAGES,
  TIMELINES,
  UPLOAD,
} from "@/lib/config";

/** [min, max] characters per text field. Shared by UI counters and validation. */
export const LIMITS = {
  title: [3, 80],
  description: [30, 1500],
  problem: [30, 1000],
  targetMarket: [20, 800],
  evidence: [20, 1000],
  competitorName: [1, 80],
  competitorLink: [0, 200],
  competitorLocation: [0, 80],
  differentiation: [20, 1000],
  whyBetter: [20, 800],
  disruption: [20, 800],
  revenueExplanation: [20, 800],
  fundingUse: [0, 600],
  requirements: [20, 1000],
  hardestPart: [10, 600],
  positioning: [10, 200],
  first100: [20, 800],
  timelineReasoning: [10, 500],
  founderStrength: [20, 1000],
  name: [2, 120],
  cityOther: [0, 60],
  email: [3, 254],
} as const satisfies Record<string, readonly [number, number]>;

type Field = keyof typeof LIMITS;
const text = (f: Field) => z.string().trim().min(LIMITS[f][0], { message: "too_short" }).max(LIMITS[f][1], { message: "too_long" });

export const competitorSchema = z.object({
  name: text("competitorName"),
  link: z.string().trim().max(LIMITS.competitorLink[1]).optional().default(""),
  location: z.string().trim().max(LIMITS.competitorLocation[1]).optional().default(""),
});

export const step1 = z.object({
  title: text("title"),
  description: text("description"),
  kind: z.enum(KINDS),
  sector: z.enum(SECTORS),
  stage: z.enum(STAGES),
});

export const step2 = z.object({
  problem: text("problem"),
  targetMarket: text("targetMarket"),
  evidence: text("evidence"),
});

export const step3 = z
  .object({
    competitors: z.array(competitorSchema).max(8).default([]),
    noCompetitorsKnown: z.boolean().default(false),
    differentiation: text("differentiation"),
    whyBetter: text("whyBetter"),
    disruption: text("disruption"),
  })
  .refine((v) => v.noCompetitorsKnown || v.competitors.length > 0, {
    message: "competitors_or_none",
    path: ["competitors"],
  });

export const step4 = z.object({
  revenueModels: z.array(z.enum(REVENUE_MODELS)).min(1, { message: "pick_one" }).max(REVENUE_MODELS.length),
  revenueExplanation: text("revenueExplanation"),
  startCost: z.enum(COST_RANGES),
  fundingNeeded: z.enum(FUNDING_RANGES),
  fundingUse: z.string().trim().max(LIMITS.fundingUse[1]).default(""),
  requirements: text("requirements"),
  hardestPart: text("hardestPart"),
});

export const step5 = z.object({
  positioning: text("positioning"),
  first100: text("first100"),
  timeline: z.enum(TIMELINES),
  timelineReasoning: text("timelineReasoning"),
  founderStrength: text("founderStrength"),
  fileIds: z.array(z.string().uuid()).max(UPLOAD.maxFiles).default([]),
});

// Pakistani mobile: +92 3XX XXXXXXX (accepts 03XX..., 92..., +92..., spaces/dashes).
export function normalizePkPhone(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, "");
  const m = /^(?:\+?92|0)?(3\d{9})$/.exec(digits);
  return m ? `+92${m[1]}` : null;
}

export const contactSchema = z.object({
  name: text("name"),
  city: z.enum(CITIES),
  cityOther: z.string().trim().max(LIMITS.cityOther[1]).default(""),
  phone: z.string().trim().refine((p) => normalizePkPhone(p) !== null, { message: "bad_phone" }),
  email: z.string().trim().max(LIMITS.email[1]).email({ message: "bad_email" }),
  consentTerms: z.literal(true, { message: "consent_required" }),
  consentBlind: z.literal(true, { message: "consent_required" }),
});

/** The idea content stored in ideas.content and sent (minus nothing else) to the AI. */
export const ideaContentSchema = z.object({
  ...step1.shape,
  ...step2.shape,
  competitors: z.array(competitorSchema).max(8),
  noCompetitorsKnown: z.boolean(),
  differentiation: text("differentiation"),
  whyBetter: text("whyBetter"),
  disruption: text("disruption"),
  ...step4.shape,
  positioning: text("positioning"),
  first100: text("first100"),
  timeline: z.enum(TIMELINES),
  timelineReasoning: text("timelineReasoning"),
  founderStrength: text("founderStrength"),
}).refine((v) => v.noCompetitorsKnown || v.competitors.length > 0, {
  message: "competitors_or_none",
  path: ["competitors"],
});
export type IdeaContent = z.infer<typeof ideaContentSchema>;

export const submissionSchema = z.object({
  content: ideaContentSchema,
  fileIds: z.array(z.string().uuid()).max(UPLOAD.maxFiles).default([]),
  contact: contactSchema,
  captchaToken: z.string().max(4096).optional(),
});
export type Submission = z.infer<typeof submissionSchema>;

/** Wizard step schemas in order; used client-side for per-step validation. */
export const STEP_SCHEMAS = [step1, step2, step3, step4, step5.extend(contactSchema.shape)] as const;
