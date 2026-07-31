import { createPublicKey, generateKeyPairSync, sign as signDetached, verify as verifyDetached, type KeyObject } from 'node:crypto';

import { canonicalSerialize } from '../governance-store/canonical-json.js';
import type { AuthorityLeasePayload, SignedAuthorityLease } from './contracts.js';

/**
 * Ed25519 signing for Authority Leases (mission section 3.4). Node's built-in
 * `node:crypto` has native Ed25519 support (no external dependency needed).
 * `canonicalSerialize` (the same `aoc.canonical-json.v1` serializer the
 * Governance Store's digest layer uses) makes the signed bytes deterministic
 * regardless of key insertion order -- required for a signature to verify
 * reproducibly across processes.
 *
 * Trust boundary: `RuntimeAuthoritySigner` is the only thing that ever
 * touches `privateKey`. The Enforcement Gateway is constructed with a
 * `RuntimeAuthorityVerifier` -- verification material only (the public key),
 * per mission section 3.4 ("the enforcement gateway should only need
 * verification material"). In this MVP both live in the same process
 * (single Enterprise Host); see `docs/architecture/ADR-RUNTIME-AUTHORITY.md`
 * "Known limitations" for the production key-separation requirement (signer
 * as an isolated service/HSM, gateway holds only public keys).
 */
export interface RuntimeAuthoritySigner {
  readonly keyId: string;
  signLease(payload: AuthorityLeasePayload): SignedAuthorityLease;
  /** Exposes only the public key, in SPKI DER base64 -- never the private key. */
  exportPublicKey(): string;
}

export interface RuntimeAuthorityVerifier {
  /** Returns `true` iff `lease.signature` is a valid Ed25519 signature over the canonical serialization of `lease.payload`, made by `lease.payload.keyId`. */
  verifyLease(lease: SignedAuthorityLease): boolean;
}

function canonicalLeaseBytes(payload: AuthorityLeasePayload): Buffer {
  return Buffer.from(canonicalSerialize(payload), 'utf8');
}

interface KeyRing {
  readonly keyId: string;
  readonly publicKey: KeyObject;
}

/**
 * In-process Ed25519 keypair generation + signer for the vertical slice.
 * Real deployments replace this with a KMS/HSM-backed signer behind the same
 * `RuntimeAuthoritySigner` interface -- nothing else in this module changes.
 */
export function createEd25519Signer(keyId: string): RuntimeAuthoritySigner {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');

  return {
    keyId,
    signLease(payload: AuthorityLeasePayload): SignedAuthorityLease {
      if (payload.keyId !== keyId) {
        throw new Error(`Lease payload keyId '${payload.keyId}' does not match this signer's keyId '${keyId}'.`);
      }
      const signature = signDetached(null, canonicalLeaseBytes(payload), privateKey);
      return { payload, signature: signature.toString('base64') };
    },
    exportPublicKey(): string {
      return publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    },
  };
}

/**
 * A verifier holding only public keys, keyed by `keyId` -- what the Gateway
 * is constructed with. Supports multiple trusted keys at once so a key
 * rotation never breaks leases issued moments before it.
 */
export function createRuntimeAuthorityVerifier(trustedKeys: readonly KeyRing[]): RuntimeAuthorityVerifier {
  const byKeyId = new Map(trustedKeys.map((entry) => [entry.keyId, entry.publicKey]));

  return {
    verifyLease(lease: SignedAuthorityLease): boolean {
      const publicKey = byKeyId.get(lease.payload.keyId);
      if (publicKey === undefined) return false;
      try {
        const signature = Buffer.from(lease.signature, 'base64');
        return verifyDetached(null, canonicalLeaseBytes(lease.payload), publicKey, signature);
      } catch {
        return false; // malformed base64/signature is a denial, never a throw that could be misread as "unknown" by a caller
      }
    },
  };
}

/** Builds a verifier trusting exactly the keys exported by `signers` -- the common wiring for a single-process composition (signer and gateway share trust, but the gateway object itself never sees a private key). */
export function createVerifierForSigners(signers: readonly RuntimeAuthoritySigner[]): RuntimeAuthorityVerifier {
  return createRuntimeAuthorityVerifier(
    signers.map((signer) => ({
      keyId: signer.keyId,
      publicKey: importSpkiPublicKey(signer.exportPublicKey()),
    })),
  );
}

function importSpkiPublicKey(base64Der: string): KeyObject {
  return createPublicKey({ key: Buffer.from(base64Der, 'base64'), format: 'der', type: 'spki' });
}
