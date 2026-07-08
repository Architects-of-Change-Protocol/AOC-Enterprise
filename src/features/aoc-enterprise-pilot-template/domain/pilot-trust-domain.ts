export type PilotTrustDomainKind = 'internal' | 'customer' | 'external_partner' | 'cross_boundary';

/**
 * Describes the trust domain a pilot template operates in. This is a
 * reference/label only -- the actual trust-domain-scoped decisions still
 * come from Recognition Runtime, Authority Graph and the other AOC runtimes.
 */
export interface PilotTrustDomain {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: PilotTrustDomainKind;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
