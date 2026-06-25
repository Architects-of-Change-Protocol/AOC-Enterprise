import type { AgentPassportSignerPort } from '../signing/signer-port.js';
import { canonicalizeJson, createHashUrn } from '../crypto/canonical-json.js';
import { extractPassportHashableCore } from './passport-hash-core.js';
import type { AgentPassport, AgentPassportVerificationResult } from './passport-contracts.js';

export interface VerifyAgentPassportDeps {
  readonly signer: AgentPassportSignerPort;
}

export async function verifyAgentPassport(
  passport: AgentPassport,
  deps: VerifyAgentPassportDeps,
): Promise<AgentPassportVerificationResult> {
  const reasonCodes: string[] = [];
  let valid = true;

  if (passport.status === 'revoked') {
    reasonCodes.push('passport.revoked');
    valid = false;
  } else if (passport.status === 'expired') {
    reasonCodes.push('passport.expired');
    valid = false;
  } else if (passport.status === 'suspended' || passport.status === 'draft') {
    reasonCodes.push('passport.status_not_active');
    valid = false;
  }

  if (!passport.constitutionHash) {
    reasonCodes.push('passport.missing_constitution_hash');
    valid = false;
  }

  if (!passport.policyManifestHash) {
    reasonCodes.push('passport.missing_policy_manifest_hash');
    valid = false;
  }

  const expectedHash = createHashUrn(
    canonicalizeJson(extractPassportHashableCore(passport)),
  );

  if (expectedHash !== passport.passportHash) {
    reasonCodes.push('passport.invalid_hash');
    valid = false;
  }

  const signatureValid = await deps.signer.verify(passport.passportHash, passport.signature);
  if (!signatureValid) {
    reasonCodes.push('passport.invalid_signature');
    valid = false;
  }

  if (valid) {
    reasonCodes.push('passport.valid');
  }

  return { valid, reasonCodes, verifiedAt: new Date().toISOString() };
}
