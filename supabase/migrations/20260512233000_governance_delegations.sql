create table if not exists public.governance_delegations (
  id uuid primary key default gen_random_uuid(),
  parent_grant_id uuid null references public.governance_execution_grants(id) on delete set null,
  parent_decision_id text null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid null references public.projects(id) on delete set null,
  delegator_user_id uuid null references auth.users(id) on delete set null,
  delegator_agent_id text null,
  delegatee_user_id uuid null references auth.users(id) on delete set null,
  delegatee_agent_id text null,
  action text not null,
  requested_permission text not null,
  resource_type text null,
  resource_id text null,
  constraints jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','revoked','expired','consumed')),
  delegation_token_hash text not null unique,
  max_uses int not null default 1 check (max_uses > 0),
  uses_count int not null default 0 check (uses_count >= 0),
  expires_at timestamptz not null,
  revoked_at timestamptz null,
  consumed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_gov_delegations_workspace on public.governance_delegations(workspace_id, status, expires_at);
create index if not exists idx_gov_delegations_delegator on public.governance_delegations(delegator_user_id, delegator_agent_id);
create index if not exists idx_gov_delegations_delegatee on public.governance_delegations(delegatee_user_id, delegatee_agent_id);

alter table public.governance_delegations enable row level security;

create policy if not exists "delegations_owner_admin_read" on public.governance_delegations
for select using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = governance_delegations.workspace_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.role in ('owner','admin')
  )
);

create policy if not exists "delegations_delegator_read" on public.governance_delegations
for select using (delegator_user_id = auth.uid());

create policy if not exists "delegations_delegatee_read" on public.governance_delegations
for select using (delegatee_user_id = auth.uid());

create policy if not exists "delegations_no_client_writes" on public.governance_delegations
for all using (false) with check (false);
