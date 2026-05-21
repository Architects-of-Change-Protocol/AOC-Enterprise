export const FEATURE_FLAGS = {
  AGENT_GOVERNANCE: 'agent_governance',
  MULTI_TENANT_ISOLATION: 'multi_tenant_isolation',
  GOVERNANCE_TREATIES: 'governance_treaties',
  RUNTIME_NEGOTIATION: 'runtime_negotiation',
  ENTERPRISE_AUDIT_ROUTING: 'enterprise_audit_routing',
  SOVEREIGN_AUDIT_SINK: 'sovereign_audit_sink',
  INTEGRATION_RUNTIME: 'integration_runtime',
  CAPABILITY_DELEGATION: 'capability_delegation',
  CONTROL_PLANE_SDK: 'control_plane_sdk',
  ENHANCED_RISK_ASSESSMENT: 'enhanced_risk_assessment',
  FEDERATED_TRUST_DOMAINS: 'federated_trust_domains',
  OPERATIONAL_MEMORY: 'operational_memory',
  PORTFOLIO_MEMORY: 'portfolio_memory',
  ADVANCED_INGESTION: 'advanced_ingestion',
  AI_ANALYSIS: 'ai_analysis',
  OPERATIONAL_COGNITION: 'operational_cognition',
} as const;

export type FeatureFlag = typeof FEATURE_FLAGS[keyof typeof FEATURE_FLAGS];

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;
