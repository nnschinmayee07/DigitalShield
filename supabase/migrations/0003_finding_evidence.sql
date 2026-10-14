-- Metadata for findings reported by authorized providers or by the account owner.
alter table public.findings
  add column if not exists provider_name text check (provider_name is null or char_length(provider_name) <= 160),
  add column if not exists evidence_url text check (evidence_url is null or char_length(evidence_url) <= 2048),
  add column if not exists evidence_summary text check (evidence_summary is null or char_length(evidence_summary) <= 4000);
