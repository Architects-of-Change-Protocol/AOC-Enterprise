import { computeDigest } from '../governance-store/digest.js';
import { AOC_CANONICALIZATION_VERSION } from '../governance-store/canonical-json.js';
import { AgentPassportError } from './errors.js';
import type { AgentPassport, AgentPassportClaim, AgentPassportView, AgentPassportViewType, PassportEvidenceReference } from './contracts.js';

/**
 * Passport disclosure views (mission section 21-23). The full Passport must
 * not always be exposed -- a view is a *derived*, pure projection; building
 * one never mutates the Passport, mirroring the Evidence Bundle's
 * `Truth ≠ Disclosure` principle. Field sets are NOT assumed identical to
 * Evidence disclosure policies -- Passport views classify Passport fields on
 * their own terms.
 */

export const AGENT_PASSPORT_VIEW_TYPES: readonly AgentPassportViewType[] = ['INTERNAL', 'AUDITOR', 'PARTNER', 'CUSTOMER', 'PUBLIC'];

export function isAgentPassportViewType(value: string): value is AgentPassportViewType {
  return (AGENT_PASSPORT_VIEW_TYPES as readonly string[]).includes(value);
}

function deriveClaims(passport: AgentPassport): readonly AgentPassportClaim[] {
  const claims: AgentPassportClaim[] = [];

  claims.push({
    claimType: 'passport.active',
    value: passport.status === 'active',
    issuedAt: passport.lifecycle.enteredAt,
    status: passport.status === 'revoked' ? 'revoked' : 'active',
  });

  claims.push({
    claimType: 'passport.not-revoked',
    value: passport.status !== 'revoked',
    issuedAt: passport.lifecycle.enteredAt,
    status: 'active',
  });

  claims.push({
    claimType: 'organization.bound',
    value: passport.organization.organizationId,
    issuedAt: passport.organization.boundAt,
    status: 'active',
  });

  if (passport.capabilities.length > 0) {
    claims.push({
      claimType: 'capability.referenced',
      value: passport.capabilities.length,
      issuedAt: passport.lifecycle.enteredAt,
      status: 'active',
    });
  }

  if (passport.authorities.length > 0) {
    claims.push({
      claimType: 'authority.referenced',
      value: passport.authorities.length,
      issuedAt: passport.lifecycle.enteredAt,
      status: 'active',
    });
  }

  if (passport.evidenceReferences.length > 0) {
    const latest = passport.evidenceReferences[passport.evidenceReferences.length - 1];
    claims.push({
      claimType: 'evidence.verified-reference',
      value: passport.evidenceReferences.length,
      issuedAt: passport.lifecycle.enteredAt,
      status: 'active',
      ...(latest !== undefined ? { evidenceBundleId: latest.bundleId } : {}),
    });
  }

  if (passport.governanceReferences.length > 0) {
    claims.push({
      claimType: 'governance.history-present',
      value: passport.governanceReferences.length,
      issuedAt: passport.lifecycle.enteredAt,
      status: 'active',
    });
  }

  return claims;
}

const CLAIM_VISIBILITY: Readonly<Record<AgentPassportViewType, readonly string[] | undefined>> = {
  INTERNAL: undefined, // undefined => all claims visible
  AUDITOR: undefined,
  PARTNER: ['passport.active', 'passport.not-revoked', 'organization.bound', 'capability.referenced'],
  CUSTOMER: ['passport.active', 'passport.not-revoked'],
  PUBLIC: ['passport.not-revoked'],
};

function claimsForView(passport: AgentPassport, viewType: AgentPassportViewType): readonly AgentPassportClaim[] {
  const all = deriveClaims(passport);
  const allowList = CLAIM_VISIBILITY[viewType];
  if (allowList === undefined) return all;
  return all.filter((claim) => allowList.includes(claim.claimType));
}

function evidenceReferencesForView(passport: AgentPassport, viewType: AgentPassportViewType): readonly PassportEvidenceReference[] {
  return viewType === 'INTERNAL' || viewType === 'AUDITOR' ? passport.evidenceReferences : [];
}

function subjectForView(passport: AgentPassport, viewType: AgentPassportViewType): Record<string, unknown> {
  const { subject, organization } = passport;
  switch (viewType) {
    case 'INTERNAL':
      return {
        agentId: subject.agentId,
        agentType: subject.agentType,
        displayName: subject.displayName,
        description: subject.description,
        modelProvider: subject.modelProvider,
        modelFamily: subject.modelFamily,
        systemOwnerId: subject.systemOwnerId,
        operationalOwnerId: subject.operationalOwnerId,
        organizationId: organization.organizationId,
        workspaceId: organization.workspaceId,
        departmentId: organization.departmentId,
      };
    case 'AUDITOR':
      return {
        agentId: subject.agentId,
        agentType: subject.agentType,
        displayName: subject.displayName,
        organizationId: organization.organizationId,
      };
    case 'PARTNER':
      return {
        agentId: subject.agentId,
        agentType: subject.agentType,
        displayName: subject.displayName,
        organizationId: organization.organizationId,
      };
    case 'CUSTOMER':
      return {
        agentType: subject.agentType,
        displayName: subject.displayName,
      };
    case 'PUBLIC':
      return {
        passportId: passport.passportId,
      };
  }
}

export interface BuildPassportViewInput {
  readonly passport: AgentPassport;
  readonly viewType: string;
  readonly generatedBy: string;
  readonly now: () => string;
  readonly nextId: (prefix: string) => string;
}

/** Builds one minimal-disclosure `AgentPassportView` from a reconstructed `AgentPassport`. Pure -- never touches the Store. */
export function buildAgentPassportView(input: BuildPassportViewInput): AgentPassportView {
  if (!isAgentPassportViewType(input.viewType)) {
    throw new AgentPassportError('PASSPORT_VALIDATION_ERROR', `Unknown Passport view type '${input.viewType}'.`, {
      validTypes: AGENT_PASSPORT_VIEW_TYPES,
    });
  }
  const viewType = input.viewType;
  const { passport } = input;

  const subject = subjectForView(passport, viewType);
  const claims = claimsForView(passport, viewType);
  const evidenceReferences = evidenceReferencesForView(passport, viewType);

  const passportStateDigest = computeDigest({
    passportId: passport.passportId,
    status: passport.status,
    updatedThroughEventId: passport.updatedThroughEventId,
    integrity: passport.integrity,
  });

  const viewDigestPayload = {
    viewType,
    passportId: passport.passportId,
    subject,
    status: passport.status,
    claims,
    evidenceReferences,
    passportStateDigest,
  };
  const viewDigest = computeDigest(viewDigestPayload);

  return {
    viewId: input.nextId('passport-view'),
    passportId: passport.passportId,
    viewType,
    generatedAt: input.now(),
    generatedBy: input.generatedBy,
    subject,
    status: passport.status,
    claims,
    evidenceReferences,
    provenance: {
      passportStateDigest,
      sourceUpdatedThroughEventId: passport.updatedThroughEventId,
    },
    integrity: {
      algorithm: 'sha256',
      canonicalizationVersion: AOC_CANONICALIZATION_VERSION,
      viewDigest,
    },
  };
}
