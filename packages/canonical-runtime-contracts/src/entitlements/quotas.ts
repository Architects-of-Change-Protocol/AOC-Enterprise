import type { QuotaIdentifier } from './billing.js';

export interface QuotaLimit {
  readonly identifier: QuotaIdentifier;
  readonly limit: number;
  readonly windowSeconds?: number;
}

export interface QuotaUsage {
  readonly identifier: QuotaIdentifier;
  readonly used: number;
  readonly limit: number;
  readonly windowSeconds?: number;
  readonly resetAt?: string;
}

export interface QuotaEnforcement {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly reasonCode?: string;
}

export interface UsageMeteringRecord {
  readonly identifier: QuotaIdentifier;
  readonly tenantId: string;
  readonly orgId?: string;
  readonly quantity: number;
  readonly recordedAt: string;
  readonly correlationId?: string;
}
