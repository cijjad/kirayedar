import { ButtonLink, Card } from "@/components/ui";
import { getDict, href, isLocale } from "@/lib/i18n";

export default async function Landing({ params }: PageProps<"/[lang]">) {
  const { lang: raw } = await params;
  const lang = isLocale(raw) ? raw : "en";
  const t = getDict(lang).landing;
  return (
    <div className="space-y-14">
      <section className="rounded-3xl bg-brand px-5 py-12 text-center text-brand-ink sm:px-10 sm:py-16">
        <p className="mb-3 text-sm font-medium uppercase tracking-wide text-white/70">{t.cities}</p>
        <h1 className="mx-auto max-w-2xl text-3xl font-bold leading-tight sm:text-5xl sm:leading-tight">{t.heroTitle}</h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-white/85">{t.heroBody}</p>
        <ButtonLink href={href(lang, "/submit")} variant="accent" className="mt-8 min-h-16 w-full px-10 text-xl sm:w-auto">
          {t.heroCta}
        </ButtonLink>
        <p className="mt-4 text-sm text-white/70">{t.heroNote}</p>
      </section>

      <section aria-labelledby="how">
        <h2 id="how" className="mb-6 text-2xl font-bold text-brand">{t.howTitle}</h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {t.how.map((s, i) => (
            <li key={s.t}>
              <Card className="h-full">
                <span className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft font-bold text-accent">{i + 1}</span>
                <h3 className="text-lg font-semibold">{s.t}</h3>
                <p className="mt-1 text-ink-soft">{s.d}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="trust">
        <h2 id="trust" className="mb-6 text-2xl font-bold text-brand">{t.trustTitle}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {t.trust.map((s) => (
            <Card key={s.t}>
              <h3 className="text-lg font-semibold">{s.t}</h3>
              <p className="mt-1 text-ink-soft">{s.d}</p>
            </Card>
          ))}
        </div>
        <p className="mt-4 rounded-xl border border-warn/30 bg-warn-soft p-4 text-sm text-warn">{t.trustNote}</p>
      </section>

      <Card className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-brand">{t.investorTitle}</h2>
          <p className="mt-1 text-ink-soft">{t.investorBody}</p>
        </div>
        <ButtonLink href={href(lang, "/investors")} variant="secondary">{t.investorCta}</ButtonLink>
      </Card>
    </div>
  );
}
