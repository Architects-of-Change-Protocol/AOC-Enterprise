import { createHostRuntime } from './host-runtime.js';

const runtime = createHostRuntime();

const decision = await runtime.enforce({
  requestId: 'request-example-1',
  actorId: 'actor-example-1',
  capability: { jti: 'capability-example-1', trust_domain: 'example-trust-domain', exp: 4102444800 },
  consentGrants: [],
  access: { action: 'read', resource: 'dataset:example', scope: ['dataset:read'] },
  tenantId: 'tenant-example',
  orgId: 'org-example',
});

if (!decision.allowed) {
  console.error('Runtime denied the request', decision.reasonCodes);
  process.exitCode = 1;
} else {
  console.log('Runtime allowed the request', decision.audit);
}
