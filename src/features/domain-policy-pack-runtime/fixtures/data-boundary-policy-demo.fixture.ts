import type { PolicyEvaluationInput } from '../domain/policy-pack-evaluation.js';
import { buildPolicyEvaluationInput } from './domain-policy-pack-demo.fixture.js';

export function buildExportClientDataInput(overrides: Partial<PolicyEvaluationInput> = {}): PolicyEvaluationInput {
  return buildPolicyEvaluationInput({
    id: 'policy-eval-export-client-data',
    action: 'export_client_data',
    domain: 'data_boundary',
    dataDomains: ['pii'],
    sideEffectType: 'data_export',
    hasApprovalProof: false,
    hasRequiredEvidence: true,
    ...overrides,
  });
}

export function buildReadProjectSummaryInput(overrides: Partial<PolicyEvaluationInput> = {}): PolicyEvaluationInput {
  return buildPolicyEvaluationInput({
    id: 'policy-eval-read-project-summary',
    action: 'read_project_summary',
    domain: 'data_boundary',
    dataDomains: ['project_metadata'],
    ...overrides,
  });
}
