import Link from "next/link";
import { Suspense } from "react";
import { Loading } from "@/components/Loading";
import { Badge, ButtonLink, PageTitle } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { getDict, href, isLocale, type Locale } from "@/lib/i18n";
import { isStuckAnalysis as stuck } from "@/lib/ideas/status";
import { createClient } from "@/lib/supabase/server";

const PENDING = ["submitted", "analysing", "analysed", "analysis_failed", "under_review"];

async function Queue({ params, searchParams }: { params: PageProps<"/[lang]/admin">["params"]; searchParams: PageProps<"/[lang]/admin">["searchParams"] }) {
  const { lang: raw } = await params;
  const lang: Locale = isLocale(raw) ? raw : "en";
  await requireAdmin();
  const t = getDict(lang);
  const A = t.admin;
  const all = (await searchParams).filter === "all";
  const supabase = await createClient(); // RLS: is_admin()
  let q = supabase
    .from("ideas")
    .select("id, public_code, title, sector, city, status, ai_score, admin_score, ai_flags, submitted_at, updated_at")
    .order("ai_score", { ascending: false, nullsFirst: false })
    .order("submitted_at", { ascending: true })
    .limit(200);
  if (!all) q = q.in("status", PENDING);
  const { data: ideas } = await q;

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <ButtonLink href={href(lang, "/admin")} variant={all ? "secondary" : "primary"}>{A.filter.pending}</ButtonLink>
        <ButtonLink href={href(lang, "/admin?filter=all")} variant={all ? "primary" : "secondary"}>{A.filter.all}</ButtonLink>
        <ButtonLink href={href(lang, "/admin/analytics")} variant="ghost">{A.analytics}</ButtonLink>
      </div>
      {!ideas?.length ? (
        <p className="text-ink-soft">{A.queueEmpty}</p>
      ) : (
        <ul className="space-y-2">
          {ideas.map((i) => (
            <li key={i.id}>
              <Link href={href(lang, `/admin/${i.id}`)} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4 hover:border-brand">
                <div className="min-w-0">
                  <p className="font-semibold">{i.title}</p>
                  <p className="text-sm text-ink-soft"><span className="ltr">{i.public_code}</span> · {t.wizard.options.sector[i.sector as keyof typeof t.wizard.options.sector] ?? i.sector} · {i.city}</p>
                  {i.ai_flags?.length ? <div className="mt-1 flex flex-wrap gap-1">{i.ai_flags.map((f: string) => <Badge key={f} tone="warn">{t.report.flags[f as keyof typeof t.report.flags] ?? f}</Badge>)}</div> : null}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={stuck(i.status, i.updated_at) || i.status === "analysis_failed" ? "bad" : "brand"}>{t.dashboard.status[i.status as keyof typeof t.dashboard.status]}{stuck(i.status, i.updated_at) ? " ⚠" : ""}</Badge>
                  <span className="ltr text-xl font-bold text-brand">{i.admin_score != null ? `${Number(i.admin_score).toFixed(1)}*` : i.ai_score != null ? Number(i.ai_score).toFixed(1) : "—"}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function AdminPage(props: PageProps<"/[lang]/admin">) {
  return (
    <div>
      <PageTitle>Review queue</PageTitle>
      <Suspense fallback={<Loading />}>
        <Queue params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
