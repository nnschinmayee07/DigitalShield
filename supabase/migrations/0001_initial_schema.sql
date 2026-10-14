-- DigitalShield initial schema. Run in Supabase SQL Editor.
create extension if not exists pgcrypto;

create type public.identity_kind as enum ('email','social_profile','website','username','phone','other');
create type public.source_status as enum ('unverified','authorized','disabled');
create type public.finding_severity as enum ('low','medium','high','critical');
create type public.finding_status as enum ('open','resolved','dismissed');

create table public.identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 120),
  kind public.identity_kind not null default 'other',
  identifier text not null check (char_length(identifier) between 1 and 2048),
  private_notes_ciphertext text,
  private_notes_iv text,
  private_notes_tag text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index identities_user_created_idx on public.identities(user_id, created_at desc);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  reference text not null check (char_length(reference) between 1 and 2048),
  status public.source_status not null default 'unverified',
  authorization_note text,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sources_user_status_idx on public.sources(user_id, status);

create table public.findings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid references public.sources(id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '',
  severity public.finding_severity not null default 'low',
  status public.finding_status not null default 'open',
  is_demo boolean not null default false,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index findings_user_status_idx on public.findings(user_id, status, detected_at desc);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (char_length(action) between 1 and 120),
  entity_type text not null check (char_length(entity_type) between 1 and 80),
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_user_created_idx on public.audit_logs(user_id, created_at desc);

-- updated_at helper
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
create trigger identities_updated_at before update on public.identities for each row execute function public.set_updated_at();
create trigger sources_updated_at before update on public.sources for each row execute function public.set_updated_at();

-- RLS is enabled on every user-owned table. Never rely on UI filtering for access control.
alter table public.identities enable row level security;
alter table public.sources enable row level security;
alter table public.findings enable row level security;
alter table public.audit_logs enable row level security;

create policy "identity owner select" on public.identities for select to authenticated using ((select auth.uid()) = user_id);
create policy "identity owner insert" on public.identities for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "identity owner update" on public.identities for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "identity owner delete" on public.identities for delete to authenticated using ((select auth.uid()) = user_id);

create policy "source owner select" on public.sources for select to authenticated using ((select auth.uid()) = user_id);
create policy "source owner insert" on public.sources for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "source owner update" on public.sources for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "source owner delete" on public.sources for delete to authenticated using ((select auth.uid()) = user_id);

create policy "finding owner select" on public.findings for select to authenticated using ((select auth.uid()) = user_id);
create policy "finding owner insert" on public.findings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "finding owner update" on public.findings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "finding owner delete" on public.findings for delete to authenticated using ((select auth.uid()) = user_id);

create policy "audit owner select" on public.audit_logs for select to authenticated using ((select auth.uid()) = user_id);
create policy "audit owner insert" on public.audit_logs for insert to authenticated with check ((select auth.uid()) = user_id);
-- No update/delete policies for audit_logs: normal clients cannot rewrite history.
