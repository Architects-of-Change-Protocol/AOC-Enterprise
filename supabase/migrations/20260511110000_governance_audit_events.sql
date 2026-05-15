create table if not exists public.governance_audit_events (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  project_id text null,
  namespace_key text not null,
  namespace_scope text not null check (namespace_scope in ('organization','workspace','project','machine')),
  event_type text not null,
  actor_ref text not null,
  actor_type text not null check (actor_type in ('human','machine')),
  actor_role text not null,
  machine_id text null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists governance_audit_events_company_idx on public.governance_audit_events(company_id, occurred_at desc);
create index if not exists governance_audit_events_namespace_idx on public.governance_audit_events(namespace_key, occurred_at desc);

alter table public.governance_audit_events enable row level security;

create policy if not exists "tenant access governance_audit_events"
  on public.governance_audit_events
  for all
  to authenticated
  using (public.current_company_id() = company_id)
  with check (public.current_company_id() = company_id);
