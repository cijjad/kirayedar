"use client";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id: string) => void;
    };
  }
}

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

/** Cloudflare Turnstile widget. Renders nothing when no site key is configured. */
export function Turnstile({ onToken, action }: { onToken: (t: string | null) => void; action: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !ref.current) return;
    let id: string | undefined;
    const render = () => {
      if (!window.turnstile || !ref.current) return;
      id = window.turnstile.render(ref.current, {
        sitekey: TURNSTILE_SITE_KEY,
        action,
        callback: (tok: string) => onToken(tok),
        "expired-callback": () => onToken(null),
        "error-callback": () => onToken(null),
      });
    };
    if (window.turnstile) render();
    else {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = render;
      document.head.appendChild(s);
    }
    return () => {
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [action, onToken]);
  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={ref} className="my-3" />;
}
