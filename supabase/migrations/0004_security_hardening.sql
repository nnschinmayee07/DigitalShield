-- Tighten relationships between user-owned rows and protect encrypted field shape.
-- Apply once after migrations 0001–0003.

alter table public.identities
  add constraint identities_private_notes_all_or_none
  check (
    (private_notes_ciphertext is null and private_notes_iv is null and private_notes_tag is null)
    or
    (private_notes_ciphertext is not null and private_notes_iv is not null and private_notes_tag is not null)
  );

-- A finding may only reference a source owned by the same account.
drop policy if exists "finding owner insert" on public.findings;
create policy "finding owner insert" on public.findings
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      source_id is null
      or exists (
        select 1 from public.sources s
        where s.id = source_id and s.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "finding owner update" on public.findings;
create policy "finding owner update" on public.findings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      source_id is null
      or exists (
        select 1 from public.sources s
        where s.id = source_id and s.user_id = (select auth.uid())
      )
    )
  );

-- A remediation request may only point to a finding owned by the same account.
drop policy if exists "removal requests owner insert" on public.removal_requests;
create policy "removal requests owner insert" on public.removal_requests
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      finding_id is null
      or exists (
        select 1 from public.findings f
        where f.id = finding_id and f.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "removal requests owner update" on public.removal_requests;
create policy "removal requests owner update" on public.removal_requests
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      finding_id is null
      or exists (
        select 1 from public.findings f
        where f.id = finding_id and f.user_id = (select auth.uid())
      )
    )
  );
