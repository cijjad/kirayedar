"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { fmt } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";

type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getRecognition(): (new () => SpeechRec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noopSubscribe = () => () => {};

/** Voice-to-text via the browser's Web Speech API. Appends final results. */
export function VoiceButton({ onText }: { onText: (text: string) => void }) {
  const { t, locale } = useI18n();
  const W = t.wizard;
  const supported = useSyncExternalStore(noopSubscribe, () => getRecognition() !== null, () => false);
  const [listening, setListening] = useState(false);
  const [lang, setLang] = useState<"ur-PK" | "en-PK">(locale === "ur" ? "ur-PK" : "en-PK");
  const rec = useRef<SpeechRec | null>(null);

  useEffect(() => () => rec.current?.stop(), []);
  if (!supported) return null;

  const toggle = () => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const Rec = getRecognition();
    if (!Rec) return;
    const r = new Rec();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) text += e.results[i][0].transcript;
      if (text.trim()) onText(text.trim());
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  };

  return (
    <div className="flex items-center gap-1">
      <select
        aria-label="Voice language"
        className="min-h-10 rounded-lg border border-line bg-surface px-2 text-sm"
        value={lang}
        onChange={(e) => setLang(e.target.value as typeof lang)}
        disabled={listening}
      >
        <option value="ur-PK">{W.speakLangUr}</option>
        <option value="en-PK">{W.speakLangEn}</option>
      </select>
      <button
        type="button"
        onClick={toggle}
        title={W.voiceNote}
        aria-pressed={listening}
        className={`inline-flex min-h-10 items-center gap-1 rounded-lg border px-3 text-sm font-semibold ${
          listening ? "animate-pulse border-danger bg-danger-soft text-danger" : "border-line text-brand hover:bg-accent-soft"
        }`}
      >
        <span aria-hidden>🎙</span> {listening ? W.stopSpeaking : W.speak}
      </button>
    </div>
  );
}

type FieldText = { label: string; help?: string; example?: string };

export function FieldShell({
  id,
  text,
  error,
  children,
  aside,
}: {
  id: string;
  text: FieldText;
  error?: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <label htmlFor={id} className="text-base font-semibold">
          {text.label}
        </label>
        {aside}
      </div>
      {text.help ? <p id={`${id}-help`} className="text-sm text-ink-soft">{text.help}</p> : null}
      {children}
      {text.example ? (
        <p className="text-sm text-ink-soft">
          <span className="font-medium">{t.wizard.example}:</span> <span className="italic">{text.example}</span>
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-err`} role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border bg-surface px-4 py-3 text-base outline-none focus:border-brand aria-[invalid=true]:border-danger";

export function TextField({
  id,
  text,
  value,
  onChange,
  min,
  max,
  error,
  multiline = true,
  voice = true,
  dirLtr = false,
  type = "text",
}: {
  id: string;
  text: FieldText;
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  error?: string;
  multiline?: boolean;
  voice?: boolean;
  dirLtr?: boolean;
  type?: string;
}) {
  const { t } = useI18n();
  const len = value.length;
  const counter = (
    <span className={`ltr text-sm tabular-nums ${len > max ? "text-danger" : "text-ink-soft"}`}>
      {fmt(t.wizard.chars, { n: len, max })}
      {min > 0 && len < min ? ` · ${fmt(t.wizard.minChars, { min })}` : ""}
    </span>
  );
  const common = {
    id,
    value,
    "aria-invalid": !!error,
    "aria-describedby": `${id}-help${error ? ` ${id}-err` : ""}`,
    className: `${inputCls} ${dirLtr ? "ltr" : ""} ${error ? "border-danger" : "border-line"}`,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value.slice(0, max + 50)),
  };
  return (
    <FieldShell
      id={id}
      text={text}
      error={error}
      aside={
        <span className="flex items-center gap-2">
          {voice ? <VoiceButton onText={(s) => onChange(`${value}${value && !value.endsWith(" ") ? " " : ""}${s}`.slice(0, max))} /> : null}
          {counter}
        </span>
      }
    >
      {multiline ? <textarea rows={max > 300 ? 5 : 3} {...common} /> : <input type={type} {...common} />}
    </FieldShell>
  );
}

/** Large tappable options (radio or checkbox semantics). */
export function ChoiceField<T extends string>({
  id,
  text,
  options,
  labels,
  value,
  onChange,
  error,
  multiple = false,
}: {
  id: string;
  text: FieldText;
  options: readonly T[];
  labels: Record<string, string>;
  value: T[];
  onChange: (v: T[]) => void;
  error?: string;
  multiple?: boolean;
}) {
  return (
    <fieldset aria-describedby={`${id}-help`} className="space-y-1.5">
      <FieldShell id={id} text={text} error={error}>
        <div id={id} role={multiple ? "group" : "radiogroup"} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {options.map((o) => {
            const checked = value.includes(o);
            return (
              <label
                key={o}
                className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 py-2 ${
                  checked ? "border-brand bg-brand/5 font-semibold text-brand" : "border-line bg-surface"
                }`}
              >
                <input
                  type={multiple ? "checkbox" : "radio"}
                  name={id}
                  className="h-5 w-5 accent-[var(--brand)]"
                  checked={checked}
                  onChange={() => onChange(multiple ? (checked ? value.filter((v) => v !== o) : [...value, o]) : [o])}
                />
                {labels[o]}
              </label>
            );
          })}
        </div>
      </FieldShell>
    </fieldset>
  );
}

export function CheckboxField({ id, label, checked, onChange, error }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void; error?: string }) {
  return (
    <div>
      <label htmlFor={id} className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface p-3">
        <input id={id} type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[var(--brand)]" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-invalid={!!error} />
        <span>{label}</span>
      </label>
      {error ? <p role="alert" className="mt-1 text-sm font-medium text-danger">{error}</p> : null}
    </div>
  );
}
