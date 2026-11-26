import { Suspense } from "react";
import { Loading } from "@/components/Loading";
import { Card, PageTitle } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { getDict, isLocale, type Locale } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

function Bars({ title, rows }: { title: string; rows: [string, number][] }) {
  const max = Math.max(1, ...rows.map(([, n]) => n));
  return (
    <Card>
      <h2 className="mb-4 font-semibold text-brand">{title}</h2>
      <ul className="space-y-2">
        {rows.map(([k, n]) => (
          <li key={k} className="grid grid-cols-[8rem_1fr_3rem] items-center gap-2 text-sm">
            <span className="truncate">{k}</span>
            <span className="h-3 rounded-full bg-line"><span className="block h-3 rounded-full bg-accent" style={{ width: `${(n / max) * 100}%` }} /></span>
            <span className="ltr text-end tabular-nums">{n}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function count(values: (string | null)[]): [string, number][] {
  const m = new Map<string, number>();
  for (const v of values) m.set(v ?? "—", (m.get(v ?? "—") ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

async function Stats({ params }: { params: PageProps<"/[lang]/admin/analytics">["params"] }) {
  const { lang: raw } = await params;
  const lang: Locale = isLocale(raw) ? raw : "en";
  await requireAdmin();
  const t = getDict(lang);
  const supabase = await createClient();
  // Aggregates only — no submission content is loaded here.
  const { data } = await supabase.from("ideas").select("sector, city, status").limit(10000);
  const rows = data ?? [];
  const approved = rows.filter((r) => ["approved", "interest_received"].includes(r.status)).length;
  const interest = rows.filter((r) => r.status === "interest_received").length;
  const sectorLabels = t.wizard.options.sector as Record<string, string>;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><p className="text-sm text-ink-soft">{t.admin.total}</p><p className="ltr text-3xl font-bold">{rows.length}</p></Card>
        <Card><p className="text-sm text-ink-soft">{t.admin.approvedRate}</p><p className="ltr text-3xl font-bold">{approved} ({rows.length ? Math.round((approved / rows.length) * 100) : 0}%)</p></Card>
        <Card><p className="text-sm text-ink-soft">{t.dashboard.status.interest_received}</p><p className="ltr text-3xl font-bold">{interest} ({approved ? Math.round((interest / approved) * 100) : 0}%)</p></Card>
      </div>
      <Bars title={t.admin.bySector} rows={count(rows.map((r) => sectorLabels[r.sector] ?? r.sector))} />
      <Bars title={t.admin.byCity} rows={count(rows.map((r) => r.city))} />
      <Bars title={t.admin.byStatus} rows={count(rows.map((r) => t.dashboard.status[r.status as keyof typeof t.dashboard.status] ?? r.status))} />
    </div>
  );
}

export default function Page({ params }: PageProps<"/[lang]/admin/analytics">) {
  return (
    <div>
      <PageTitle>Analytics</PageTitle>
      <Suspense fallback={<Loading />}>
        <Stats params={params} />
      </Suspense>
    </div>
  );
}
