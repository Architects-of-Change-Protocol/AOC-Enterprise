import {
  ENTERPRISE_LICENSE_SCHEMA_VERSION,
  enterpriseLicenseMandateAuthorizes,
  enterpriseLicenseTermsWithin,
  type EnterpriseLicensableRightType,
  type EnterpriseLicenseExclusivity,
  type EnterpriseLicenseMandate,
  type EnterpriseLicenseRightsScope,
  type EnterpriseLicenseTerms,
  type EnterpriseLicensedUnits,
  type EnterpriseLicensedUseType,
} from '@aoc-enterprise/license-mandate';

import { LicenseGovernanceError } from './errors.js';
import type { LicenseMandateRecord, LicenseMandateStatus } from './contracts.js';

/**
 * The LicenseMandate lifecycle state machine — deliberately two stored
 * states, `'active' -> 'revoked'`, exactly mirroring
 * `EnterpriseLicenseMandateStatus`, which in turn mirrors
 * `EnterpriseAccessGrantStatus`'s own two-state rationale.
 *
 * Every other state a caller might reasonably ask about is *derived* here
 * rather than stored, so it can never disagree with the facts it is derived
 * from:
 *
 * - `expired` — derived from `effectiveFrom`/`expiresAt` against the instant
 *   being asked about. Note this is the *authorization's* expiry, not the
 *   external license's.
 * - `exhausted` — derived from recorded execution evidence measured against
 *   `terms.constraints.additionalLicensesAllowed`.
 * - `superseded` — deliberately not modelled at all: it is a relationship
 *   between two mandates, not a property of either.
 * - `terminated` / `lapsed` — deliberately not modelled as mandate state at
 *   all. See below.
 *
 * ## Revocation is not termination
 *
 * This is the distinction that matters most for this action, and it is the
 * licensing analogue of "revocation is not release" for collateral.
 *
 * Revoking a mandate withdraws the authority to grant *additional* external
 * licenses from that moment. It does **not** terminate, cancel, rescind, or
 * invalidate a license an external system has already granted — Soberanía governs
 * authority and does not pretend to hold legal or contractual powers over an
 * agreement it never executed and is not a party to. Execution evidence
 * recorded before revocation is preserved immutably, and the revocation
 * record itself preserves the execution count at the moment authority was
 * withdrawn.
 *
 * Conversely, an external system *reporting* that a license expired or was
 * terminated is an observation, not a governance act: it is recorded as
 * `LicenseLifecycleRecord` and changes neither the mandate's status nor its
 * execution count. Decrementing the count on an unverified report would
 * silently manufacture fresh licensing capacity, which is precisely the
 * escalation this module exists to prevent.
 *
 * Authorizing a *termination* (rather than merely observing one) would be a
 * separate governed action with its own request, decision and mandate. It is
 * deliberately not implemented here, and neither are `SUBLICENSE` or
 * `ASSIGN_LICENSE`.
 */
export function assertLicenseRevocable(status: LicenseMandateStatus): void {
  if (status === 'revoked') {
    throw new LicenseGovernanceError('LICENSE_MANDATE_NOT_ACTIVE', 'This license mandate has already been revoked.');
  }
}

export function assertLicenseActive(status: LicenseMandateStatus): void {
  if (status !== 'active') {
    throw new LicenseGovernanceError(
      'LICENSE_MANDATE_NOT_ACTIVE',
      'This license mandate is not active; no further external licensing is authorized under it.',
    );
  }
}

/**
 * The single guard preventing a narrower request from becoming a wider
 * authorization. Enforced at the persistence boundary (not only in the
 * orchestration that normally copies terms verbatim), so no future second
 * write path can quietly turn `display` into `distribute`, `non-exclusive`
 * into `exclusive`, or Company B into Company C.
 */
export function assertNoLicensePermissionEscalation(terms: EnterpriseLicenseTerms, requestedTerms: EnterpriseLicenseTerms): void {
  if (!enterpriseLicenseTermsWithin(terms, requestedTerms)) {
    throw new LicenseGovernanceError(
      'LICENSE_PERMISSION_ESCALATION',
      'A license mandate may narrow the terms that were requested, never widen them: the proposed mandate terms are not contained by the requested terms.',
      {
        requestedLicenseeRef: requestedTerms.licenseeRef,
        mandateLicenseeRef: terms.licenseeRef,
        requestedPermittedUses: requestedTerms.permittedUses,
        mandatePermittedUses: terms.permittedUses,
        requestedExclusivity: requestedTerms.exclusivity,
        mandateExclusivity: terms.exclusivity,
        requestedRightsScope: requestedTerms.rightsScope,
        mandateRightsScope: terms.rightsScope,
      },
    );
  }
}

/** Projects a durable record back onto the canonical, pure `EnterpriseLicenseMandate` shape so authorization is decided by the frozen contract, never by a second copy of its rules living here. */
export function toCanonicalLicenseMandate(record: LicenseMandateRecord): EnterpriseLicenseMandate {
  return {
    schemaVersion: ENTERPRISE_LICENSE_SCHEMA_VERSION,
    id: record.id,
    status: record.status,
    asset: {
      kind: record.assetKind,
      id: record.assetId,
      ...(record.assetTenantId !== undefined ? { tenantId: record.assetTenantId } : {}),
    },
    terms: record.terms,
    requestRef: record.requestRef,
    requestedBy: record.requestedBy,
    decisionRef: record.decisionRef,
    effectiveFrom: record.effectiveFrom,
    expiresAt: record.expiresAt,
    correlationId: record.correlationId,
    ...(record.evaluationRef !== undefined ? { evaluationRef: record.evaluationRef } : {}),
    ...(record.issuerRef !== undefined ? { issuerRef: record.issuerRef } : {}),
    ...(record.approvalRefs !== undefined ? { approvalRefs: record.approvalRefs } : {}),
    ...(record.obligationRefs !== undefined ? { obligationRefs: record.obligationRefs } : {}),
    ...(record.evidenceRefs !== undefined ? { evidenceRefs: record.evidenceRefs } : {}),
    ...(record.auditRefs !== undefined ? { auditRefs: record.auditRefs } : {}),
  };
}

export interface LicenseExerciseProposal {
  readonly executedBy: string;
  readonly licenseeRef: string;
  readonly rights: readonly EnterpriseLicensableRightType[];
  readonly grantedUses: readonly EnterpriseLicensedUseType[];
  readonly exclusivity: EnterpriseLicenseExclusivity;
  readonly executedAt: string;
  readonly rightsScope?: EnterpriseLicenseRightsScope;
  readonly contexts?: Readonly<Record<string, readonly string[]>>;
  readonly licenseExpiresAt?: string;
  readonly licensedUnits?: EnterpriseLicensedUnits;
  readonly externalAgreementReference?: string;
}

/**
 * Decides whether a durable mandate record authorizes one proposed external
 * license, delegating the decision itself entirely to the canonical
 * `enterpriseLicenseMandateAuthorizes`. Throws
 * `LICENSE_EXECUTION_NOT_AUTHORIZED` carrying the contract's own refusal code,
 * so callers see exactly why — revoked, expired, wrong executor, wrong
 * licensee, unauthorized rights, unauthorized or explicitly excluded use,
 * exclusivity above what was granted, a rights-scope claim outside (or
 * incommensurable with) the mandate's, an operating context outside the
 * permitted one, a term running past the ceiling, a unit count over the
 * ceiling, a missing required agreement reference, or a second grant under a
 * mandate that permits only one.
 *
 * `externalAgreementReference` is passed as a presence flag rather than a
 * value: the constraint asks whether a reference was reported, and Soberanía never
 * interprets, resolves, or verifies what the reference names.
 */
export function assertLicenseExerciseAuthorized(record: LicenseMandateRecord, proposal: LicenseExerciseProposal): void {
  const result = enterpriseLicenseMandateAuthorizes(toCanonicalLicenseMandate(record), {
    executedBy: proposal.executedBy,
    licenseeRef: proposal.licenseeRef,
    rights: proposal.rights,
    grantedUses: proposal.grantedUses,
    exclusivity: proposal.exclusivity,
    at: proposal.executedAt,
    priorExecutionCount: record.executionCount,
    hasExternalAgreementReference: proposal.externalAgreementReference !== undefined,
    ...(proposal.rightsScope !== undefined ? { rightsScope: proposal.rightsScope } : {}),
    ...(proposal.contexts !== undefined ? { contexts: proposal.contexts } : {}),
    ...(proposal.licenseExpiresAt !== undefined ? { licenseExpiresAt: proposal.licenseExpiresAt } : {}),
    ...(proposal.licensedUnits !== undefined ? { licensedUnits: proposal.licensedUnits } : {}),
  });
  if (!result.authorized) {
    throw new LicenseGovernanceError('LICENSE_EXECUTION_NOT_AUTHORIZED', result.reason, {
      refusalCode: result.code,
      mandateId: record.id,
    });
  }
}
