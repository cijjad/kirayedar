"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { TURNSTILE_SITE_KEY, Turnstile } from "@/components/Turnstile";
import { Button } from "@/components/ui";
import { normalizePkPhone } from "@/lib/ideas/schema";
import { useI18n } from "@/lib/i18n/client";
import { safeNext } from "@/lib/safe-redirect";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { supabaseConfigured } from "@/lib/supabase/env";

const input = "min-h-12 w-full rounded-xl border border-line bg-surface px-4 text-base";

export function LoginForm() {
  const { t, locale } = useI18n();
  const L = t.login;
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"), `/${locale}/dashboard`);
  const [mode, setMode] = useState<"phone" | "email">("phone");
  const [id, setId] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const onToken = useCallback((tok: string | null) => setCaptcha(tok), []);

  if (!supabaseConfigured) return <p className="text-danger">{L.notConfigured}</p>;
  const supabase = createBrowserSupabase();

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const phone = mode === "phone" ? normalizePkPhone(id) : null;
    if (mode === "phone" && !phone) return setError(t.wizard.errors.bad_phone);
    setBusy(true);
    const options = { shouldCreateUser: true, captchaToken: captcha ?? undefined };
    const { error } =
      mode === "phone"
        ? await supabase.auth.signInWithOtp({ phone: phone!, options })
        : await supabase.auth.signInWithOtp({ email: id.trim(), options });
    setBusy(false);
    if (error) return setError(L.error);
    setSent(true);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } =
      mode === "phone"
        ? await supabase.auth.verifyOtp({ phone: normalizePkPhone(id)!, token: code.trim(), type: "sms" })
        : await supabase.auth.verifyOtp({ email: id.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) return setError(L.error);
    router.replace(next);
    router.refresh();
  }

  async function google() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
  }

  return (
    <div>
      <h1 className="mb-5 text-2xl font-bold text-brand">{L.title}</h1>
      {!sent ? (
        <form onSubmit={send} className="space-y-4">
          <div role="tablist" className="grid grid-cols-2 gap-2 rounded-xl bg-bg p-1">
            {(["phone", "email"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => { setMode(m); setId(""); }}
                className={`min-h-11 rounded-lg font-semibold ${mode === m ? "bg-surface text-brand shadow-sm" : "text-ink-soft"}`}
              >
                {m === "phone" ? L.phoneTab : L.emailTab}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="mb-1 block font-semibold">{mode === "phone" ? L.phoneLabel : L.emailLabel}</span>
            <input
              className={`${input} ltr`}
              type={mode === "phone" ? "tel" : "email"}
              inputMode={mode === "phone" ? "tel" : "email"}
              autoComplete={mode === "phone" ? "tel" : "email"}
              placeholder={mode === "phone" ? "0300 1234567" : "you@example.com"}
              value={id}
              onChange={(e) => setId(e.target.value)}
              required
            />
            <span className="mt-1 block text-sm text-ink-soft">{mode === "phone" ? L.phoneHelp : L.emailHelp}</span>
          </label>
          <Turnstile action="login" onToken={onToken} />
          <Button type="submit" className="w-full" disabled={busy || (!!TURNSTILE_SITE_KEY && !captcha)}>
            {L.sendCode}
          </Button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-4">
          <p className="rounded-xl bg-accent-soft p-3 text-accent">{L.sent}</p>
          <label className="block">
            <span className="mb-1 block font-semibold">{L.codeLabel}</span>
            <input
              className={`${input} ltr text-center text-2xl tracking-[0.5em]`}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              required
            />
          </label>
          <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
            {L.verify}
          </Button>
        </form>
      )}
      {error ? <p role="alert" className="mt-3 text-danger">{error}</p> : null}
      <div className="my-5 flex items-center gap-3 text-sm text-ink-soft">
        <span className="h-px flex-1 bg-line" />
        {L.or}
        <span className="h-px flex-1 bg-line" />
      </div>
      <Button type="button" variant="secondary" className="w-full" onClick={google}>
        {L.google}
      </Button>
    </div>
  );
}
