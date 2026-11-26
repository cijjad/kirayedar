import { Card, Notice, PageTitle } from "@/components/ui";
import { getDict, isLocale } from "@/lib/i18n";

// Placeholder. Must be drafted by a Pakistani lawyer before launch.
export default async function Page({ params }: PageProps<"/[lang]/terms">) {
  const { lang: raw } = await params;
  const t = getDict(isLocale(raw) ? raw : "en").legal;
  return (
    <Card>
      <PageTitle>{t.termsTitle}</PageTitle>
      <Notice tone="warn">{t.draft}</Notice>
    </Card>
  );
}
