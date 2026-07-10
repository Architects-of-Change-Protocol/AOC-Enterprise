import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import * as enterpriseModule from '../index.js';
import * as kernelHostCompatModule from '../../kernel-host/index.js';

/**
 * The old `kernel-host` public surface (`@aoc-enterprise/runtime/kernel-host`)
 * must keep working during the compatibility period documented in
 * `docs/enterprise/KERNEL_HOST_TO_ENTERPRISE_MIGRATION.md` -- as a re-export
 * of `src/enterprise`, never a second implementation.
 */
describe('kernel-host -> enterprise compatibility shim', () => {
  it('re-exports every symbol src/enterprise exports, with no duplicated implementation', () => {
    const enterpriseKeys = Object.keys(enterpriseModule).sort();
    const compatKeys = Object.keys(kernelHostCompatModule).sort();
    assert.deepEqual(compatKeys, enterpriseKeys);
  });

  it('re-exports the identical function/class references, not copies', () => {
    assert.equal(kernelHostCompatModule.createEnterprise, enterpriseModule.createEnterprise);
    assert.equal(kernelHostCompatModule.EnterpriseHttpError, enterpriseModule.EnterpriseHttpError);
    assert.equal(kernelHostCompatModule.createEnterpriseServer, enterpriseModule.createEnterpriseServer);
  });

  it('old symbol names are documented, not silently resurrected -- buildRuntimeHost no longer exists anywhere', () => {
    assert.equal((enterpriseModule as Record<string, unknown>).buildRuntimeHost, undefined);
    assert.equal((kernelHostCompatModule as Record<string, unknown>).buildRuntimeHost, undefined);
  });

  it('the compatibility module builds an Enterprise instance identical in behavior to importing from src/enterprise directly', async () => {
    const { buildTestKernelProviders, buildAllowedRequestBody } = await import('./support.js');
    const enterprise = await kernelHostCompatModule.createEnterprise({ kernelProviders: buildTestKernelProviders() });
    const outcome = await enterprise.evaluate(buildAllowedRequestBody({ requestId: 'req-compat-1' }));
    assert.equal(outcome.body.status, 'allowed');
    await enterprise.close();
  });
});
