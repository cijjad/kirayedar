import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Loading } from "@/components/Loading";
import { PageTitle } from "@/components/ui";
import { WizardClient as Wizard } from "@/components/wizard/WizardClient";
import { requireUser } from "@/lib/auth";
import { getDict, href, isLocale, type Locale } from "@/lib/i18n";
import { loadIdeaForViewer } from "@/lib/ideas/queries";
import { ideaContentSchema } from "@/lib/ideas/schema";

async function Edit({ params }: { params: Promise<{ lang: string; id: string }> }) {
  const { id, lang: raw } = await params;
  const lang: Locale = isLocale(raw) ? raw : "en";
  const t = getDict(lang);
  const user = await requireUser(href(lang, `/dashboard/${id}/edit`));
  const data = await loadIdeaForViewer(id);
  if (!data || data.idea.founder_id !== user.id) notFound();
  const content = ideaContentSchema.safeParse(data.idea.content);
  if (!content.success) notFound();
  return (
    <>
      <PageTitle sub={t.dashboard.editNote}>{t.dashboard.edit}</PageTitle>
      <Wizard mode="edit" ideaId={id} initial={content.data} existingFiles={data.files.length} />
    </>
  );
}

export default function Page({ params }: PageProps<"/[lang]/dashboard/[id]/edit">) {
  return (
    <div className="mx-auto max-w-2xl">
      <Suspense fallback={<Loading />}>
        <Edit params={params} />
      </Suspense>
    </div>
  );
}
