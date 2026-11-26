import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Loading } from "@/components/Loading";
import { AnalysisReport } from "@/components/AnalysisReport";
import { DeleteIdea } from "@/components/DeleteIdea";
import { StatusTracker } from "@/components/StatusTracker";
import { Badge, ButtonLink, Card, Notice, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getDict, href, isLocale, type Locale } from "@/lib/i18n";
import { loadIdeaForViewer } from "@/lib/ideas/queries";

async function Detail({ params }: { params: Promise<{ lang: string; id: string }> }) {
  const { id, lang: raw } = await params;
  const lang: Locale = isLocale(raw) ? raw : "en";
  const user = await requireUser(href(lang, `/dashboard/${id}`));
  const t = getDict(lang);
  const D = t.dashboard;
  const data = await loadIdeaForViewer(id);
  if (!data || data.idea.founder_id !== user.id) notFound();
  const { idea, analysis, files } = data;
  const pending = ["submitted", "analysing"].includes(idea.status);

  return (
    <div className="space-y-5">
      <PageTitle sub={<><span>{D.ideaId}: </span><span className="ltr font-semibold">{idea.public_code}</span> · {D.version} {idea.version} · {D.submittedOn} <span className="ltr">{new Date(idea.submitted_at).toLocaleString(lang === "ur" ? "ur-PK" : "en-PK", { timeZone: "Asia/Karachi" })}</span></>}>
        {idea.title}
      </PageTitle>

      <Card>
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="font-semibold text-brand">{D.statusTitle}</h2>
          <Badge tone="brand">{D.status[idea.status as keyof typeof D.status]}</Badge>
        </div>
        <StatusTracker status={idea.status} t={t} />
      </Card>

      {idea.founder_feedback ? (
        <Notice tone="warn"><p className="font-semibold">{D.feedbackTitle}</p><p className="mt-1 whitespace-pre-line">{idea.founder_feedback}</p></Notice>
      ) : null}

      {analysis ? <AnalysisReport a={analysis} t={t} /> : pending ? <Notice tone="brand">{D.analysisPending}</Notice> : idea.status === "analysis_failed" ? <Notice tone="warn">{D.analysisFailed}</Notice> : null}

      {files.length ? (
        <Card>
          <h2 className="mb-3 font-semibold text-brand">{D.files}</h2>
          <ul className="space-y-2">
            {files.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 text-sm">
                {f.scan_status === "infected" ? <span className="ltr truncate">{f.original_name}</span> : <a className="ltr truncate text-brand underline" href={`/api/files/${f.id}`}>{f.original_name}</a>}
                <Badge tone={f.scan_status === "infected" ? "bad" : "neutral"}>{D.fileStatus[f.scan_status as keyof typeof D.fileStatus]}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {idea.status !== "analysing" ? <ButtonLink href={href(lang, `/dashboard/${idea.id}/edit`)} variant="secondary">{D.edit}</ButtonLink> : null}
          <p className="mt-2 text-sm text-ink-soft">{D.editNote}</p>
        </div>
        <DeleteIdea ideaId={idea.id} />
      </Card>
    </div>
  );
}

export default function Page({ params }: PageProps<"/[lang]/dashboard/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Detail params={params} />
    </Suspense>
  );
}
