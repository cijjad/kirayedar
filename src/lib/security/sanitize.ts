/**
 * Input sanitisation applied server-side to every founder string before it is
 * stored or sent to the AI. React escapes on render as a second layer.
 *
 * - Unicode NFC normalisation (safe for Urdu; NFKC can rewrite Arabic-script
 *   presentation forms and is avoided).
 * - Removes <script>/<style> blocks with their content, then every remaining
 *   tag-like sequence. This also removes any attempt to close/open our
 *   <submission> prompt delimiters.
 * - Removes control and invisible/bidi-override characters that can hide text
 *   from reviewers (keeps \n and \t, and keeps ZWNJ/ZWJ which Urdu needs).
 * - Collapses runs of blank lines and trims.
 */
const SCRIPT_STYLE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const TAGS = /<\/?[a-zA-Z!?][^<>]*>/g;
const DANGLING_TAG_OPEN = /<(?=[a-zA-Z/!?])/g;
// C0/C1 controls except \t \n; bidi overrides/isolates; BOM; word joiner etc.
const INVISIBLE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F‪-‮⁦-⁩​⁠-⁤﻿]/g;

export function sanitizeText(input: string): string {
  let s = input.normalize("NFC");
  s = s.replace(/\r\n?/g, "\n");
  s = s.replace(SCRIPT_STYLE, " ");
  s = s.replace(TAGS, " ");
  s = s.replace(DANGLING_TAG_OPEN, "‹"); // neutralise any '<' that still starts a tag
  s = s.replace(INVISIBLE, "");
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  s = s.replace(/[ \t]{2,}/g, " ");
  return s.trim();
}

/** Recursively sanitise every string in a JSON-like value. */
export function sanitizeDeep<T>(value: T): T {
  if (typeof value === "string") return sanitizeText(value) as T;
  if (Array.isArray(value)) return value.map(sanitizeDeep) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = sanitizeDeep(v);
    return out as T;
  }
  return value;
}

/** Only http(s) URLs are allowed in links; everything else becomes empty. */
export function safeUrl(input: string | undefined | null): string {
  if (!input) return "";
  const raw = input.trim();
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    if (u.username || u.password) return "";
    return u.toString().slice(0, 300);
  } catch {
    return "";
  }
}
