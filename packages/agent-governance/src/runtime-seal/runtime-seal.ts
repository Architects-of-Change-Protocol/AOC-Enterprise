import type { AgentPassportSignerPort } from '../signing/signer-port.js';
import type { AgentPassport } from '../passport/passport-contracts.js';
import { canonicalizeJson, createHashUrn } from '../crypto/canonical-json.js';
import type { AgentRuntimeSeal, AgentRuntimeSealVerificationResult } from './runtime-seal-contracts.js';

const DEFAULT_VERIFICATION_BASE_URL = 'https://aocprotocol.org/verify';

export interface CreateAgentRuntimeSealDeps {
  readonly signer: AgentPassportSignerPort;
  readonly baseVerificationUrl?: string;
  readonly issuer?: string;
}

function buildSealCore(
  passport: AgentPassport,
  issuer: string,
  statusCheckUrl: string,
): Omit<AgentRuntimeSeal, 'signature'> {
  return {
    passportId: passport.passportId,
    passportHash: passport.passportHash,
    constitutionHash: passport.constitutionHash,
    policyManifestHash: passport.policyManifestHash,
    issuer,
    statusCheckUrl,
    issuedAt: passport.issuedAt,
  };
}

export async function createAgentRuntimeSeal(
  passport: AgentPassport,
  deps: CreateAgentRuntimeSealDeps,
): Promise<AgentRuntimeSeal> {
  const baseUrl = (deps.baseVerificationUrl ?? DEFAULT_VERIFICATION_BASE_URL).replace(/\/$/, '');
  const issuer = deps.issuer ?? passport.issuer;
  const statusCheckUrl = `${baseUrl}/${passport.passportId}/status`;

  const sealCore = buildSealCore(passport, issuer, statusCheckUrl);
  const sealPayload = createHashUrn(canonicalizeJson(sealCore));
  const signature = await deps.signer.sign(sealPayload);

  return { ...sealCore, signature };
}

export interface VerifyAgentRuntimeSealDeps {
  readonly signer: AgentPassportSignerPort;
}

export interface VerifyAgentRuntimeSealOptions {
  readonly allowIssued?: boolean;
}

export async function verifyAgentRuntimeSeal(
  seal: AgentRuntimeSeal,
  passport: AgentPassport,
  deps: VerifyAgentRuntimeSealDeps,
  options?: VerifyAgentRuntimeSealOptions,
): Promise<AgentRuntimeSealVerificationResult> {
  const reasonCodes: string[] = [];
  let valid = true;

  const allowedStatuses = options?.allowIssued === true ? ['active', 'issued'] : ['active'];

  if (!allowedStatuses.includes(passport.status)) {
    if (passport.status === 'revoked') {
      reasonCodes.push('passport.revoked');
    } else if (passport.status === 'expired') {
      reasonCodes.push('passport.expired');
    } else {
      reasonCodes.push('passport.status_not_active');
    }
    valid = false;
  }

  if (seal.passportId !== passport.passportId) {
    reasonCodes.push('runtime_seal.passport_mismatch');
    valid = false;
  }

  const hashMismatch =
    seal.passportHash !== passport.passportHash ||
    seal.constitutionHash !== passport.constitutionHash ||
    seal.policyManifestHash !== passport.policyManifestHash;

  if (hashMismatch) {
    reasonCodes.push('runtime_seal.hash_mismatch');
    valid = false;
  }

  const sealCore = buildSealCore(passport, seal.issuer, seal.statusCheckUrl);
  const sealPayload = createHashUrn(canonicalizeJson(sealCore));
  const signatureValid = await deps.signer.verify(sealPayload, seal.signature);

  if (!signatureValid) {
    reasonCodes.push('runtime_seal.invalid_signature');
    valid = false;
  }

  if (valid) {
    reasonCodes.push('runtime_seal.valid');
  }

  return { valid, reasonCodes };
}
