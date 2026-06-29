import { createTestSigner } from '@aoc-enterprise/agent-governance';
import type { AgentPassportSignerPort } from '@aoc-enterprise/agent-governance';
import type { IssuerPublicKeyRecord } from '../persistence/issuer-key-repository.js';
import { SqliteIssuerKeyRepository } from '../persistence/sqlite-issuer-key-repository.js';

const DEV_ISSUER_ID = 'AOC-Dev-Governance-Authority';
const DEV_KEY_ID = 'dev-key-1';
const DEV_PUBLIC_KEY = 'dev-hmac-public-metadata-only-not-for-production';

export interface IssuerSignerConfig {
  readonly issuerId: string;
  readonly keyId: string;
  readonly publicKeyPem: string;
  readonly privateKeyPem?: string;
  readonly algorithm: string;
}

export function getIssuerSignerConfigFromEnv(): IssuerSignerConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  const issuerId = process.env.AOC_ISSUER_ID;
  const keyId = process.env.AOC_ISSUER_KEY_ID;
  const privateKeyPem = process.env.AOC_ISSUER_PRIVATE_KEY_PEM;
  const publicKeyPem = process.env.AOC_ISSUER_PUBLIC_KEY_PEM;
  const allowDevSigner = process.env.AOC_ALLOW_DEV_SIGNER === 'true';

  if (issuerId && keyId && privateKeyPem && publicKeyPem) {
    return { issuerId, keyId, publicKeyPem, privateKeyPem, algorithm: 'hmac-sha256' };
  }

  if (isProduction) {
    throw new Error('Production Agent Passport issuer signer requires AOC_ISSUER_ID, AOC_ISSUER_KEY_ID, AOC_ISSUER_PRIVATE_KEY_PEM, and AOC_ISSUER_PUBLIC_KEY_PEM.');
  }

  if (allowDevSigner || process.env.NODE_ENV !== 'production') {
    return {
      issuerId: issuerId ?? DEV_ISSUER_ID,
      keyId: keyId ?? DEV_KEY_ID,
      publicKeyPem: publicKeyPem ?? DEV_PUBLIC_KEY,
      privateKeyPem: privateKeyPem ?? process.env.AOC_DEV_SIGNING_SECRET ?? 'aoc-dev-signing-secret-not-for-production',
      algorithm: 'hmac-sha256',
    };
  }

  throw new Error('Agent Passport issuer signer is not configured.');
}

export function createIssuerSignerFromEnv(): AgentPassportSignerPort {
  const config = getIssuerSignerConfigFromEnv();
  // Current core signer port is algorithm-agnostic. The production boundary keeps
  // private material server-side; this MVP adapter uses the existing HMAC signer
  // until a KMS/HSM signer is introduced.
  return createTestSigner({ keyId: config.keyId, issuer: config.issuerId, secret: config.privateKeyPem });
}

export function getIssuerKeyMetadataFromEnv(): IssuerPublicKeyRecord {
  const config = getIssuerSignerConfigFromEnv();
  const now = new Date().toISOString();
  return {
    issuerId: config.issuerId,
    keyId: config.keyId,
    algorithm: config.algorithm,
    publicKeyPem: config.publicKeyPem,
    status: 'active',
    createdAt: now,
    activatedAt: now,
    metadata: { signerBoundary: 'server-side-env' },
  };
}

export async function ensureConfiguredIssuerKeyRegistered(): Promise<IssuerPublicKeyRecord> {
  const record = getIssuerKeyMetadataFromEnv();
  const repo = new SqliteIssuerKeyRepository();
  await repo.registerKey(record);
  return (await repo.getKey(record.issuerId, record.keyId)) ?? record;
}
