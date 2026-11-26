import en, { type Dict } from "./en";
import ur from "./ur";

export const LOCALES = ["en", "ur"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(v: string | undefined | null): v is Locale {
  return v === "en" || v === "ur";
}

export function getDict(locale: Locale): Dict {
  return locale === "ur" ? ur : en;
}

export function dirOf(locale: Locale): "rtl" | "ltr" {
  return locale === "ur" ? "rtl" : "ltr";
}

/** Replace {name} placeholders. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

/** Path helper: href(locale, "/dashboard") -> "/ur/dashboard". */
export function href(locale: Locale, path: string): string {
  return `/${locale}${path === "/" ? "" : path}`;
}

export type { Dict };
