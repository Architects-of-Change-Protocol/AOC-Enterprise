begin;

create table if not exists public.ai_agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  agent_type text not null check (agent_type in ('copilot','analyzer','workflow_runner','governance_assistant','external_agent')),
  status text not null default 'active' check (status in ('active','disabled','revoked')),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  owner_user_id uuid references auth.users(id) on delete set null,
  purpose text not null,
  risk_level text not null default 'medium' check (risk_level in ('low','medium','high')),
  metadata jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  last_action_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.ai_agent_scopes (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.ai_agents(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  capability_grant_id uuid references public.capability_grants(id) on delete set null,
  resource_type text not null check (resource_type in ('workspace','project','operational_memory','governance_object','ai_coprocess','copilot')),
  resource_id text not null,
  permission text not null check (permission in ('read','write','approve','manage','execute','delegate')),
  scope jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  status text not null default 'active' check (status in ('active','expired','revoked')),
  granted_by_user_id uuid not null references auth.users(id) on delete restrict,
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists ai_agents_workspace_idx on public.ai_agents(workspace_id, status, created_at desc);
create index if not exists ai_agent_scopes_agent_idx on public.ai_agent_scopes(agent_id, workspace_id, status, expires_at);

alter table public.ai_agents enable row level security;
alter table public.ai_agent_scopes enable row level security;

create policy if not exists ai_agents_read_scope on public.ai_agents for select using (
  exists (select 1 from public.workspace_memberships wm where wm.workspace_id = ai_agents.workspace_id and wm.user_id = auth.uid())
);
create policy if not exists ai_agents_admin_write_scope on public.ai_agents for all using (
  exists (select 1 from public.workspace_memberships wm where wm.workspace_id = ai_agents.workspace_id and wm.user_id = auth.uid() and wm.role in ('owner','admin'))
) with check (
  exists (select 1 from public.workspace_memberships wm where wm.workspace_id = ai_agents.workspace_id and wm.user_id = auth.uid() and wm.role in ('owner','admin'))
);

create policy if not exists ai_agent_scopes_read_scope on public.ai_agent_scopes for select using (
  exists (select 1 from public.workspace_memberships wm where wm.workspace_id = ai_agent_scopes.workspace_id and wm.user_id = auth.uid())
);
create policy if not exists ai_agent_scopes_admin_write_scope on public.ai_agent_scopes for all using (
  exists (select 1 from public.workspace_memberships wm where wm.workspace_id = ai_agent_scopes.workspace_id and wm.user_id = auth.uid() and wm.role in ('owner','admin'))
) with check (
  exists (select 1 from public.workspace_memberships wm where wm.workspace_id = ai_agent_scopes.workspace_id and wm.user_id = auth.uid() and wm.role in ('owner','admin'))
);

alter table public.capability_audit_events add column if not exists actor_agent_id uuid references public.ai_agents(id) on delete set null;
alter table public.capability_audit_events drop constraint if exists capability_audit_events_event_type_check;
alter table public.capability_audit_events add constraint capability_audit_events_event_type_check check (
  event_type in (
    'requested','approved','denied','revoked','expired','consumed','policy_evaluated','policy_allowed','policy_denied','policy_required_approval','policy_expired_grant','policy_scope_mismatch',
    'agent_registered','agent_scope_granted','agent_scope_revoked','agent_disabled','agent_revoked','agent_access_allowed','agent_access_denied','agent_policy_evaluated'
  )
);

commit;
