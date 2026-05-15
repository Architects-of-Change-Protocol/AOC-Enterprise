create table if not exists public.governance_approval_requests (
  id uuid primary key default gen_random_uuid(),
  decision_id text unique not null,
  workspace_id uuid not null,
  project_id uuid null,
  actor_user_id uuid null,
  actor_agent_id text null,
  action text not null,
  requested_permission text not null,
  required_approval_type text not null,
  reviewer_role_required text null,
  reviewer_user_id uuid null,
  status text not null,
  reason text null,
  risk_level text null,
  trace jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz null,
  resolved_by_user_id uuid null
);
alter table public.governance_approval_requests enable row level security;
create policy "approval_read_scope" on public.governance_approval_requests for select using (
  actor_user_id = auth.uid()
  or reviewer_user_id = auth.uid()
  or exists (select 1 from public.workspace_memberships wm where wm.workspace_id = governance_approval_requests.workspace_id and wm.user_id = auth.uid() and wm.role in ('owner','admin'))
);
create policy "approval_update_scope" on public.governance_approval_requests for update using (
  reviewer_user_id = auth.uid()
  or exists (select 1 from public.workspace_memberships wm where wm.workspace_id = governance_approval_requests.workspace_id and wm.user_id = auth.uid() and wm.role in ('owner','admin'))
) with check (true);
revoke insert on public.governance_approval_requests from anon, authenticated;
