import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterprise } from '../composition/composition-root.js';
import { buildAllowedRequestBody, buildTestKernelProviders } from './support.js';

describe('Concurrent governance evaluation', () => {
  it('handles many concurrent requests with distinct requestIds without cross-talk', async () => {
    const enterprise = await createEnterprise({ kernelProviders: buildTestKernelProviders() });

    const outcomes = await Promise.all(
      Array.from({ length: 20 }, (_, i) => enterprise.evaluate(buildAllowedRequestBody({ requestId: `req-concurrent-${i}` }))),
    );

    assert.equal(outcomes.length, 20);
    for (const outcome of outcomes) assert.equal(outcome.body.status, 'allowed');

    const decisionIds = new Set(outcomes.map((outcome) => outcome.body.decisionId));
    assert.equal(decisionIds.size, 20, 'every distinct request must produce its own decision');

    for (let i = 0; i < 20; i += 1) {
      assert.ok(await enterprise.persistence.getRequestById(`req-concurrent-${i}`), `req-concurrent-${i} must be durably persisted`);
    }

    await enterprise.close();
  });

  it('resolves a concurrent burst of the same requestId+payload to exactly one stored decision, everyone else replaying it', async () => {
    const enterprise = await createEnterprise({ kernelProviders: buildTestKernelProviders() });
    const body = buildAllowedRequestBody({ requestId: 'req-concurrent-burst' });

    const outcomes = await Promise.all(Array.from({ length: 10 }, () => enterprise.evaluate(body)));

    const decisionIds = new Set(outcomes.map((outcome) => outcome.body.decisionId));
    assert.equal(decisionIds.size, 1, 'a concurrent burst for the same request must converge on exactly one decision, not one per caller');
    for (const outcome of outcomes) assert.equal(outcome.httpStatus, 200);

    await enterprise.close();
  });

  it('resolves a concurrent burst of the same requestId with conflicting payloads to exactly one winner and 409s the rest', async () => {
    const enterprise = await createEnterprise({ kernelProviders: buildTestKernelProviders() });

    const outcomes = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        enterprise.evaluate(
          buildAllowedRequestBody({ requestId: 'req-concurrent-conflict', context: { passportId: 'passport-pmfreak', capabilityTokenId: 'cap-pmfreak-drafting', evidence: [], tag: i } }),
        ),
      ),
    );

    const fulfilled = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');
    assert.equal(fulfilled.length, 1, 'exactly one differently-tagged concurrent submission wins the requestId');
    assert.equal(rejected.length, 4);
    for (const outcome of rejected) {
      if (outcome.status === 'rejected') assert.equal(outcome.reason.httpStatus, 409);
    }

    await enterprise.close();
  });
});
