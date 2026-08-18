export { AuthorityChainRequiredPolicy } from './authority-chain-required-policy.js';
export { SelfIssuancePolicy } from './self-issuance-policy.js';
export { IssuerAuthorityPolicy } from './issuer-authority-policy.js';
export { AncestorRevocationPolicy } from './ancestor-revocation-policy.js';
export { AncestorExpirationPolicy } from './ancestor-expiration-policy.js';
export { DelegationLineagePolicy } from './delegation-lineage-policy.js';
export { DelegationScopePolicy } from './delegation-scope-policy.js';
export { DelegationDepthPolicy } from './delegation-depth-policy.js';
export { NonDelegableActionPolicy } from './non-delegable-action-policy.js';
export { CrossDomainAuthorityPolicy } from './cross-domain-authority-policy.js';

import { AuthorityChainRequiredPolicy } from './authority-chain-required-policy.js';
import { SelfIssuancePolicy } from './self-issuance-policy.js';
import { IssuerAuthorityPolicy } from './issuer-authority-policy.js';
import { AncestorRevocationPolicy } from './ancestor-revocation-policy.js';
import { AncestorExpirationPolicy } from './ancestor-expiration-policy.js';
import { DelegationLineagePolicy } from './delegation-lineage-policy.js';
import { DelegationScopePolicy } from './delegation-scope-policy.js';
import { DelegationDepthPolicy } from './delegation-depth-policy.js';
import { NonDelegableActionPolicy } from './non-delegable-action-policy.js';
import { CrossDomainAuthorityPolicy } from './cross-domain-authority-policy.js';
import type { AuthorityPolicy } from '../domain/authority-chain.js';

// Precedence order: is there a chain at all, then who could have forged it (self-issuance,
// issuer authority), then whether its ancestors are still alive (revocation, expiration),
// then whether the chain is a real derivation at all (lineage), then whether it was
// legitimately narrowed (scope, depth, non-delegable), then domain boundary.
//
// Lineage sits after liveness and before narrowing on purpose. An ancestor that
// was revoked should report the revocation an operator performed rather than the
// structural consequence of it, and a chain that never terminated at a root
// should be refused before there is any discussion of how well it narrows.
export function createDefaultAuthorityPolicyChain(): readonly AuthorityPolicy[] {
  return [
    new AuthorityChainRequiredPolicy(),
    new SelfIssuancePolicy(),
    new IssuerAuthorityPolicy(),
    new AncestorRevocationPolicy(),
    new AncestorExpirationPolicy(),
    new DelegationLineagePolicy(),
    new DelegationScopePolicy(),
    new DelegationDepthPolicy(),
    new NonDelegableActionPolicy(),
    new CrossDomainAuthorityPolicy(),
  ];
}
