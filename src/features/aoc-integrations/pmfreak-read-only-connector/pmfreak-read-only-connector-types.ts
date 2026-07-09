/**
 * AOC PMFreak Read-Only Connector v1 -- shared environment/source-kind types.
 *
 * These enums are consumed by the connector config, source interface,
 * snapshot, and health models -- kept in one module so they never drift
 * across those files.
 */

export type AocPMFreakReadOnlyConnectorEnvironment = 'demo' | 'development' | 'staging' | 'production';

export type AocPMFreakReadOnlyConnectorSourceKind = 'in_memory' | 'api' | 'database' | 'supabase' | 'unknown';
