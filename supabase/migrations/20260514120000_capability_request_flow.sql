create table if not exists public.capability_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  requester_user_id uuid not null,
  evaluator_user_id uuid,
  target_resource_type text not null check (target_resource_type in ('workspace','project','operational_memory','governance_object','ai_coprocess')),
  target_resource_id text not null,
  requested_permission text not null check (requested_permission in ('read','write','approve','manage','execute','delegate')),
  requested_scope jsonb not null default '{}'::jsonb,
  justification text,
  status text not null default 'pending' check (status in ('pending','approved','denied','revoked','expired')),
  grant_expires_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.capability_grants (
  id uuid primary key default gen_random_uuid(),
  capability_request_id uuid not null references public.capability_requests(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  granted_user_id uuid not null,
  granted_by_user_id uuid not null,
  target_resource_type text not null check (target_resource_type in ('workspace','project','operational_memory','governance_object','ai_coprocess')),
  target_resource_id text not null,
  permission text not null check (permission in ('read','write','approve','manage','execute','delegate')),
  scope jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','revoked','expired')),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by_user_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.capability_audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request_id uuid references public.capability_requests(id) on delete set null,
  grant_id uuid references public.capability_grants(id) on delete set null,
  actor_user_id uuid,
  event_type text not null check (event_type in ('requested','approved','denied','revoked','expired','consumed')),
  event_detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists capability_requests_workspace_status_idx on public.capability_requests(workspace_id, status, created_at desc);
create index if not exists capability_grants_grantee_scope_idx on public.capability_grants(granted_user_id, workspace_id, status, expires_at);
create index if not exists capability_audit_workspace_idx on public.capability_audit_events(workspace_id, created_at desc);

alter table public.capability_requests enable row level security;
alter table public.capability_grants enable row level security;
alter table public.capability_audit_events enable row level security;

create policy if not exists capability_requests_read_scope on public.capability_requests
for select using (
  requester_user_id = auth.uid()
  or exists (select 1 from public.workspace_memberships wm where wm.workspace_id = capability_requests.workspace_id and wm.user_id = auth.uid() and wm.role in ('owner','admin'))
);
create policy if not exists capability_requests_server_write on public.capability_requests for all using (false) with check (false);

create policy if not exists capability_grants_read_scope on public.capability_grants
for select using (
  granted_user_id = auth.uid()
  or exists (select 1 from public.workspace_memberships wm where wm.workspace_id = capability_grants.workspace_id and wm.user_id = auth.uid() and wm.role in ('owner','admin'))
);
create policy if not exists capability_grants_server_write on public.capability_grants for all using (false) with check (false);

create policy if not exists capability_audit_read_scope on public.capability_audit_events
for select using (
  actor_user_id = auth.uid()
  or exists (select 1 from public.workspace_memberships wm where wm.workspace_id = capability_audit_events.workspace_id and wm.user_id = auth.uid() and wm.role in ('owner','admin'))
);
create policy if not exists capability_audit_server_write on public.capability_audit_events for all using (false) with check (false);
