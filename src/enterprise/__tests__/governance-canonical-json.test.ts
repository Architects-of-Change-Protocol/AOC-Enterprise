import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AOC_CANONICALIZATION_VERSION, CanonicalSerializationError, canonicalSerialize } from '../governance-store/canonical-json.js';
import { computeDigest, isWellFormedDigest } from '../governance-store/digest.js';
import { DEFAULT_SENSITIVE_KEY_TERMS, GOVERNANCE_REDACTED_VALUE, isSensitiveKey, redactSensitiveValues } from '../governance-store/redaction.js';
import { computeAggregateDigest } from '../governance-store/projection.js';

describe('canonical serialization (aoc.canonical-json.v1)', () => {
  it('orders object keys deterministically regardless of insertion order, including nested objects', () => {
    const a = { b: 1, a: { z: true, y: 'x' }, c: [1, 2] };
    const b = { c: [1, 2], a: { y: 'x', z: true }, b: 1 };
    assert.equal(canonicalSerialize(a), canonicalSerialize(b));
    assert.equal(canonicalSerialize(a), '{"a":{"y":"x","z":true},"b":1,"c":[1,2]}');
  });

  it('preserves array order — order is data, not noise', () => {
    assert.notEqual(canonicalSerialize([1, 2]), canonicalSerialize([2, 1]));
  });

  it('serializes null explicitly and omits undefined-valued object properties', () => {
    assert.equal(canonicalSerialize({ a: null, b: undefined, c: 1 }), '{"a":null,"c":1}');
    assert.equal(canonicalSerialize({ a: null }), canonicalSerialize({ a: null, ghost: undefined }));
  });

  it('serializes undefined array elements as null (position is preserved)', () => {
    assert.equal(canonicalSerialize([1, undefined, 3]), '[1,null,3]');
  });

  it('serializes Date instances as their ISO-8601 UTC string', () => {
    assert.equal(canonicalSerialize(new Date('2026-01-01T00:00:00.000Z')), '"2026-01-01T00:00:00.000Z"');
  });

  it('handles Unicode, booleans, and numbers deterministically (including -0 normalization)', () => {
    assert.equal(canonicalSerialize({ s: 'héllo ✓ 日本語', t: true, f: false }), '{"f":false,"s":"héllo ✓ 日本語","t":true}');
    assert.equal(canonicalSerialize(-0), canonicalSerialize(0));
  });

  it('produces identical output on repeated calls and never mutates the source', () => {
    const source = { b: [3, 1], a: { nested: 'v' } };
    const snapshot = JSON.stringify(source);
    const first = canonicalSerialize(source);
    const second = canonicalSerialize(source);
    assert.equal(first, second);
    assert.equal(JSON.stringify(source), snapshot);
  });

  it('rejects unsupported values (bigint, function, non-finite numbers, circular references) instead of silently dropping them', () => {
    assert.throws(() => canonicalSerialize({ big: 1n }), CanonicalSerializationError);
    assert.throws(() => canonicalSerialize({ fn: () => 1 }), CanonicalSerializationError);
    assert.throws(() => canonicalSerialize({ n: Number.POSITIVE_INFINITY }), CanonicalSerializationError);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    assert.throws(() => canonicalSerialize(circular), CanonicalSerializationError);
  });
});

describe('digest generation (SHA-256 over canonical serialization)', () => {
  it('produces the sha256:<hex> format', () => {
    const digest = computeDigest({ a: 1 });
    assert.match(digest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(isWellFormedDigest(digest), true);
  });

  it('same logical input (different key insertion order) → same digest', () => {
    assert.equal(computeDigest({ a: 1, b: 2 }), computeDigest({ b: 2, a: 1 }));
  });

  it('changed content or changed array ordering → changed digest', () => {
    assert.notEqual(computeDigest({ a: 1 }), computeDigest({ a: 2 }));
    assert.notEqual(computeDigest({ codes: ['A', 'B'] }), computeDigest({ codes: ['B', 'A'] }));
  });

  it('rejects an unsupported canonicalization version rather than producing incomparable digests', () => {
    assert.throws(() => computeDigest({ a: 1 }, 'aoc.canonical-json.v99'));
    assert.equal(AOC_CANONICALIZATION_VERSION, 'aoc.canonical-json.v1');
  });

  it('a changed component digest changes the aggregate digest', () => {
    const base = {
      requestDigest: computeDigest('r'),
      evaluationDigest: computeDigest('e'),
      traceDigest: computeDigest('t'),
      eventsDigest: computeDigest('ev'),
      metadataDigest: computeDigest('m'),
    };
    const aggregate = computeAggregateDigest(base);
    assert.notEqual(computeAggregateDigest({ ...base, evaluationDigest: computeDigest('e2') }), aggregate);
    assert.notEqual(computeAggregateDigest({ ...base, previousAggregateDigest: aggregate }), aggregate);
  });
});

describe('deterministic redaction', () => {
  it('redacts the default sensitive key classes across casings and separators', () => {
    for (const key of ['authorization', 'Authorization', 'accessToken', 'access_token', 'REFRESH-TOKEN', 'apiKey', 'api_key', 'secret', 'password', 'privateKey', 'cookie', 'session', 'credential']) {
      assert.equal(isSensitiveKey(key), true, `${key} must be sensitive`);
    }
  });

  it('keeps *Id reference keys — a token ID names a governed object, it is not the secret', () => {
    for (const key of ['capabilityTokenId', 'approvalProofId', 'sessionId', 'credentialIds']) {
      assert.equal(isSensitiveKey(key), false, `${key} must be kept`);
    }
  });

  it('redacts nested secrets and secrets inside arrays, without mutating the input', () => {
    const input = {
      actor: { id: 'a-1' },
      context: { accessToken: 'raw-secret', evidence: [{ apiKey: 'k' }, { fine: true }] },
    };
    const snapshot = JSON.stringify(input);
    const redacted = redactSensitiveValues(input);
    assert.equal(redacted.context.accessToken, GOVERNANCE_REDACTED_VALUE);
    assert.equal((redacted.context.evidence[0] as { apiKey: string }).apiKey, GOVERNANCE_REDACTED_VALUE);
    assert.deepEqual(redacted.context.evidence[1], { fine: true });
    assert.equal(redacted.actor.id, 'a-1');
    assert.equal(JSON.stringify(input), snapshot);
    assert.ok(!JSON.stringify(redacted).includes('raw-secret'));
  });

  it('is deterministic: the documented default term list drives the decision', () => {
    assert.ok(DEFAULT_SENSITIVE_KEY_TERMS.includes('token'));
    assert.equal(JSON.stringify(redactSensitiveValues({ password: 'x' })), JSON.stringify(redactSensitiveValues({ password: 'x' })));
  });
});
