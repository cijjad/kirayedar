import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "accent" | "danger" | "ghost";
const variants: Record<Variant, string> = {
  primary: "bg-brand text-brand-ink hover:opacity-90",
  accent: "bg-accent text-white hover:opacity-90",
  secondary: "bg-surface text-brand border border-line hover:border-brand",
  danger: "bg-danger text-white hover:opacity-90",
  ghost: "text-brand hover:bg-accent-soft",
};
const base =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

export function Button({ variant = "primary", className = "", ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function ButtonLink({ variant = "primary", className = "", ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <section className={`rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-6 ${className}`}>{children}</section>;
}

type Tone = "neutral" | "good" | "warn" | "bad" | "brand";
const tones: Record<Tone, string> = {
  neutral: "bg-bg text-ink-soft border-line",
  good: "bg-accent-soft text-accent border-accent/30",
  warn: "bg-warn-soft text-warn border-warn/30",
  bad: "bg-danger-soft text-danger border-danger/30",
  brand: "bg-brand/10 text-brand border-brand/20",
};
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full border px-3 py-0.5 text-sm font-medium ${tones[tone]}`}>{children}</span>;
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-bold text-brand sm:text-3xl">{children}</h1>
      {sub ? <p className="mt-2 text-ink-soft">{sub}</p> : null}
    </header>
  );
}

export function Notice({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <div role="status" className={`rounded-xl border p-4 ${tones[tone]}`}>{children}</div>;
}
