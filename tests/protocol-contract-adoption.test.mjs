import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  importsAocIdentityClaimsFromProtocol,
  mapperUsesSpreadOrCast,
} from '../scripts/check-protocol-contract-adoption.mjs';

const root = process.cwd();

function run(cmd, args, cwd = root) {
  const res = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  return res;
}

test('protocol contract adoption guard passes against the real tree', () => {
  const res = run('node', [resolve(root, 'scripts/check-protocol-contract-adoption.mjs')]);
  assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);
});

test('importsAocIdentityClaimsFromProtocol detects a named import of AocIdentityClaims', () => {
  assert.equal(
    importsAocIdentityClaimsFromProtocol("import type { AocIdentityClaims } from '@aoc/protocol';"),
    true
  );
  assert.equal(
    importsAocIdentityClaimsFromProtocol("import type { AocIdentityClaims, CapabilityToken } from '@aoc/protocol';"),
    true
  );
});

test('importsAocIdentityClaimsFromProtocol does not flag VerifiedActorClaims or unrelated imports', () => {
  assert.equal(
    importsAocIdentityClaimsFromProtocol("import type { VerifiedActorClaims } from '@aoc-enterprise/identity';"),
    false
  );
  assert.equal(
    importsAocIdentityClaimsFromProtocol("import type { CapabilityToken, ScopedAccessRequest } from '@aoc/protocol';"),
    false
  );
});

test('mapperUsesSpreadOrCast detects a spread of the legacy event', () => {
  assert.equal(mapperUsesSpreadOrCast('return { ...event, eventId: event.event_id };'), true);
});

test('mapperUsesSpreadOrCast detects a structural cast', () => {
  assert.equal(mapperUsesSpreadOrCast('return event as unknown as AuditEventEnvelope;'), true);
  assert.equal(mapperUsesSpreadOrCast('return legacy as ControlPlaneAuditEvent;'), true);
});

test('mapperUsesSpreadOrCast does not flag explicit field-by-field mapping', () => {
  assert.equal(
    mapperUsesSpreadOrCast('return { eventId: event.event_id, eventType: event.event_type, payload };'),
    false
  );
});
