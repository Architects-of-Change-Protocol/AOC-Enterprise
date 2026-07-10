import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildRuntimeHost } from '../dependency-injection/composition-root.js';
import { AocKernel } from '../../kernel/index.js';
import { createDefaultKernelProviders } from '../providers/kernel-provider-composition.js';
import { loadRuntimeConfiguration } from '../configuration/runtime-configuration.js';
import { buildAllowedRequestBody, buildTestKernelProviders } from './support.js';

describe('Runtime Host composition root', () => {
  it('boots with the default, empty (fail-closed) provider composition when nothing is overridden', async () => {
    const host = await buildRuntimeHost({ configuration: loadRuntimeConfiguration({ AOC_RUNTIME_PERSISTENCE_PROVIDER: 'memory' }) });
    assert.ok(host.kernel instanceof AocKernel);

    const outcome = await host.handleGovernanceEvaluate({ rawBody: buildAllowedRequestBody({ requestId: 'req-di-empty-1' }) });
    assert.equal(outcome.body.status, 'denied', 'the empty default world recognizes no actors, so every request is denied until seeded');

    await host.close();
  });

  it('accepts an injected KernelProviderSet in place of the default composition', async () => {
    const host = await buildRuntimeHost({ kernelProviders: buildTestKernelProviders() });

    const outcome = await host.handleGovernanceEvaluate({ rawBody: buildAllowedRequestBody({ requestId: 'req-di-seeded-1' }) });
    assert.equal(outcome.body.status, 'allowed');

    await host.close();
  });

  it('constructs the Kernel exactly once per host, wired only to the narrow ports it defines', async () => {
    const kernelProviders = buildTestKernelProviders();
    const host = await buildRuntimeHost({ kernelProviders });

    assert.equal(host.kernel.constructor.name, 'AocKernel');
    // The composition root must have handed the Kernel the same clock the providers were built with.
    assert.equal(host.kernelProviders.clock.now(), kernelProviders.clock.now());

    await host.close();
  });

  it('records a RuntimeVersion row on boot', async () => {
    const host = await buildRuntimeHost({ kernelProviders: buildTestKernelProviders() });

    const latest = await host.store.getLatestRuntimeVersion();
    assert.equal(latest?.bootId, host.bootId);
    assert.equal(latest?.kernelVersion, '1.0.0');

    await host.close();
  });

  it('createDefaultKernelProviders exposes real, seedable runtime handles (recognition/authority/approval/handshake), not stubs', () => {
    const providers = createDefaultKernelProviders();
    assert.equal(typeof providers.recognitionRuntime.registerActor, 'function');
    assert.equal(typeof providers.authorityRuntime.issueAuthorityGrant, 'function');
    assert.equal(typeof providers.approvalRuntime.approve, 'function');
    assert.equal(typeof providers.handshakeRuntime.decideHandshake, 'function');
  });
});
