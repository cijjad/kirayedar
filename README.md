# IdeaBridge (working name) — idea-to-investor platform for Pakistan

Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind v4 · Supabase (Postgres + Auth + Storage + RLS) · Claude API.
English + Urdu (RTL, Nastaliq). Locale lives in the URL: `/en/...`, `/ur/...`.

## Phase 1 scope (built)
Landing · login (phone OTP, email OTP, Google) · 5-step submission wizard (autosave on device, voice input, uploads) ·
AI analysis (9 weighted dimensions, strict JSON, evidence tagging) · founder dashboard · admin review panel + analytics.

## Setup
1. `npm ci`
2. Create a Supabase project. Apply `supabase/migrations/*.sql` in order (SQL editor or `supabase db push`).
3. Supabase Auth: enable Phone (SMS provider or Send-SMS hook for a Pakistani aggregator), Email OTP, Google.
   Enable CAPTCHA protection (Turnstile) in Auth settings with the same Turnstile site.
4. Make a user admin (SQL, as owner): `update public.profiles set role='admin' where email='you@x.pk';`
5. Copy `.env.example` to `.env.local` and fill it in. `npm run dev`.

## Tests
- `npm test` — unit tests (sanitisation, prompt-injection guard, PII redaction, scoring, evidence rules, files, validation).
- `RLS_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres npm run test:rls` — runs every migration on a throwaway
  database and attacks the RLS policies as founder / other founder / investor / admin / anonymous.
- `npm run typecheck`, `npm run lint`, `npm run build`.

## Security model (short)
- Browser: anon key + user JWT. `authenticated` has **SELECT only** (row-filtered) on idea data; all writes go through
  server routes using the service-role key after explicit checks. Role changes are impossible from the client.
- Any **new table** inherits Supabase's default grants to `anon`/`authenticated`: always enable RLS and revoke in the same migration.
- Founder name/phone/email are never sent to the AI; free text is redacted of names, phones, emails and CNICs.
- The model's verdict is not trusted: the weighted score and verdict are recomputed server-side; "SOURCED" claims are
  only kept when the URL came from the founder (Phase 1 has no web search).
- Uploads: private bucket, signed one-time upload URLs, magic-byte type check, optional malware scan, 60-second
  signed download URLs, every download audit-logged.
