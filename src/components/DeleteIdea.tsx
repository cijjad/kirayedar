"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";

export function DeleteIdea({ ideaId }: { ideaId: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  if (!open) return <Button variant="ghost" className="text-danger" onClick={() => setOpen(true)}>{t.dashboard.delete}</Button>;
  return (
    <div className="space-y-3 rounded-xl border border-danger/40 bg-danger-soft p-4">
      <p className="text-danger">{t.dashboard.deleteConfirm}</p>
      <input className="ltr min-h-12 w-full rounded-xl border border-line px-4" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="DELETE" />
      <div className="flex gap-2">
        <Button
          variant="danger"
          disabled={typed !== "DELETE" || busy}
          onClick={async () => {
            setBusy(true);
            const res = await fetch(`/api/ideas/${ideaId}`, { method: "DELETE" });
            setBusy(false);
            if (!res.ok) return setError(true);
            router.replace(`/${locale}/dashboard`);
            router.refresh();
          }}
        >
          {t.dashboard.delete}
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>{t.common.cancel}</Button>
      </div>
      {error ? <p role="alert" className="text-danger">{t.common.error}</p> : null}
    </div>
  );
}
