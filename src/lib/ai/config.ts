import "server-only";

export const AI = {
  // Override with ANTHROPIC_MODEL. Default per current Anthropic guidance.
  model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
  maxTokens: 16000,
};
