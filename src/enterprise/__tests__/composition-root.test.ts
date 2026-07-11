import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterprise } from '../composition/composition-root.js';
import { AocKernel } from '../../kernel/index.js';
import { createDefaultKernelProviders } from '../providers/kernel-provider-composition.js';
import { loadEnterpriseConfiguration } from '../configuration/enterprise-configuration.js';
import { createInMemoryGovernanceStore } from '../governance-store/index.js';
import { buildAllowedRequestBody, buildTestKernelProviders } from './support.js';

describe('AOC Enterprise Host composition root (createEnterprise)', () => {
  it('boots with the default, empty (fail-closed) provider composition when nothing is overridden', async () => {
    const enterprise = await createEnterprise({ configuration: loadEnterpriseConfiguration({ AOC_ENTERPRISE_PERSISTENCE_PROVIDER: 'memory' }) });
    assert.ok(enterprise.kernel instanceof AocKernel);

    const outcome = await enterprise.evaluate(buildAllowedRequestBody({ requestId: 'req-di-empty-1' }));
    assert.equal(outcome.body.status, 'denied', 'the empty default world recognizes no actors, so every request is denied until seeded');

    await enterprise.close();
  });

  it('accepts an injected KernelProviderSet in place of the default composition', async () => {
    const enterprise = await createEnterprise({ kernelProviders: buildTestKernelProviders() });

    const outcome = await enterprise.evaluate(buildAllowedRequestBody({ requestId: 'req-di-seeded-1' }));
    assert.equal(outcome.body.status, 'allowed');

    await enterprise.close();
  });

  it('accepts an already-built AocKernel directly via options.kernel, bypassing kernelProviders construction', async () => {
    const kernelProviders = buildTestKernelProviders();
    const kernel = new AocKernel({ recognitionProvider: kernelProviders.recognitionProvider, clock: kernelProviders.clock, idGenerator: kernelProviders.idGenerator });
    const enterprise = await createEnterprise({ kernel, kernelProviders });

    assert.equal(enterprise.kernel, kernel);
    const outcome = await enterprise.evaluate(buildAllowedRequestBody({ requestId: 'req-di-prebuilt-kernel-1' }));
    assert.equal(outcome.body.status, 'allowed');

    await enterprise.close();
  });

  it('constructs the Kernel exactly once per instance, wired only to the narrow ports it defines', async () => {
    const kernelProviders = buildTestKernelProviders();
    const enterprise = await createEnterprise({ kernelProviders });

    assert.equal(enterprise.kernel.constructor.name, 'AocKernel');
    // The composition root must have handed the Kernel the same clock the providers were built with.
    assert.equal(enterprise.kernelProviders.clock.now(), kernelProviders.clock.now());

    await enterprise.close();
  });

  it('records an EnterpriseVersion row on boot', async () => {
    const enterprise = await createEnterprise({ kernelProviders: buildTestKernelProviders() });

    const latest = await enterprise.persistence.getLatestEnterpriseVersion();
    assert.equal(latest?.bootId, enterprise.bootId);
    assert.equal(latest?.kernelVersion, '1.0.0');

    await enterprise.close();
  });

  it('fails clearly when persistence cannot be constructed (missing/invalid dependency)', async () => {
    // A real v1 store with its write/boot paths broken — the composition root
    // must reject rather than come up with unusable persistence.
    const brokenStore = createInMemoryGovernanceStore();
    await assert.rejects(() =>
      createEnterprise({
        kernelProviders: buildTestKernelProviders(),
        persistence: {
          ...brokenStore,
          persistEvaluation: () => Promise.reject(new Error('persistence unavailable')),
          appendEvaluation: () => Promise.reject(new Error('persistence unavailable')),
          recordEnterpriseVersion: () => Promise.reject(new Error('persistence unavailable')),
          checkConnectivity: () => Promise.resolve(false),
        },
      }),
    );
  });

  it('createDefaultKernelProviders exposes real, seedable runtime handles (recognition/authority/approval/handshake), not stubs', () => {
    const providers = createDefaultKernelProviders();
    assert.equal(typeof providers.recognitionRuntime.registerActor, 'function');
    assert.equal(typeof providers.authorityRuntime.issueAuthorityGrant, 'function');
    assert.equal(typeof providers.approvalRuntime.approve, 'function');
    assert.equal(typeof providers.handshakeRuntime.decideHandshake, 'function');
  });
});
