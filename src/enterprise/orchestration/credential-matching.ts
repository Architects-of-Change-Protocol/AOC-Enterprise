import { createHash } from 'node:crypto';

import type { EnterpriseApiKey } from '../configuration/enterprise-configuration.js';

export function extractBearerToken(authorizationHeader: string | undefined): string | undefined {
  if (authorizationHeader === undefined) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  return match?.[1];
}

// Both sides are hashed to fixed-length hex before comparison, so comparison
// time depends on neither the candidate's length nor the position of the
// first differing byte.
function credentialsEqual(candidate: string, configured: string): boolean {
  const candidateDigest = createHash('sha256').update(candidate, 'utf8').digest('hex');
  const configuredDigest = createHash('sha256').update(configured, 'utf8').digest('hex');
  let difference = 0;
  for (let index = 0; index < candidateDigest.length; index += 1) {
    difference |= candidateDigest.charCodeAt(index) ^ configuredDigest.charCodeAt(index);
  }
  return difference === 0;
}

/**
 * Constant-time lookup of a presented bearer token among the configured API
 * keys. Every configured key is always compared, so the match position cannot
 * be inferred from response timing either.
 */
export function matchApiKey(token: string, apiKeys: readonly EnterpriseApiKey[]): EnterpriseApiKey | undefined {
  let matched: EnterpriseApiKey | undefined;
  for (const apiKey of apiKeys) {
    if (credentialsEqual(token, apiKey.key) && matched === undefined) {
      matched = apiKey;
    }
  }
  return matched;
}
