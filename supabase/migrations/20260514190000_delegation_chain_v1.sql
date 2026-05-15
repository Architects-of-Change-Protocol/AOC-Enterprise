alter table public.governance_delegations
  add column if not exists parent_delegation_id uuid null references public.governance_delegations(id) on delete set null,
  add column if not exists delegator_actor_type text null check (delegator_actor_type in ('human','ai_agent')),
  add column if not exists delegate_actor_type text null check (delegate_actor_type in ('human','ai_agent')),
  add column if not exists source_capability_grant_id uuid null references public.capability_grants(id) on delete set null,
  add column if not exists permission text null,
  add column if not exists delegated_scope jsonb not null default '{}'::jsonb,
  add column if not exists delegation_depth int not null default 1,
  add column if not exists revoked_reason text null,
  add column if not exists created_by_user_id uuid null references auth.users(id) on delete set null,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.governance_delegations
set
  delegator_actor_type = case when delegator_user_id is not null then 'human' else 'ai_agent' end,
  delegate_actor_type = case when delegatee_user_id is not null then 'human' else 'ai_agent' end,
  source_capability_grant_id = coalesce(source_capability_grant_id, parent_grant_id),
  permission = coalesce(permission, requested_permission),
  delegated_scope = coalesce(nullif(constraints, '{}'::jsonb), delegated_scope),
  delegation_depth = greatest(coalesce((constraints->>'delegationDepth')::int, delegation_depth, 1), 1),
  created_by_user_id = coalesce(created_by_user_id, delegator_user_id)
where delegator_actor_type is null
   or delegate_actor_type is null
   or source_capability_grant_id is null
   or permission is null;

create index if not exists idx_gov_delegations_parent_delegation on public.governance_delegations(parent_delegation_id);
create index if not exists idx_gov_delegations_workspace_depth on public.governance_delegations(workspace_id, delegation_depth, status);
