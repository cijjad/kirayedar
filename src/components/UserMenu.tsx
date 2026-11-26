import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { getDict, href, type Locale } from "@/lib/i18n";
import { supabaseConfigured } from "@/lib/supabase/env";

const linkCls = "inline-flex min-h-11 items-center rounded-lg px-3 font-medium text-brand hover:bg-accent-soft";

export async function UserMenu({ locale }: { locale: Locale }) {
  const t = getDict(locale);
  const user = supabaseConfigured ? await getSessionUser() : null;
  if (!user) {
    return (
      <Link href={href(locale, "/login")} className={linkCls}>
        {t.nav.login}
      </Link>
    );
  }
  return (
    <>
      {user.role === "admin" ? (
        <Link href={href(locale, "/admin")} className={linkCls}>
          {t.nav.admin}
        </Link>
      ) : null}
      <Link href={href(locale, "/dashboard")} className={linkCls}>
        {t.nav.dashboard}
      </Link>
      <form action="/auth/signout" method="post">
        <button className={linkCls}>{t.nav.logout}</button>
      </form>
    </>
  );
}
