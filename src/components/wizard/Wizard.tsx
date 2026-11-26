"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TURNSTILE_SITE_KEY, Turnstile } from "@/components/Turnstile";
import { Button, ButtonLink, Card, Notice } from "@/components/ui";
import { CITIES, COST_RANGES, FUNDING_RANGES, KINDS, REVENUE_MODELS, SECTORS, STAGES, TIMELINES, UPLOAD } from "@/lib/config";
import { fmt } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";
import { type IdeaContent, LIMITS, STEP_SCHEMAS } from "@/lib/ideas/schema";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { supabaseConfigured } from "@/lib/supabase/env";
import { CheckboxField, ChoiceField, FieldShell, TextField } from "./Field";

type Competitor = { name: string; link: string; location: string };
type Content = Omit<IdeaContent, "kind" | "sector" | "stage" | "startCost" | "fundingNeeded" | "timeline" | "competitors"> & {
  kind: string; sector: string; stage: string; startCost: string; fundingNeeded: string; timeline: string; competitors: Competitor[];
};
type Contact = { name: string; city: string; cityOther: string; phone: string; email: string; consentTerms: boolean; consentBlind: boolean };
type UploadItem = { id: string; name: string; status: "uploading" | "pending" | "clean" | "unscanned" | "error" };
type State = { content: Content; contact: Contact; files: UploadItem[]; step: number };

const EMPTY: State = {
  step: 0,
  content: {
    title: "", description: "", kind: "", sector: "", stage: "",
    problem: "", targetMarket: "", evidence: "",
    competitors: [], noCompetitorsKnown: false, differentiation: "", whyBetter: "", disruption: "",
    revenueModels: [], revenueExplanation: "", startCost: "", fundingNeeded: "", fundingUse: "", requirements: "", hardestPart: "",
    positioning: "", first100: "", timeline: "", timelineReasoning: "", founderStrength: "",
  },
  contact: { name: "", city: "", cityOther: "", phone: "", email: "", consentTerms: false, consentBlind: false },
  files: [],
};

const STEP_KEYS: (keyof Content)[][] = [
  ["title", "description", "kind", "sector", "stage"],
  ["problem", "targetMarket", "evidence"],
  ["competitors", "noCompetitorsKnown", "differentiation", "whyBetter", "disruption"],
  ["revenueModels", "revenueExplanation", "startCost", "fundingNeeded", "fundingUse", "requirements", "hardestPart"],
  ["positioning", "first100", "timeline", "timelineReasoning", "founderStrength"],
];

type Receipt = { publicCode: string; submittedAt: string; hash: string };

export function Wizard({ mode, ideaId, initial, existingFiles = 0 }: { mode: "create" | "edit"; ideaId?: string; initial?: IdeaContent; existingFiles?: number }) {
  const { t, locale } = useI18n();
  const W = t.wizard;
  const F = W.fields;
  const O = W.options;
  const router = useRouter();
  const draftKey = mode === "create" ? "idea-draft-v1" : `idea-edit-v1-${ideaId}`;

  const [state, setState] = useState<State>(() => (initial ? { ...EMPTY, content: { ...EMPTY.content, ...initial } } : EMPTY));
  // Client-only component (see WizardClient), so reading localStorage here is safe.
  const [restorable, setRestorable] = useState<State | null>(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      return raw ? (JSON.parse(raw) as State) : null;
    } catch {
      return null;
    }
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loggedIn, setLoggedIn] = useState<boolean | null>(supabaseConfigured ? null : false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const onToken = useCallback((tok: string | null) => setCaptcha(tok), []);
  const total = STEP_KEYS.length;
  const step = state.step;

  // Autosave (debounced).
  useEffect(() => {
    if (restorable || receipt) return;
    const id = setTimeout(() => {
      try {
        const { files, ...rest } = state;
        localStorage.setItem(draftKey, JSON.stringify({ ...rest, files: files.filter((f) => f.status !== "uploading") }));
        setSavedAt(Date.now());
      } catch {}
    }, 600);
    return () => clearTimeout(id);
  }, [state, draftKey, restorable, receipt]);

  useEffect(() => {
    if (!supabaseConfigured) return;
    createBrowserSupabase().auth.getUser().then(({ data }) => setLoggedIn(!!data.user));
  }, []);

  const setC = <K extends keyof Content>(k: K, v: Content[K]) => setState((s) => ({ ...s, content: { ...s.content, [k]: v } }));
  const setK = <K extends keyof Contact>(k: K, v: Contact[K]) => setState((s) => ({ ...s, contact: { ...s.contact, [k]: v } }));
  const err = (k: string) => (errors[k] ? (W.errors as Record<string, string>)[errors[k]] ?? W.errors.required : undefined);

  const stepData = useMemo(() => {
    const d: Record<string, unknown> = Object.fromEntries(STEP_KEYS[step].map((k) => [k, state.content[k]]));
    if (step === 4) {
      d.fileIds = [];
      if (mode === "create") Object.assign(d, state.contact);
    }
    return d;
  }, [state, step, mode]);

  function validate(): boolean {
    const schema = step === 4 && mode === "edit" ? STEP_SCHEMAS[4].pick({ positioning: true, first100: true, timeline: true, timelineReasoning: true, founderStrength: true }) : STEP_SCHEMAS[step];
    const r = schema.safeParse(stepData);
    if (r.success) {
      setErrors({});
      return true;
    }
    const e: Record<string, string> = {};
    for (const i of r.error.issues) {
      const key = i.path.join(".");
      if (!e[key]) e[key] = i.message in W.errors ? i.message : "required";
    }
    setErrors(e);
    setFormError(W.errors.generic);
    // Take the user to the first problem, not the bottom of the page.
    const first = document.getElementById(Object.keys(e)[0]?.split(".")[0] ?? "");
    first?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (first instanceof HTMLInputElement || first instanceof HTMLTextAreaElement) first.focus({ preventScroll: true });
    return false;
  }

  const go = (n: number) => {
    setFormError(null);
    setState((s) => ({ ...s, step: n }));
    topRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  async function upload(list: FileList | null) {
    if (!list) return;
    const room = UPLOAD.maxFiles - existingFiles - state.files.length;
    const supabase = createBrowserSupabase();
    for (const file of Array.from(list).slice(0, Math.max(0, room))) {
      const tmp = `tmp-${crypto.randomUUID()}`;
      setState((s) => ({ ...s, files: [...s.files, { id: tmp, name: file.name, status: "uploading" }] }));
      const done = (patch: Partial<UploadItem> | null) =>
        setState((s) => ({ ...s, files: patch === null ? s.files.filter((f) => f.id !== tmp) : s.files.map((f) => (f.id === tmp ? { ...f, ...patch } : f)) }));
      try {
        const sign = await fetch("/api/uploads/sign", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: file.name, mime: file.type, size: file.size }),
        });
        if (!sign.ok) throw new Error((await sign.json()).error);
        const { fileId, path, token } = await sign.json();
        const up = await supabase.storage.from(UPLOAD.bucket).uploadToSignedUrl(path, token, file, { contentType: file.type });
        if (up.error) throw new Error("upload");
        const done2 = await fetch("/api/uploads/complete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileId }) });
        if (!done2.ok) throw new Error((await done2.json()).error);
        const { status } = await done2.json();
        done({ id: fileId, status });
      } catch {
        done({ status: "error" });
      }
    }
  }

  async function submit() {
    if (!validate()) return;
    setBusy(true);
    setFormError(null);
    const fileIds = state.files.filter((f) => f.status === "clean" || f.status === "unscanned").map((f) => f.id);
    const content = { ...state.content, competitors: state.content.noCompetitorsKnown ? [] : state.content.competitors };
    const res =
      mode === "create"
        ? await fetch("/api/ideas", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ content, contact: state.contact, fileIds, captchaToken: captcha ?? undefined }),
          })
        : await fetch(`/api/ideas/${ideaId}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ content, fileIds }) });
    setBusy(false);
    if (!res.ok) {
      const code = (await res.json().catch(() => ({}))).error as string | undefined;
      setFormError(code === "rate_limited" ? W.errors.rate_limited : code === "captcha" ? W.errors.captcha : code === "validation" ? W.errors.generic : W.errors.server);
      return;
    }
    try { localStorage.removeItem(draftKey); } catch {}
    if (mode === "edit") {
      router.push(`/${locale}/dashboard/${ideaId}`);
      router.refresh();
      return;
    }
    setReceipt(await res.json());
    topRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  if (receipt) {
    return (
      <Card>
        <div ref={topRef} />
        <h1 className="text-2xl font-bold text-accent">✓ {t.confirm.title}</h1>
        <dl className="mt-5 space-y-3">
          <div><dt className="text-sm text-ink-soft">{t.confirm.idLabel}</dt><dd className="ltr text-2xl font-bold tracking-wider text-brand">{receipt.publicCode}</dd></div>
          <div><dt className="text-sm text-ink-soft">{t.confirm.timeLabel}</dt><dd className="ltr">{new Date(receipt.submittedAt).toLocaleString(locale === "ur" ? "ur-PK" : "en-PK", { timeZone: "Asia/Karachi" })} (PKT)</dd></div>
          <div><dt className="text-sm text-ink-soft">{t.confirm.hashLabel}</dt><dd className="ltr break-all font-mono text-xs">{receipt.hash}</dd></div>
        </dl>
        <p className="mt-5 text-ink-soft">{t.confirm.body}</p>
        <ButtonLink href={`/${locale}/dashboard`} className="mt-6 w-full sm:w-auto">{t.confirm.toDashboard}</ButtonLink>
      </Card>
    );
  }

  const c = state.content;
  const k = state.contact;
  const L = LIMITS;
  const tf = (key: keyof typeof L & keyof Content & keyof typeof F, opts: { multiline?: boolean } = {}) => (
    <TextField
      id={key}
      text={F[key] as { label: string; help: string; example: string }}
      value={c[key] as string}
      onChange={(v) => setC(key, v as never)}
      min={L[key][0]}
      max={L[key][1]}
      error={err(key)}
      multiline={opts.multiline ?? true}
    />
  );
  const pct = Math.round(((step + 1) / total) * 100);

  return (
    <div className="space-y-5">
      <div ref={topRef} className="scroll-mt-24" />
      {restorable ? (
        <Notice tone="brand">
          <p>{W.restore}</p>
          <div className="mt-3 flex gap-2">
            <Button onClick={() => { setState(restorable); setRestorable(null); }}>{W.restoreYes}</Button>
            <Button variant="secondary" onClick={() => { try { localStorage.removeItem(draftKey); } catch {} setRestorable(null); }}>{W.restoreNo}</Button>
          </div>
        </Notice>
      ) : null}

      <div>
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-semibold text-brand">{fmt(W.stepOf, { n: step + 1, total })} · {W.steps[step]}</span>
          {savedAt ? <span className="text-ink-soft">✓ {W.saved}</span> : null}
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <Card className="space-y-7">
        {step === 0 && (
          <>
            {tf("title", { multiline: false })}
            {tf("description")}
            <ChoiceField id="kind" text={F.kind} options={KINDS} labels={O.kind} value={c.kind ? [c.kind] : []} onChange={(v) => setC("kind", v[0])} error={err("kind")} />
            <ChoiceField id="sector" text={F.sector} options={SECTORS} labels={O.sector} value={c.sector ? [c.sector] : []} onChange={(v) => setC("sector", v[0])} error={err("sector")} />
            <ChoiceField id="stage" text={F.stage} options={STAGES} labels={O.stage} value={c.stage ? [c.stage] : []} onChange={(v) => setC("stage", v[0])} error={err("stage")} />
          </>
        )}

        {step === 1 && (<>{tf("problem")}{tf("targetMarket")}{tf("evidence")}</>)}

        {step === 2 && (
          <>
            <FieldShell id="competitors" text={F.competitors} error={err("competitors")}>
              <div className="space-y-3">
                {c.competitors.map((comp, i) => (
                  <div key={i} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-3">
                    {(["name", "link", "location"] as const).map((f) => {
                      const lbl = f === "name" ? F.competitorName : f === "link" ? F.competitorLink : F.competitorLocation;
                      const max = f === "name" ? L.competitorName[1] : f === "link" ? L.competitorLink[1] : L.competitorLocation[1];
                      return (
                        <label key={f} className="block text-sm">
                          <span className="mb-1 block font-medium">{lbl.label}</span>
                          <input
                            className={`min-h-11 w-full rounded-lg border px-3 ${f === "link" ? "ltr" : ""} ${errors[`competitors.${i}.${f}`] ? "border-danger" : "border-line"}`}
                            value={comp[f]}
                            maxLength={max}
                            inputMode={f === "link" ? "url" : undefined}
                            onChange={(e) => setC("competitors", c.competitors.map((x, j) => (j === i ? { ...x, [f]: e.target.value } : x)))}
                          />
                        </label>
                      );
                    })}
                    <button type="button" className="text-start text-sm font-medium text-danger sm:col-span-3" onClick={() => setC("competitors", c.competitors.filter((_, j) => j !== i))}>
                      {F.remove}
                    </button>
                  </div>
                ))}
                {c.competitors.length < 8 && !c.noCompetitorsKnown ? (
                  <Button type="button" variant="secondary" onClick={() => setC("competitors", [...c.competitors, { name: "", link: "", location: "" }])}>
                    + {F.addCompetitor}
                  </Button>
                ) : null}
              </div>
            </FieldShell>
            <CheckboxField id="noCompetitorsKnown" label={F.noCompetitorsKnown.label} checked={c.noCompetitorsKnown} onChange={(v) => setC("noCompetitorsKnown", v)} />
            {tf("differentiation")}{tf("whyBetter")}{tf("disruption")}
          </>
        )}

        {step === 3 && (
          <>
            <ChoiceField id="revenueModels" multiple text={F.revenueModels} options={REVENUE_MODELS} labels={O.revenueModels} value={c.revenueModels} onChange={(v) => setC("revenueModels", v)} error={err("revenueModels")} />
            {tf("revenueExplanation")}
            <ChoiceField id="startCost" text={F.startCost} options={COST_RANGES} labels={O.cost} value={c.startCost ? [c.startCost] : []} onChange={(v) => setC("startCost", v[0])} error={err("startCost")} />
            <ChoiceField id="fundingNeeded" text={F.fundingNeeded} options={FUNDING_RANGES} labels={O.cost} value={c.fundingNeeded ? [c.fundingNeeded] : []} onChange={(v) => setC("fundingNeeded", v[0])} error={err("fundingNeeded")} />
            {tf("fundingUse")}{tf("requirements")}{tf("hardestPart")}
          </>
        )}

        {step === 4 && (
          <>
            {tf("positioning", { multiline: false })}
            {tf("first100")}
            <ChoiceField id="timeline" text={F.timeline} options={TIMELINES} labels={O.timeline} value={c.timeline ? [c.timeline] : []} onChange={(v) => setC("timeline", v[0])} error={err("timeline")} />
            {tf("timelineReasoning")}
            {tf("founderStrength")}

            <FieldShell id="uploads" text={F.uploads}>
              {loggedIn ? (
                <div className="space-y-2">
                  <ul className="space-y-1">
                    {state.files.map((f) => (
                      <li key={f.id} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                        <span className="ltr truncate">{f.name}</span>
                        <span className={f.status === "error" ? "text-danger" : "text-ink-soft"}>
                          {f.status === "uploading" ? F.uploading : f.status === "error" ? F.uploadFailed : t.dashboard.fileStatus[f.status]}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {existingFiles + state.files.length < UPLOAD.maxFiles ? (
                    <label className="inline-flex min-h-12 cursor-pointer items-center rounded-xl border border-dashed border-brand px-5 font-semibold text-brand hover:bg-accent-soft">
                      + {F.uploadButton}
                      <input type="file" className="sr-only" multiple accept={Object.keys(UPLOAD.types).join(",")} onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
                    </label>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-ink-soft">{W.loginToSubmit}</p>
              )}
            </FieldShell>

            {mode === "create" && (
              <div className="space-y-6 border-t border-line pt-6">
                <TextField id="name" text={F.name} value={k.name} onChange={(v) => setK("name", v)} min={L.name[0]} max={L.name[1]} error={err("name")} multiline={false} voice={false} />
                <ChoiceField id="city" text={F.city} options={CITIES} labels={O.city} value={k.city ? [k.city] : []} onChange={(v) => setK("city", v[0])} error={err("city")} />
                {k.city === "other" ? <TextField id="cityOther" text={F.cityOther} value={k.cityOther} onChange={(v) => setK("cityOther", v)} min={0} max={L.cityOther[1]} multiline={false} voice={false} /> : null}
                <TextField id="phone" text={F.phone} value={k.phone} onChange={(v) => setK("phone", v)} min={0} max={20} error={err("phone")} multiline={false} voice={false} dirLtr type="tel" />
                <TextField id="email" text={F.email} value={k.email} onChange={(v) => setK("email", v)} min={0} max={L.email[1]} error={err("email")} multiline={false} voice={false} dirLtr type="email" />
                <CheckboxField id="consentTerms" label={F.consentTerms.label} checked={k.consentTerms} onChange={(v) => setK("consentTerms", v)} error={err("consentTerms")} />
                <CheckboxField id="consentBlind" label={F.consentBlind.label} checked={k.consentBlind} onChange={(v) => setK("consentBlind", v)} error={err("consentBlind")} />
                <Turnstile action="submit" onToken={onToken} />
              </div>
            )}
          </>
        )}
      </Card>

      {formError ? <p role="alert" className="rounded-xl bg-danger-soft p-3 font-medium text-danger">{formError}</p> : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        {step > 0 ? <Button variant="secondary" onClick={() => go(step - 1)}>{W.back}</Button> : <span />}
        {step < total - 1 ? (
          <Button onClick={() => validate() && go(step + 1)}>{W.next}</Button>
        ) : loggedIn === false ? (
          <ButtonLink href={`/${locale}/login?next=${encodeURIComponent(`/${locale}/submit`)}`}>{t.nav.login}</ButtonLink>
        ) : (
          <Button
            variant="accent"
            onClick={submit}
            disabled={busy || loggedIn === null || state.files.some((f) => f.status === "uploading") || (mode === "create" && !!TURNSTILE_SITE_KEY && !captcha)}
          >
            {busy ? W.submitting : W.submit}
          </Button>
        )}
      </div>
      {step === total - 1 && loggedIn === false ? <p className="text-center text-sm text-ink-soft">{W.loginToSubmit}</p> : null}
      <p className="text-center text-xs text-ink-soft">{W.voiceNote}</p>
    </div>
  );
}
