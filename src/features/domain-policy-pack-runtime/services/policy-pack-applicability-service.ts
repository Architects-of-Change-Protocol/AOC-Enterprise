import type { PolicyPackScope } from '../domain/policy-pack-scope.js';
import type { PolicyPackVersion } from '../domain/policy-pack-version.js';
import type { PolicyApplicabilityResult } from '../domain/policy-pack-applicability.js';
import type { PolicyEvaluationInput } from '../domain/policy-pack-evaluation.js';
import type { PolicyPackStore } from './policy-pack-store.js';

interface ScopeFieldCheck {
  readonly scopeValues: readonly string[] | undefined;
  readonly inputValue: string | undefined;
  readonly inputValues: readonly string[] | undefined;
  readonly reasonCode: string;
}

/**
 * Resolves which registered policy pack versions apply to a given
 * PolicyEvaluationInput. Draft/deprecated/superseded versions are
 * "inactive"; revoked versions are reported distinctly so operators can see
 * why a pack no longer governs an action, rather than silently vanishing.
 */
export class PolicyPackApplicabilityService {
  constructor(private readonly store: PolicyPackStore) {}

  resolveApplicability(input: PolicyEvaluationInput): readonly PolicyApplicabilityResult[] {
    const versions = [...this.store.listVersions()].sort((a, b) =>
      a.policyPackId === b.policyPackId ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.policyPackId < b.policyPackId ? -1 : 1,
    );

    return versions.map((version) => this.resolveOne(version, input));
  }

  private resolveOne(version: PolicyPackVersion, input: PolicyEvaluationInput): PolicyApplicabilityResult {
    const base = { policyPackId: version.policyPackId, policyPackVersionId: version.id };

    if (version.status === 'revoked') {
      return {
        ...base,
        type: 'revoked',
        applicable: false,
        reasonCode: 'VERSION_REVOKED',
        reason: `Policy pack version ${version.id} has been revoked and no longer applies.`,
      };
    }

    if (version.status !== 'active') {
      return {
        ...base,
        type: 'inactive',
        applicable: false,
        reasonCode: 'VERSION_INACTIVE',
        reason: `Policy pack version ${version.id} is not active (status=${version.status}).`,
      };
    }

    if (this.isExpired(version, input.requestedAt)) {
      return {
        ...base,
        type: 'expired',
        applicable: false,
        reasonCode: 'VERSION_EXPIRED',
        reason: `Policy pack version ${version.id} is not effective at ${input.requestedAt}.`,
      };
    }

    const scopeMismatch = this.findScopeMismatch(version.scope, input);
    if (scopeMismatch) {
      return {
        ...base,
        type: 'scope_mismatch',
        applicable: false,
        reasonCode: scopeMismatch.reasonCode,
        reason: scopeMismatch.reason,
      };
    }

    return {
      ...base,
      type: 'applicable',
      applicable: true,
      reasonCode: 'SCOPE_MATCHED',
      reason: `Policy pack version ${version.id} applies to this action.`,
    };
  }

  private isExpired(version: PolicyPackVersion, requestedAt: string): boolean {
    const requestedMs = Date.parse(requestedAt);
    if (Date.parse(version.effectiveFrom) > requestedMs) {
      return true;
    }
    if (version.effectiveUntil !== undefined && Date.parse(version.effectiveUntil) < requestedMs) {
      return true;
    }
    return false;
  }

  private findScopeMismatch(scope: PolicyPackScope, input: PolicyEvaluationInput): { reasonCode: string; reason: string } | undefined {
    const checks: readonly ScopeFieldCheck[] = [
      { scopeValues: scope.trustDomainIds, inputValue: input.trustDomainId, inputValues: undefined, reasonCode: 'TRUST_DOMAIN_MISMATCH' },
      { scopeValues: scope.jurisdictions, inputValue: input.jurisdiction, inputValues: undefined, reasonCode: 'JURISDICTION_MISMATCH' },
      { scopeValues: scope.countries, inputValue: input.country, inputValues: undefined, reasonCode: 'COUNTRY_MISMATCH' },
      { scopeValues: scope.industries, inputValue: input.industry, inputValues: undefined, reasonCode: 'INDUSTRY_MISMATCH' },
      { scopeValues: scope.customerIds, inputValue: input.customerId, inputValues: undefined, reasonCode: 'CUSTOMER_MISMATCH' },
      { scopeValues: scope.domains, inputValue: input.domain, inputValues: undefined, reasonCode: 'DOMAIN_MISMATCH' },
      { scopeValues: scope.actions, inputValue: input.action, inputValues: undefined, reasonCode: 'ACTION_MISMATCH' },
      { scopeValues: scope.capabilities, inputValue: input.capability, inputValues: undefined, reasonCode: 'CAPABILITY_MISMATCH' },
      { scopeValues: scope.resourceScopes, inputValue: input.resourceScope, inputValues: undefined, reasonCode: 'RESOURCE_SCOPE_MISMATCH' },
      { scopeValues: scope.actorTypes, inputValue: input.actorType, inputValues: undefined, reasonCode: 'ACTOR_TYPE_MISMATCH' },
      { scopeValues: scope.dataDomains, inputValue: undefined, inputValues: input.dataDomains, reasonCode: 'DATA_DOMAIN_MISMATCH' },
    ];

    for (const check of checks) {
      if (!check.scopeValues || check.scopeValues.length === 0) {
        continue;
      }
      const matches =
        check.inputValues !== undefined
          ? check.inputValues.some((value) => check.scopeValues!.includes(value))
          : check.inputValue !== undefined && check.scopeValues.includes(check.inputValue);

      if (!matches) {
        return { reasonCode: check.reasonCode, reason: `Input does not match required scope for ${check.reasonCode}.` };
      }
    }

    return undefined;
  }
}
