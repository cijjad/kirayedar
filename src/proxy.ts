import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const LOCALES = ["en", "ur"];

/**
 * 1. Adds a locale prefix to paths that lack one (cookie, then Accept-Language).
 * 2. Refreshes the Supabase auth session cookie on every page request.
 * 3. Bounces signed-out users away from private areas.
 * NOTE: this is a convenience layer, not the security boundary. Every page,
 * route handler and server action re-checks auth, and RLS enforces data access.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const first = pathname.split("/")[1];

  if (!LOCALES.includes(first)) {
    const pref = request.cookies.get("lang")?.value;
    const accept = request.headers.get("accept-language") ?? "";
    const locale = pref && LOCALES.includes(pref) ? pref : /\bur\b/i.test(accept) ? "ur" : "en";
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await supabase.auth.getUser();

  const section = pathname.split("/")[2];
  if (!data.user && (section === "dashboard" || section === "admin")) {
    const login = request.nextUrl.clone();
    login.pathname = `/${first}/login`;
    login.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  // Pages only: not API routes, auth callback, Next internals or static files.
  matcher: ["/((?!api|auth|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|txt|xml)$).*)"],
};
