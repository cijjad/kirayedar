import { Badge, Card } from "@/components/ui";
import type { Dict } from "@/lib/i18n";
import { DIMENSIONS, type StoredAnalysis } from "@/lib/ai/schema";

function scoreTone(s: number) {
  return s >= 7.5 ? "good" : s >= 6 ? "brand" : s >= 4 ? "warn" : "bad";
}

function List({ title, items, tone = "neutral" }: { title: string; items: string[]; tone?: "neutral" | "bad" }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className={`mb-2 font-semibold ${tone === "bad" ? "text-danger" : "text-brand"}`}>{title}</h3>
      <ul className="list-disc space-y-1 ps-5">
        {items.map((x, i) => <li key={i}>{x}</li>)}
      </ul>
    </div>
  );
}

/**
 * Renders a stored analysis. AI text is rendered as plain text (React escapes
 * it); source URLs are only those that passed server-side evidence checks.
 */
export function AnalysisReport({ a, t, admin = false }: { a: StoredAnalysis; t: Dict; admin?: boolean }) {
  const R = t.report;
  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <div className={`ltr flex h-20 w-20 items-center justify-center rounded-2xl text-3xl font-bold ${scoreTone(a.overall_score) === "good" ? "bg-accent-soft text-accent" : scoreTone(a.overall_score) === "bad" ? "bg-danger-soft text-danger" : scoreTone(a.overall_score) === "warn" ? "bg-warn-soft text-warn" : "bg-brand/10 text-brand"}`}>
            {a.overall_score.toFixed(1)}
          </div>
          <div>
            <p className="text-sm text-ink-soft">{R.overall} / 10</p>
            <p className="text-xl font-bold">{R.verdict[a.verdict]}</p>
            {a.flags.length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {a.flags.map((f) => <Badge key={f} tone="warn">{R.flags[f]}</Badge>)}
              </div>
            ) : null}
          </div>
        </div>
        <p className="mt-4">{a.summary}</p>
        <p className="mt-3 text-sm text-ink-soft">{R.disclaimer}</p>
      </Card>

      <Card className="space-y-5">
        <List title={R.whatToFix} items={a.what_to_fix} />
        <div className="grid gap-5 sm:grid-cols-2">
          <List title={R.strengths} items={a.strengths} />
          <List title={R.risks} items={a.risks} />
        </div>
        <List title={R.redFlags} items={a.red_flags} tone="bad" />
        <List title={R.missing} items={a.missing_information} />
        <List title={R.regulatory} items={a.regulatory_checks} />
      </Card>

      <div className="space-y-3">
        {DIMENSIONS.map((d) => {
          const dim = a.dimensions[d.key];
          return (
            <details key={d.key} className="group rounded-2xl border border-line bg-surface p-4" open={admin}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <span className="font-semibold">{R.dims[d.key]} <span className="ltr text-sm font-normal text-ink-soft">({Math.round(d.weight * 100)}% {R.weight})</span></span>
                <Badge tone={scoreTone(dim.score)}><span className="ltr">{dim.score}/10</span></Badge>
              </summary>
              <div className="mt-3 space-y-2">
                <p>{dim.reasoning}</p>
                <p className="text-sm text-ink-soft">{R.confidence[dim.confidence]}</p>
                {dim.claims.length ? (
                  <ul className="space-y-1 text-sm">
                    {dim.claims.map((c, i) => (
                      <li key={i} className="flex flex-wrap items-start gap-2">
                        <Badge tone={c.evidence_type === "SOURCED" ? "good" : c.evidence_type === "FOUNDER_CLAIM" ? "brand" : "neutral"}>{R.evidence[c.evidence_type]}</Badge>
                        <span className="flex-1">{c.claim}</span>
                        {c.source_url ? <a className="ltr break-all text-brand underline" href={c.source_url} rel="noopener noreferrer nofollow" target="_blank">{new URL(c.source_url).hostname}</a> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
