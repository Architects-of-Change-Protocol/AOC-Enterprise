/**
 * Development/MVP signer.
 *
 * WARNING: Uses a test HMAC signer. NOT for production.
 * In production, replace with a KMS-backed signer that holds a real signing key.
 */

import { createTestSigner } from '@aoc-enterprise/agent-governance';
import type { AgentPassportSignerPort } from '@aoc-enterprise/agent-governance';

export function createDevSigner(): AgentPassportSignerPort {
  return createTestSigner({
    keyId: 'dev-key-1',
    issuer: 'AOC-Dev-Issuer',
    secret: process.env.AOC_DEV_SIGNING_SECRET ?? 'aoc-dev-signing-secret-not-for-production',
  });
}
