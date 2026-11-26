"use client";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import { type ActionState, revealContact, reviewIdea } from "./actions";

const ta = "w-full rounded-xl border border-line bg-surface px-3 py-2";

export function AdminActions({ ideaId }: { ideaId: string }) {
  const { t } = useI18n();
  const A = t.admin;
  const [state, action, pending] = useActionState<ActionState, FormData>(reviewIdea, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="ideaId" value={ideaId} />
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">{A.noteFounder}</span>
        <textarea name="founderNote" rows={3} maxLength={2000} className={ta} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">{A.noteInternal}</span>
        <textarea name="internalNote" rows={2} maxLength={2000} className={ta} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">{A.scoreLabel}</span>
        <input name="score" type="number" min={0} max={10} step={0.1} className={`${ta} ltr max-w-32`} />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button name="action" value="start_review" variant="secondary" disabled={pending}>{A.startReview}</Button>
        <Button name="action" value="approve" variant="accent" disabled={pending}>{A.approve}</Button>
        <Button name="action" value="request_changes" variant="secondary" disabled={pending}>{A.requestChanges}</Button>
        <Button name="action" value="reject" variant="danger" disabled={pending}>{A.reject}</Button>
        <Button name="action" value="override_score" variant="secondary" disabled={pending}>{A.override}</Button>
        <Button name="action" value="retry_analysis" variant="ghost" disabled={pending}>{A.retry}</Button>
      </div>
      {state?.ok ? <p role="status" className="text-accent">{A.done}</p> : null}
      {state && !state.ok ? <p role="alert" className="text-danger">{t.common.error} ({state.error})</p> : null}
    </form>
  );
}

export function ContactReveal({ ideaId }: { ideaId: string }) {
  const { t } = useI18n();
  const [c, setC] = useState<Awaited<ReturnType<typeof revealContact>> | undefined>(undefined);
  if (c === undefined) return <Button variant="secondary" onClick={async () => setC(await revealContact(ideaId))}>{t.admin.showContact}</Button>;
  if (!c) return <p>{t.common.notFound}</p>;
  return (
    <dl className="ltr grid grid-cols-[auto_1fr] gap-x-3 text-sm">
      <dt>Name</dt><dd>{c.full_name}</dd><dt>Phone</dt><dd>{c.phone}</dd><dt>Email</dt><dd>{c.email}</dd><dt>City</dt><dd>{c.city}</dd>
    </dl>
  );
}
