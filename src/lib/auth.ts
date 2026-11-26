import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "founder" | "investor" | "admin";
export type SessionUser = { id: string; email: string | null; phone: string | null; role: Role };

/**
 * Returns the verified user (getUser() validates the JWT with Supabase Auth;
 * getSession() would trust the cookie blindly) and their role from profiles.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).single();
  return {
    id: data.user.id,
    email: data.user.email ?? null,
    phone: data.user.phone ?? null,
    role: (profile?.role as Role) ?? "founder",
  };
}

export async function requireUser(next = "/dashboard"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser("/admin");
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}
