-- =====================================================================
-- Core schema: profiles, ideas, versions, files, analyses, reviews,
-- audit log, rate limits. Phase 1.
--
-- Security model (read this before changing anything):
--   * The browser holds the public anon key + the user's JWT, so anything
--     the `authenticated` role can do, a malicious user can do directly
--     against the REST API. Therefore:
--   * `authenticated` gets SELECT only (row-filtered by RLS) on idea data.
--     ALL writes go through Next.js server code using the service-role key
--     after explicit authorization checks. There are deliberately no
--     INSERT/UPDATE/DELETE policies on idea tables.
--   * Profiles: users may update only harmless columns (column grants);
--     `role` can never be changed by the user.
--   * Investors get NO access in Phase 1 (default deny). Phase 3 adds
--     matched-teaser and granted-access policies.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- enums ----------
create type public.user_role as enum ('founder', 'investor', 'admin');

create type public.idea_status as enum (
  'submitted',          -- received, waiting for AI
  'analysing',          -- AI running
  'analysed',           -- AI done, waiting for admin
  'analysis_failed',    -- AI failed; admin can retry
  'under_review',       -- admin picked it up
  'changes_requested',  -- admin asked founder to edit
  'approved',           -- live to investors (Phase 3 uses this)
  'rejected',
  'interest_received'   -- Phase 3
);

create type public.idea_kind as enum ('product', 'service', 'both');
create type public.idea_stage as enum ('idea', 'research', 'prototype', 'launched', 'revenue');
create type public.scan_status as enum ('pending', 'clean', 'infected', 'unscanned', 'error');
create type public.review_action as enum ('start_review', 'approve', 'reject', 'request_changes', 'override_score', 'retry_analysis');

-- ---------- profiles ----------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        public.user_role not null default 'founder',
  full_name   text check (char_length(full_name) <= 120),
  city        text check (char_length(city) <= 60),
  phone       text check (char_length(phone) <= 20),
  email       text check (char_length(email) <= 254),
  locale      text not null default 'en' check (locale in ('en', 'ur')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Auto-create a founder profile for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, phone)
  values (new.id, new.email, new.phone)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Role helper. SECURITY DEFINER so it can read profiles without recursing
-- through profiles' own RLS policies.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------- ideas ----------
create table public.ideas (
  id              uuid primary key default gen_random_uuid(),
  public_code     text not null unique,            -- human-readable Idea ID
  founder_id      uuid not null references public.profiles(id) on delete cascade,
  status          public.idea_status not null default 'submitted',
  title           text not null check (char_length(title) between 3 and 80),
  kind            public.idea_kind not null,
  sector          text not null check (char_length(sector) <= 40),
  stage           public.idea_stage not null,
  city            text check (char_length(city) <= 60),
  -- All wizard answers except contact details (which live in profiles).
  content         jsonb not null,
  content_hash    text not null,                   -- sha256 of canonical content
  version         int  not null default 1,
  consent_terms_at  timestamptz not null,
  consent_blind_at  timestamptz not null,
  submitted_at    timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Denormalised from the latest successful analysis, for queue sorting.
  ai_score        numeric(4,2) check (ai_score between 0 and 10),
  ai_verdict      text,
  ai_flags        text[] not null default '{}',
  admin_score     numeric(4,2) check (admin_score between 0 and 10),
  admin_note      text check (char_length(admin_note) <= 2000),
  founder_feedback text check (char_length(founder_feedback) <= 2000)  -- admin -> founder message
);
create index ideas_founder_idx on public.ideas(founder_id);
create index ideas_status_score_idx on public.ideas(status, ai_score desc nulls last);

-- Immutable submission record (proof of authorship per version).
create table public.idea_versions (
  id            uuid primary key default gen_random_uuid(),
  idea_id       uuid not null references public.ideas(id) on delete cascade,
  version       int  not null,
  content       jsonb not null,
  content_hash  text not null,
  created_at    timestamptz not null default now(),
  unique (idea_id, version)
);

create table public.idea_files (
  id             uuid primary key default gen_random_uuid(),
  idea_id        uuid references public.ideas(id) on delete cascade,  -- null until submit links it
  founder_id     uuid not null references public.profiles(id) on delete cascade,
  storage_path   text not null unique,
  original_name  text not null check (char_length(original_name) <= 200),
  mime           text not null,
  size_bytes     bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  scan_status    public.scan_status not null default 'pending',
  created_at     timestamptz not null default now()
);
create index idea_files_idea_idx on public.idea_files(idea_id);

create table public.analyses (
  id             uuid primary key default gen_random_uuid(),
  idea_id        uuid not null references public.ideas(id) on delete cascade,
  content_hash   text not null,          -- cache key: same content => reuse
  model          text not null,
  ok             boolean not null,
  result         jsonb,                  -- validated analysis JSON
  overall_score  numeric(4,2),
  verdict        text,
  flags          text[] not null default '{}',
  error          text,                   -- sanitized error class, never prompt text
  input_tokens   int,
  output_tokens  int,
  created_at     timestamptz not null default now()
);
create index analyses_idea_idx on public.analyses(idea_id, created_at desc);
create index analyses_cache_idx on public.analyses(content_hash) where ok;

create table public.admin_reviews (
  id             uuid primary key default gen_random_uuid(),
  idea_id        uuid not null references public.ideas(id) on delete cascade,
  admin_id       uuid references public.profiles(id) on delete set null,
  action         public.review_action not null,
  note           text check (char_length(note) <= 2000),
  score_override numeric(4,2) check (score_override between 0 and 10),
  created_at     timestamptz not null default now()
);
create index admin_reviews_idea_idx on public.admin_reviews(idea_id, created_at desc);

-- Append-only audit log. No one but the service role can write; only admins read.
-- entity_id is text (not FK) so the log survives deletion of the entity.
create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  action      text not null,
  entity      text not null,
  entity_id   text,
  meta        jsonb not null default '{}',
  ip_hash     text,                     -- salted hash, never raw IP
  created_at  timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log(entity, entity_id, created_at desc);

-- ---------- rate limiting (fixed window) ----------
create table public.rate_limits (
  key           text not null,
  window_start  timestamptz not null,
  hits          int not null default 0,
  primary key (key, window_start)
);

create or replace function public.rate_limit_hit(p_key text, p_limit int, p_window_seconds int)
returns boolean   -- true = allowed
language plpgsql
security definer
set search_path = ''
as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n int;
begin
  insert into public.rate_limits as r (key, window_start, hits)
  values (p_key, w, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into n;
  -- opportunistic cleanup of old windows
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '2 days';
  end if;
  return n <= p_limit;
end;
$$;

-- ---------- updated_at trigger ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;

create trigger ideas_touch before update on public.ideas
  for each row execute function public.touch_updated_at();
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- Privileges + Row Level Security
-- =====================================================================
alter table public.profiles      enable row level security;
alter table public.ideas         enable row level security;
alter table public.idea_versions enable row level security;
alter table public.idea_files    enable row level security;
alter table public.analyses      enable row level security;
alter table public.admin_reviews enable row level security;
alter table public.audit_log     enable row level security;
alter table public.rate_limits   enable row level security;

-- Start from zero for client roles, then grant precisely.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;

grant usage on schema public to anon, authenticated;

-- profiles: read own (admins read all); update only safe columns.
grant select on public.profiles to authenticated;
grant update (full_name, city, locale) on public.profiles to authenticated;

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ideas & children: read-only for clients.
grant select on public.ideas, public.idea_versions, public.idea_files,
               public.analyses, public.admin_reviews to authenticated;

create policy ideas_select on public.ideas
  for select to authenticated
  using (founder_id = auth.uid() or public.is_admin());

create policy idea_versions_select on public.idea_versions
  for select to authenticated
  using (exists (select 1 from public.ideas i where i.id = idea_id
                 and (i.founder_id = auth.uid() or public.is_admin())));

create policy idea_files_select on public.idea_files
  for select to authenticated
  using (founder_id = auth.uid() or public.is_admin());

create policy analyses_select on public.analyses
  for select to authenticated
  using (exists (select 1 from public.ideas i where i.id = idea_id
                 and (i.founder_id = auth.uid() or public.is_admin())));

-- Review history is admin-only. What a founder should see is copied into
-- ideas.founder_feedback; the internal ideas.admin_note is column-revoked below.
create policy admin_reviews_select on public.admin_reviews
  for select to authenticated
  using (public.is_admin());

-- audit_log: admins read; nobody writes except service role (bypasses RLS).
grant select on public.audit_log to authenticated;
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (public.is_admin());

-- rate_limits: no client access at all (no grants, no policies).

-- Internal admin note must not be readable by founders even though they can
-- read their own idea row: revoke column-level select on that column.
revoke select on public.ideas from authenticated;
grant select (id, public_code, founder_id, status, title, kind, sector, stage, city,
              content, content_hash, version, consent_terms_at, consent_blind_at,
              submitted_at, updated_at, ai_score, ai_verdict, ai_flags, admin_score,
              founder_feedback)
  on public.ideas to authenticated;

-- is_admin() must be callable by RLS evaluation for authenticated users.
grant execute on function public.is_admin() to authenticated;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;
