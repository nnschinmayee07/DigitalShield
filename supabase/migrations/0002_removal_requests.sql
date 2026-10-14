-- DigitalShield authorized remediation workflow. This records requests; it does not delete third-party content by itself.
create type public.removal_request_status as enum ('draft','submitted','in_progress','completed','rejected');
create type public.removal_request_kind as enum ('site_takedown','credential_reset','manual_review');

create table public.removal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  finding_id uuid references public.findings(id) on delete set null,
  kind public.removal_request_kind not null default 'manual_review',
  status public.removal_request_status not null default 'draft',
  target_url text not null check (char_length(target_url) between 8 and 2048),
  provider_name text not null check (char_length(provider_name) between 1 and 160),
  notes text not null default '' check (char_length(notes) <= 4000),
  external_reference text check (external_reference is null or char_length(external_reference) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index removal_requests_user_status_idx on public.removal_requests(user_id, status, created_at desc);
create trigger removal_requests_updated_at before update on public.removal_requests for each row execute function public.set_updated_at();
alter table public.removal_requests enable row level security;
create policy "removal requests owner select" on public.removal_requests for select to authenticated using ((select auth.uid()) = user_id);
create policy "removal requests owner insert" on public.removal_requests for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "removal requests owner update" on public.removal_requests for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "removal requests owner delete" on public.removal_requests for delete to authenticated using ((select auth.uid()) = user_id);
