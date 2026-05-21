export const CANONICAL_CONTRACTS_VERSION = '0.1.0' as const;
export const CANONICAL_CONTRACTS_SCHEMA_DATE = '2026-05-21' as const;

export interface ContractVersionMetadata {
  readonly version: typeof CANONICAL_CONTRACTS_VERSION;
  readonly schemaDate: typeof CANONICAL_CONTRACTS_SCHEMA_DATE;
  readonly backwardCompatibleFrom: string;
}

export const CONTRACT_VERSION_METADATA: ContractVersionMetadata = {
  version: CANONICAL_CONTRACTS_VERSION,
  schemaDate: CANONICAL_CONTRACTS_SCHEMA_DATE,
  backwardCompatibleFrom: '0.1.0',
} as const;
