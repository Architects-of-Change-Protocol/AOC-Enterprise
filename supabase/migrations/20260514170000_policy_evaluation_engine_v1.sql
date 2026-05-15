create table if not exists public.capability_policies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  resource_type text not null check (resource_type in ('workspace','project','operational_memory','governance_object','ai_coprocess')),
  permission text not null check (permission in ('read','write','approve','manage','execute','delegate')),
  effect text not null check (effect in ('allow','deny','require_approval')),
  conditions jsonb not null default '{}'::jsonb,
  priority integer not null default 100,
  enabled boolean not null default true,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists capability_policies_workspace_idx on public.capability_policies(workspace_id, enabled, priority, resource_type, permission);

alter table public.capability_policies enable row level security;

create policy if not exists capability_policies_read_scope on public.capability_policies
for select using (
  exists (select 1 from public.workspace_memberships wm where wm.workspace_id = capability_policies.workspace_id and wm.user_id = auth.uid())
);

create policy if not exists capability_policies_admin_write_scope on public.capability_policies
for all using (
  exists (select 1 from public.workspace_memberships wm where wm.workspace_id = capability_policies.workspace_id and wm.user_id = auth.uid() and wm.role in ('owner','admin'))
) with check (
  exists (select 1 from public.workspace_memberships wm where wm.workspace_id = capability_policies.workspace_id and wm.user_id = auth.uid() and wm.role in ('owner','admin'))
);

alter table public.capability_audit_events drop constraint if exists capability_audit_events_event_type_check;
alter table public.capability_audit_events
add constraint capability_audit_events_event_type_check
check (event_type in ('requested','approved','denied','revoked','expired','consumed','policy_evaluated','policy_allowed','policy_denied','policy_required_approval','policy_expired_grant','policy_scope_mismatch'));
