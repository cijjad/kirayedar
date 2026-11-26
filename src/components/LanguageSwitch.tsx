"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useI18n } from "@/lib/i18n/client";

function Switch() {
  const { locale, t } = useI18n();
  const pathname = usePathname();
  const search = useSearchParams();
  const other = locale === "en" ? "ur" : "en";
  const rest = pathname.replace(/^\/(en|ur)(?=\/|$)/, "");
  const qs = search.toString();
  return (
    <a
      href={`/${other}${rest}${qs ? `?${qs}` : ""}`}
      lang={other}
      onClick={() => {
        document.cookie = `lang=${other}; path=/; max-age=31536000; samesite=lax`;
      }}
      className="inline-flex min-h-11 items-center rounded-lg px-3 font-semibold text-brand hover:bg-accent-soft"
    >
      {t.nav.language}
    </a>
  );
}

export function LanguageSwitch() {
  return (
    <Suspense fallback={<span className="w-14" />}>
      <Switch />
    </Suspense>
  );
}
