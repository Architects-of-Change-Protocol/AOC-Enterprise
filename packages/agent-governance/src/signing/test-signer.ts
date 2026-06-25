import { createHmac } from 'crypto';
import type { AgentPassportSignature, AgentPassportSignerPort } from './signer-port.js';

const TEST_ALGORITHM = 'hmac-sha256';

export interface TestSignerOptions {
  readonly keyId?: string;
  readonly issuer?: string;
  readonly secret?: string;
}

export function createTestSigner(options?: TestSignerOptions): AgentPassportSignerPort {
  const keyId = options?.keyId ?? 'test-key-1';
  const issuer = options?.issuer ?? 'AOC-Test-Issuer';
  const secret = options?.secret ?? 'aoc-test-signing-secret-do-not-use-in-production';

  function computeHmac(payload: string): string {
    return createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
  }

  return {
    async sign(payload: string): Promise<AgentPassportSignature> {
      return {
        algorithm: TEST_ALGORITHM,
        keyId,
        signature: computeHmac(payload),
        signedAt: new Date().toISOString(),
        issuer,
      };
    },
    async verify(payload: string, signature: AgentPassportSignature): Promise<boolean> {
      if (signature.algorithm !== TEST_ALGORITHM || signature.keyId !== keyId) {
        return false;
      }
      return computeHmac(payload) === signature.signature;
    },
  };
}
