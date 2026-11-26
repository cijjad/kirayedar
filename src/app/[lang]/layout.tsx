import type { Metadata, Viewport } from "next";
import { Inter, Noto_Nastaliq_Urdu } from "next/font/google";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { UserMenu } from "@/components/UserMenu";
import { APP_NAME } from "@/lib/config";
import { I18nProvider } from "@/lib/i18n/client";
import { dirOf, getDict, href, isLocale, LOCALES } from "@/lib/i18n";
import "../globals.css";

const latin = Inter({ subsets: ["latin"], variable: "--font-latin", display: "swap" });
const nastaliq = Noto_Nastaliq_Urdu({ subsets: ["arabic"], weight: ["400", "700"], variable: "--font-nastaliq", display: "swap" });

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  const t = getDict(isLocale(lang) ? lang : "en");
  return {
    title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
    description: t.meta.tagline,
    robots: { index: true, follow: true },
  };
}

export const viewport: Viewport = { themeColor: "#0b3d5c", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = getDict(lang);
  return (
    <html lang={lang} dir={dirOf(lang)} className={`${latin.variable} ${nastaliq.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <I18nProvider locale={lang} dict={t}>
          <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
            <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4">
              <Link href={href(lang, "/")} className="text-lg font-bold text-brand">
                {APP_NAME}
              </Link>
              <nav className="flex items-center gap-1 sm:gap-2">
                <LanguageSwitch />
                <Suspense fallback={<span className="w-20" />}>
                  <UserMenu locale={lang} />
                </Suspense>
              </nav>
            </div>
          </header>
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-10">{children}</main>
          <footer className="border-t border-line bg-surface">
            <div className="mx-auto flex max-w-5xl flex-wrap gap-4 px-4 py-6 text-sm text-ink-soft">
              <span>© {APP_NAME}</span>
              <Link href={href(lang, "/privacy")} className="underline">{t.legal.privacyTitle}</Link>
              <Link href={href(lang, "/terms")} className="underline">{t.legal.termsTitle}</Link>
            </div>
          </footer>
        </I18nProvider>
      </body>
    </html>
  );
}
