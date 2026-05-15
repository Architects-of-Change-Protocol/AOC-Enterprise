create table if not exists public.governance_execution_grants (
  id uuid primary key default gen_random_uuid(),
  approval_request_id uuid not null references public.governance_approval_requests(id) on delete cascade,
  decision_id text not null,
  workspace_id uuid not null,
  project_id uuid null,
  actor_user_id uuid null,
  actor_agent_id text null,
  action text not null,
  requested_permission text not null,
  resource_type text null,
  resource_id text null,
  grant_token_hash text unique not null,
  status text not null check (status in ('active','consumed','expired','revoked')),
  issued_by_user_id uuid null,
  consumed_by_user_id uuid null,
  consumed_by_agent_id text null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  revoked_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists governance_execution_grants_approval_unique on public.governance_execution_grants(approval_request_id);
create index if not exists governance_execution_grants_workspace_idx on public.governance_execution_grants(workspace_id, status, expires_at);

alter table public.governance_execution_grants enable row level security;
create policy "execution_grants_read_scope" on public.governance_execution_grants for select using (
  actor_user_id = auth.uid()
  or exists (select 1 from public.workspace_memberships wm where wm.workspace_id = governance_execution_grants.workspace_id and wm.user_id = auth.uid() and wm.role in ('owner','admin'))
);
revoke insert on public.governance_execution_grants from anon, authenticated;
revoke update on public.governance_execution_grants from anon, authenticated;
revoke delete on public.governance_execution_grants from anon, authenticated;
