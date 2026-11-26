import Link from "next/link";
import { Suspense } from "react";
import { Badge, ButtonLink, Card, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getDict, href, isLocale, type Locale } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

async function Ideas({ lang }: { lang: Locale }) {
  await requireUser(href(lang, "/dashboard"));
  const t = getDict(lang);
  const supabase = await createClient(); // RLS: returns only this founder's rows
  const { data: ideas } = await supabase
    .from("ideas")
    .select("id, public_code, title, status, submitted_at, ai_score")
    .order("submitted_at", { ascending: false });
  if (!ideas?.length) {
    return (
      <Card>
        <p className="mb-4 text-ink-soft">{t.dashboard.empty}</p>
        <ButtonLink href={href(lang, "/submit")}>{t.dashboard.newIdea}</ButtonLink>
      </Card>
    );
  }
  return (
    <ul className="space-y-3">
      {ideas.map((i) => (
        <li key={i.id}>
          <Link href={href(lang, `/dashboard/${i.id}`)} className="block rounded-2xl border border-line bg-surface p-4 hover:border-brand">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-lg font-semibold">{i.title}</span>
              <Badge tone={i.status === "approved" ? "good" : i.status === "rejected" ? "bad" : i.status === "changes_requested" ? "warn" : "brand"}>
                {t.dashboard.status[i.status as keyof typeof t.dashboard.status]}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-ink-soft">
              <span className="ltr">{i.public_code}</span> · {new Date(i.submitted_at).toLocaleDateString(lang === "ur" ? "ur-PK" : "en-PK")}
              {i.ai_score != null ? <> · <span className="ltr">{Number(i.ai_score).toFixed(1)}/10</span></> : null}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function Dashboard({ params }: PageProps<"/[lang]/dashboard">) {
  const { lang: raw } = await params;
  const lang = isLocale(raw) ? raw : "en";
  const t = getDict(lang);
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageTitle>{t.dashboard.title}</PageTitle>
        <ButtonLink href={href(lang, "/submit")} variant="accent">{t.dashboard.newIdea}</ButtonLink>
      </div>
      <Suspense fallback={<p className="text-ink-soft">{t.common.loading}</p>}>
        <Ideas lang={lang} />
      </Suspense>
    </div>
  );
}
