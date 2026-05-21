import type { FeatureFlag } from './feature-flags.js';

export const BILLING_PLANS = {
  FREE: 'free',
  PROFESSIONAL: 'professional',
  ENTERPRISE: 'enterprise',
  SOVEREIGN: 'sovereign',
} as const;

export type BillingPlan = typeof BILLING_PLANS[keyof typeof BILLING_PLANS];

export const QUOTA_IDENTIFIERS = {
  MONTHLY_INGESTION_EVENTS: 'monthly_ingestion_events',
  MONTHLY_POLICY_EVALUATIONS: 'monthly_policy_evaluations',
  MONTHLY_AUDIT_EVENTS: 'monthly_audit_events',
  ACTIVE_AGENTS: 'active_agents',
  ACTIVE_WORKSPACES: 'active_workspaces',
  ACTIVE_TENANTS: 'active_tenants',
  MEMORY_STORAGE_BYTES: 'memory_storage_bytes',
  OPERATIONAL_MEMORY_ENTRIES: 'operational_memory_entries',
  RETENTION_DAYS: 'retention_days',
  API_REQUESTS_PER_MINUTE: 'api_requests_per_minute',
  TREATY_PARTICIPANTS: 'treaty_participants',
  INTEGRATION_ADAPTERS: 'integration_adapters',
} as const;

export type QuotaIdentifier = typeof QUOTA_IDENTIFIERS[keyof typeof QUOTA_IDENTIFIERS];

export const PLAN_FEATURE_ENTITLEMENTS: Readonly<Record<BillingPlan, ReadonlyArray<FeatureFlag>>> = {
  free: [
    'agent_governance',
    'multi_tenant_isolation',
  ],
  professional: [
    'agent_governance',
    'multi_tenant_isolation',
    'enterprise_audit_routing',
    'integration_runtime',
    'capability_delegation',
    'control_plane_sdk',
    'operational_memory',
    'advanced_ingestion',
    'ai_analysis',
  ],
  enterprise: [
    'agent_governance',
    'multi_tenant_isolation',
    'governance_treaties',
    'runtime_negotiation',
    'enterprise_audit_routing',
    'sovereign_audit_sink',
    'integration_runtime',
    'capability_delegation',
    'control_plane_sdk',
    'enhanced_risk_assessment',
    'federated_trust_domains',
    'operational_memory',
    'portfolio_memory',
    'advanced_ingestion',
    'ai_analysis',
    'operational_cognition',
  ],
  sovereign: [
    'agent_governance',
    'multi_tenant_isolation',
    'governance_treaties',
    'runtime_negotiation',
    'enterprise_audit_routing',
    'sovereign_audit_sink',
    'integration_runtime',
    'capability_delegation',
    'control_plane_sdk',
    'enhanced_risk_assessment',
    'federated_trust_domains',
    'operational_memory',
    'portfolio_memory',
    'advanced_ingestion',
    'ai_analysis',
    'operational_cognition',
  ],
} as const;
