import type { RuntimeFederationEnvelope, RuntimeFederationAttestation } from './runtime-federation-types';

function deterministicHash(value: string): string { let h = 2166136261; for (let i = 0; i < value.length; i += 1) { h ^= value.charCodeAt(i); h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24); } return `f${(h >>> 0).toString(16).padStart(8, '0')}`; }

export function stableStringify(input: unknown): string { if (input === null || typeof input !== 'object') return JSON.stringify(input); if (Array.isArray(input)) return `[${input.map(stableStringify).join(',')}]`; const obj = input as Record<string, unknown>; return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`; }

export function createRuntimeFederationAttestation(envelope: Omit<RuntimeFederationEnvelope, 'attestation'>, attestedAt: string): RuntimeFederationAttestation {
  return { federationIntegrityFingerprint: deterministicHash(stableStringify(envelope.federationMetadata)), continuityIntegrityFingerprint: deterministicHash(stableStringify(envelope.continuity)), replayIntegrityFingerprint: deterministicHash(stableStringify(envelope.replay)), lineageIntegrityFingerprint: deterministicHash(stableStringify(envelope.lineage)), attestedAt, attestationVersion: 1 };
}
