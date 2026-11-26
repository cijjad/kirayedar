import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AnalysisReport } from "@/components/AnalysisReport";
import { Loading } from "@/components/Loading";
import { Badge, Card, PageTitle } from "@/components/ui";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { getDict, isLocale, type Locale } from "@/lib/i18n";
import { loadIdeaForViewer } from "@/lib/ideas/queries";
import { clientIp, hashIp } from "@/lib/security/request";
import { createClient } from "@/lib/supabase/server";
import { AdminActions, ContactReveal } from "../AdminActions";

// Admin actions can trigger a re-analysis via after().
export const maxDuration = 300;

async function Review({ params }: { params: PageProps<"/[lang]/admin/[id]">["params"] }) {
  const { lang: raw, id } = await params;
  const lang: Locale = isLocale(raw) ? raw : "en";
  const admin = await requireAdmin();
  const t = getDict(lang);
  const A = t.admin;
  const data = await loadIdeaForViewer(id);
  if (!data) notFound();
  const { idea, analysis, files } = data;
  await audit({ actorId: admin.id, action: "idea_view", entity: "idea", entityId: id, ipHash: hashIp(await clientIp()) });

  const supabase = await createClient();
  const [{ data: notes }, { data: reviews }, { data: log }] = await Promise.all([
    supabase.from("ideas").select("admin_note").eq("id", id).single(),
    supabase.from("admin_reviews").select("action, note, score_override, created_at, admin_id").eq("idea_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("audit_log").select("action, actor_id, created_at, meta").eq("entity_id", id).order("created_at", { ascending: false }).limit(100),
  ]);
  const content = idea.content as Record<string, unknown>;

  return (
    <div className="space-y-5">
      <PageTitle sub={<><span className="ltr">{idea.public_code}</span> · v{idea.version} · {t.dashboard.status[idea.status as keyof typeof t.dashboard.status]}</>}>{idea.title}</PageTitle>
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          {analysis ? <AnalysisReport a={analysis} t={t} admin /> : <Card><p className="text-ink-soft">—</p></Card>}
          <Card>
            <h2 className="mb-3 font-semibold text-brand">Submission</h2>
            <dl className="space-y-3">
              {Object.entries(content).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-sm font-semibold text-ink-soft">{k}</dt>
                  <dd className="whitespace-pre-line">{Array.isArray(v) ? v.map((x) => (typeof x === "object" && x ? Object.values(x).filter(Boolean).join(" — ") : String(x))).join("\n") : String(v)}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <h2 className="mb-3 font-semibold text-brand">{A.actions}</h2>
            {idea.admin_score != null ? <p className="mb-2 text-sm">Admin score: <span className="ltr font-bold">{Number(idea.admin_score).toFixed(1)}</span></p> : null}
            {notes?.admin_note ? <p className="mb-3 rounded-lg bg-bg p-2 text-sm">{notes.admin_note}</p> : null}
            <AdminActions ideaId={idea.id} />
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold text-brand">{A.contact}</h2>
            <ContactReveal ideaId={idea.id} />
          </Card>
          {files.length ? (
            <Card>
              <h2 className="mb-3 font-semibold text-brand">{t.dashboard.files}</h2>
              <ul className="space-y-2 text-sm">
                {files.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2">
                    <span className="ltr truncate">{f.original_name}</span>
                    {f.scan_status === "clean" ? <a className="text-brand underline" href={`/api/files/${f.id}`}>{A.filesDownload}</a> : <Badge tone="warn">{A.fileNotScanned}</Badge>}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          <Card>
            <h2 className="mb-3 font-semibold text-brand">{A.history}</h2>
            <ul className="space-y-2 text-sm">
              {(reviews ?? []).map((r, i) => (
                <li key={i}><Badge>{r.action}</Badge> <span className="ltr text-ink-soft">{new Date(r.created_at).toISOString().slice(0, 16).replace("T", " ")}</span>{r.note ? <p className="mt-1">{r.note}</p> : null}</li>
              ))}
            </ul>
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold text-brand">{A.accessLog}</h2>
            <ul className="ltr space-y-1 font-mono text-xs">
              {(log ?? []).map((l, i) => (
                <li key={i}>{new Date(l.created_at).toISOString().slice(0, 19).replace("T", " ")} {l.action} {l.actor_id?.slice(0, 8) ?? "system"}</li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function Page({ params }: PageProps<"/[lang]/admin/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Review params={params} />
    </Suspense>
  );
}
