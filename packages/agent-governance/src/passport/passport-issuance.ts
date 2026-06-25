import type { AgentEnrollmentInput } from '../enrollment/enrollment-contracts.js';
import type { AgentPassportSignerPort } from '../signing/signer-port.js';
import { generateAgentPassportId } from './passport-id.js';
import { createAgentConstitution } from '../constitution/constitution.js';
import { createAgentPolicyManifest } from '../policy-manifest/policy-manifest.js';
import { canonicalizeJson, createHashUrn } from '../crypto/canonical-json.js';
import { createAgentRuntimeSeal } from '../runtime-seal/runtime-seal.js';
import { createPassportEvent } from '../events/passport-events.js';
import { extractPassportHashableCore } from './passport-hash-core.js';
import type { AgentPassport, IssuedAgentPassportBundle, AgentPassportPublicVerificationPayload } from './passport-contracts.js';
import type { AgentPassportId } from './passport-id.js';

const DEFAULT_VERIFICATION_BASE_URL = 'https://aocprotocol.org/verify';
const DEFAULT_ISSUER = 'AOC-Governance-Authority';

export function createAgentPassportVerificationUrl(
  passportId: AgentPassportId,
  baseUrl?: string,
): string {
  const base = (baseUrl ?? DEFAULT_VERIFICATION_BASE_URL).replace(/\/$/, '');
  return `${base}/${passportId}`;
}

export function createAgentPassportQrPayload(
  passportId: AgentPassportId,
  baseUrl?: string,
): string {
  return createAgentPassportVerificationUrl(passportId, baseUrl);
}

export function createAgentPassportPublicVerificationPayload(
  passport: AgentPassport,
): AgentPassportPublicVerificationPayload {
  return {
    passportId: passport.passportId,
    agentName: passport.agentName,
    ownerName: passport.ownerName,
    purpose: passport.purpose,
    status: passport.status,
    governanceLevel: passport.governanceLevel,
    riskTier: passport.riskTier,
    autonomyLevel: passport.autonomyLevel,
    jurisdiction: passport.jurisdiction,
    constitutionHash: passport.constitutionHash,
    policyManifestHash: passport.policyManifestHash,
    passportHash: passport.passportHash,
    issuer: passport.issuer,
    issuedAt: passport.issuedAt,
    ...(passport.lastVerifiedAt !== undefined
      ? { lastVerifiedAt: passport.lastVerifiedAt }
      : {}),
    verificationUrl: passport.verificationUrl,
  };
}

export interface IssueAgentPassportDeps {
  readonly signer: AgentPassportSignerPort;
  readonly baseVerificationUrl?: string;
  readonly issuer?: string;
}

export async function issueAgentPassport(
  input: AgentEnrollmentInput,
  deps: IssueAgentPassportDeps,
): Promise<IssuedAgentPassportBundle> {
  const baseUrl = deps.baseVerificationUrl ?? DEFAULT_VERIFICATION_BASE_URL;
  const issuer = deps.issuer ?? DEFAULT_ISSUER;
  const jurisdiction = input.region ?? input.jurisdiction ?? 'GLOBAL';

  const passportId = generateAgentPassportId({
    issuedAt: input.issuedAt,
    region: jurisdiction,
  });

  const constitution = createAgentConstitution(input, passportId);
  const policyManifest = createAgentPolicyManifest(input, passportId);

  const constitutionHash = createHashUrn(canonicalizeJson(constitution));
  const policyManifestHash = createHashUrn(canonicalizeJson(policyManifest));

  const hashableCore = extractPassportHashableCore({
    passportId,
    agentName: input.agentName,
    ownerId: input.ownerId,
    ownerName: input.ownerName,
    purpose: input.purpose,
    governanceLevel: 'constitutional',
    riskTier: input.riskTier,
    autonomyLevel: input.autonomyLevel,
    jurisdiction,
    constitutionVersion: constitution.version,
    constitutionHash,
    policyManifestVersion: policyManifest.version,
    policyManifestHash,
    issuedAt: input.issuedAt,
    issuer,
  });

  const passportHash = createHashUrn(canonicalizeJson(hashableCore));
  const signature = await deps.signer.sign(passportHash);

  const verificationUrl = createAgentPassportVerificationUrl(passportId, baseUrl);
  const qrPayload = createAgentPassportQrPayload(passportId, baseUrl);

  const passport: AgentPassport = {
    ...hashableCore,
    status: 'issued',
    passportHash,
    signature,
    verificationUrl,
    qrPayload,
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
  };

  const runtimeSeal = await createAgentRuntimeSeal(passport, deps);

  const events = [
    createPassportEvent({
      passportId,
      type: 'agent_passport.drafted',
      actorId: input.createdBy,
      reasonCodes: ['passport.draft_created'],
    }),
    createPassportEvent({
      passportId,
      type: 'agent_passport.issued',
      actorId: input.createdBy,
      reasonCodes: ['passport.issued'],
    }),
    createPassportEvent({
      passportId,
      type: 'agent_passport.runtime_seal_created',
      actorId: issuer,
      reasonCodes: ['runtime_seal.valid'],
    }),
  ];

  return { passport, constitution, policyManifest, runtimeSeal, events };
}
