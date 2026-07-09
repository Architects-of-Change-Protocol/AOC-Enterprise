import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { assertNoAocPMFreakReadOnlyConnectorOverclaim, evaluateAocPMFreakReadOnlyConnectorClaimSafety } from '../pmfreak-read-only-claim-safety.js';
import { createAocPMFreakReadOnlyConnectorDescriptor } from '../pmfreak-read-only-connector-descriptor.js';
import { createAocPMFreakReadOnlyConnectorConfig } from '../pmfreak-read-only-connector-config.js';
import { createAocPMFreakReadOnlyConnectorClient } from '../pmfreak-read-only-client.js';
import { createInMemoryAocPMFreakReadOnlySource } from '../pmfreak-in-memory-source.js';
import { AOC_PMFREAK_READ_ONLY_CONNECTOR_SAFE_LABELS } from '../pmfreak-read-only-connector-constants.js';

const UNSAFE_CLAIMS = [
  'fully trusted agent',
  'certified enterprise compliant',
  'risk-free execution',
  'production authorized',
  'invoice-ready certified',
  'invoice ready certified',
  'customer acceptance certified',
  'contractually compliant',
  'legally approved',
  'compliance passed',
  'guaranteed billing',
  'certified audit export',
  'legal evidence package',
  'Costa Rica compliant',
  'CR compliant',
  'invoice validity certified',
  'billing entitlement guaranteed',
  'customer acceptance legally sufficient',
  'project compliant',
  'production connector certified',
  'write access enabled',
  'mutation allowed',
  'certified PMFreak connector',
];

const SAFE_PHRASES = [
  'read-only connector',
  'read-only PMFreak data',
  'Not production execution',
  'Not compliance certification',
  'No invoice validity claimed',
  'No customer acceptance certification',
  'No mutation performed',
  'No writeback performed',
  'AOC-governed agent',
];

describe('AOC PMFreak Read-Only Connector claim safety', () => {
  it('unsafe connector claims are caught', () => {
    for (const claim of UNSAFE_CLAIMS) {
      const text = `This PMFreak read-only connector is ${claim}.`;
      const result = evaluateAocPMFreakReadOnlyConnectorClaimSafety(text);
      assert.equal(result.safe, false, `expected "${claim}" to be flagged unsafe`);
      assert.ok(result.prohibitedPhrasesFound.length > 0);
      assert.throws(() => assertNoAocPMFreakReadOnlyConnectorOverclaim(text));
    }
  });

  it('safe connector phrases never false-positive', () => {
    const safeText = SAFE_PHRASES.join('; ');
    const result = evaluateAocPMFreakReadOnlyConnectorClaimSafety(safeText);

    assert.equal(result.safe, true, JSON.stringify(result.prohibitedPhrasesFound));
    assertNoAocPMFreakReadOnlyConnectorOverclaim(safeText);
  });

  it('the connector safe labels constant itself passes claim safety', () => {
    const safeText = [...AOC_PMFREAK_READ_ONLY_CONNECTOR_SAFE_LABELS].join('; ');
    assertNoAocPMFreakReadOnlyConnectorOverclaim(safeText);
  });

  it('the descriptor and config pass claim safety', () => {
    assertNoAocPMFreakReadOnlyConnectorOverclaim(createAocPMFreakReadOnlyConnectorDescriptor());
    assertNoAocPMFreakReadOnlyConnectorOverclaim(createAocPMFreakReadOnlyConnectorConfig());
  });

  it('a real connector snapshot passes claim safety', async () => {
    const client = createAocPMFreakReadOnlyConnectorClient({ source: createInMemoryAocPMFreakReadOnlySource() });
    const snapshot = await client.readSnapshot();
    assertNoAocPMFreakReadOnlyConnectorOverclaim(snapshot);
  });
});
