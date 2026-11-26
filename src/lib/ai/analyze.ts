import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { LIMITS } from "@/lib/config";
import { AI } from "./config";
import { ideaContentSchema } from "@/lib/ideas/schema";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/security/ratelimit";
import { createAdminClient } from "@/lib/supabase/admin";
import { finalizeAnalysis } from "./postprocess";
import { buildUserMessage, detectInjection, redactPii, SYSTEM_PROMPT, trustedUrlsFrom } from "./prompt";
import { modelOutputSchema, type StoredAnalysis } from "./schema";

let client: Anthropic | null = null;
function anthropic() {
  // Reads ANTHROPIC_API_KEY from the server environment. Never exposed to the browser.
  client ??= new Anthropic({ maxRetries: 2, timeout: 5 * 60 * 1000 });
  return client;
}

type Outcome = { ok: true; cached: boolean; analysis: StoredAnalysis } | { ok: false; error: string };

/**
 * Runs (or reuses) the AI analysis for one idea and updates its status.
 * Called from server code only, after authorization has been checked.
 */
export async function analyzeIdea(ideaId: string, opts: { force?: boolean } = {}): Promise<Outcome> {
  const db = createAdminClient();
  const { data: idea, error } = await db
    .from("ideas")
    .select("id, founder_id, content, content_hash, city, status")
    .eq("id", ideaId)
    .single();
  if (error || !idea) return { ok: false, error: "not_found" };

  // Cache: identical content already analysed successfully => reuse, no API call.
  if (!opts.force) {
    const { data: cached } = await db
      .from("analyses")
      .select("result")
      .eq("idea_id", ideaId)
      .eq("content_hash", idea.content_hash)
      .eq("ok", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cached?.result) {
      const analysis = cached.result as StoredAnalysis;
      await db.from("ideas").update({ status: "analysed", ai_score: analysis.overall_score, ai_verdict: analysis.verdict, ai_flags: analysis.flags }).eq("id", ideaId);
      return { ok: true, cached: true, analysis };
    }
  }

  // Cost guard: cap analyses per idea per day.
  if (!(await rateLimit(`analysis:${ideaId}`, LIMITS.analysisPerDayPerIdea, 86_400))) {
    return { ok: false, error: "analysis_rate_limited" };
  }

  const content = ideaContentSchema.parse(idea.content);
  const { data: profile } = await db.from("profiles").select("full_name, email, phone").eq("id", idea.founder_id).single();
  const redacted = redactPii(content, { name: profile?.full_name, email: profile?.email, phone: profile?.phone });
  const heuristicFlags = detectInjection(content);

  await db.from("ideas").update({ status: "analysing" }).eq("id", ideaId);

  const fail = async (errorCode: string, usage?: { input_tokens?: number; output_tokens?: number }) => {
    await db.from("analyses").insert({
      idea_id: ideaId,
      content_hash: idea.content_hash,
      model: AI.model,
      ok: false,
      error: errorCode,
      input_tokens: usage?.input_tokens ?? null,
      output_tokens: usage?.output_tokens ?? null,
    });
    await db.from("ideas").update({ status: "analysis_failed" }).eq("id", ideaId);
    await audit({ actorId: null, action: "analysis_failed", entity: "idea", entityId: ideaId, meta: { error: errorCode } });
    return { ok: false as const, error: errorCode };
  };

  let response;
  try {
    response = await anthropic().beta.messages.parse({
      model: AI.model,
      max_tokens: AI.maxTokens,
      // If a safety classifier declines, the API retries on a fallback model in the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: betaZodOutputFormat(modelOutputSchema) },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: buildUserMessage(redacted, idea.city) }],
    });
  } catch (err) {
    // Log only the error class/status — never the prompt or submission.
    const code =
      err instanceof Anthropic.RateLimitError ? "ai_rate_limited"
      : err instanceof Anthropic.AuthenticationError ? "ai_auth_error"
      : err instanceof Anthropic.BadRequestError ? "ai_bad_request"
      : err instanceof Anthropic.APIError ? `ai_api_error_${err.status ?? "unknown"}`
      : "ai_network_error";
    console.error("analysis_call_failed", code);
    return fail(code);
  }

  const usage = { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens };
  if (response.stop_reason === "refusal") return fail("ai_refused", usage);
  if (response.stop_reason === "max_tokens") return fail("ai_truncated", usage);
  if (!response.parsed_output) return fail("ai_unparseable", usage);

  let analysis: StoredAnalysis;
  try {
    analysis = finalizeAnalysis(response.parsed_output, { trustedUrls: trustedUrlsFrom(content), heuristicFlags });
  } catch {
    return fail("ai_schema_invalid", usage);
  }

  await db.from("analyses").insert({
    idea_id: ideaId,
    content_hash: idea.content_hash,
    model: response.model,
    ok: true,
    result: analysis,
    overall_score: analysis.overall_score,
    verdict: analysis.verdict,
    flags: analysis.flags,
    ...usage,
  });
  await db
    .from("ideas")
    .update({ status: "analysed", ai_score: analysis.overall_score, ai_verdict: analysis.verdict, ai_flags: analysis.flags })
    .eq("id", ideaId);
  await audit({ actorId: null, action: "analysis_completed", entity: "idea", entityId: ideaId, meta: { score: analysis.overall_score } });
  return { ok: true, cached: false, analysis };
}
