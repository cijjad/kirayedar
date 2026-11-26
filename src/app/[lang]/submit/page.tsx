import { PageTitle } from "@/components/ui";
import { WizardClient as Wizard } from "@/components/wizard/WizardClient";
import { getDict, isLocale } from "@/lib/i18n";

export default async function SubmitPage({ params }: PageProps<"/[lang]/submit">) {
  const { lang } = await params;
  const t = getDict(isLocale(lang) ? lang : "en");
  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle>{t.wizard.title}</PageTitle>
      <Wizard mode="create" />
    </div>
  );
}
