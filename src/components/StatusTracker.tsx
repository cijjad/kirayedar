import type { Dict } from "@/lib/i18n";

const ORDER: Record<string, number> = {
  submitted: 0, analysing: 0, analysis_failed: 0, analysed: 1, under_review: 2, changes_requested: 2, rejected: 2, approved: 3, interest_received: 4,
};

export function StatusTracker({ status, t }: { status: string; t: Dict }) {
  const at = ORDER[status] ?? 0;
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label={t.dashboard.statusTitle}>
      {t.dashboard.tracker.map((label, i) => (
        <li key={label} className="text-center" aria-current={i === at ? "step" : undefined}>
          <div className={`mx-auto mb-1 h-2 rounded-full ${i <= at ? "bg-accent" : "bg-line"}`} />
          <span className={`text-xs leading-tight ${i === at ? "font-bold text-brand" : "text-ink-soft"}`}>{label}</span>
        </li>
      ))}
    </ol>
  );
}
