import { ButtonLink, Card, PageTitle } from "@/components/ui";
import { getDict, href, isLocale } from "@/lib/i18n";

export default async function Investors({ params }: PageProps<"/[lang]/investors">) {
  const { lang: raw } = await params;
  const lang = isLocale(raw) ? raw : "en";
  const t = getDict(lang).investor;
  return (
    <Card>
      <PageTitle sub={t.body}>{t.title}</PageTitle>
      <ButtonLink href={href(lang, "/")} variant="secondary">{t.back}</ButtonLink>
    </Card>
  );
}
