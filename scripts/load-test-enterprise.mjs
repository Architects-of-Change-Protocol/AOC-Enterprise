// AOC Enterprise v1 load test (PR-008).
//
// Exercises the Enterprise Host over real HTTP with concurrent clients
// against real SQLite stores (WAL). Run AFTER `npm run build`:
//
//   node scripts/load-test-enterprise.mjs            # full run
//   node scripts/load-test-enterprise.mjs --quick    # reduced load (CI smoke)
//   node scripts/load-test-enterprise.mjs --json     # machine-readable output only
//
// Measures per-scenario throughput, latency percentiles, error/timeout
// counts, event-loop delay, and process memory. better-sqlite3 is
// synchronous and single-writer by design, so concurrency here measures
// request pipelining and store serialization behavior (SQLite contention),
// not parallel writes. See docs/performance/LOAD_TEST_V1.md.
//
// The run finishes with a CORRECTNESS phase (authentication enabled, real
// org-scoped API keys): digest re-verification of sampled governance
// records, evidence bundles, passports, and assessments; cross-tenant
// isolation probes; passport event-chain ordering; and a same-key write
// race that must produce exactly one winner (constraint + rollback under
// contention). Any correctness failure exits non-zero.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, cpus, totalmem } from 'node:os';
import { join } from 'node:path';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';

const QUICK = process.argv.includes('--quick');
const JSON_ONLY = process.argv.includes('--json');
const REQUESTS = QUICK ? 100 : 1000;
const CONCURRENCY = QUICK ? 8 : 32;
const REQUEST_TIMEOUT_MS = 10_000;

const { createEnterpriseServer, loadEnterpriseConfiguration } = await import('../dist/src/enterprise/index.js');
const { buildTestKernelProviders, buildAllowedRequestBody } = await import('../dist/src/enterprise/__tests__/support.js');

const orgCount = QUICK ? 8 : 32;
const SYSTEM_KEY = 'load-key-system';
const orgKey = (i) => `load-key-org-${i % orgCount}`;
const orgId = (i) => `load-org-${i % orgCount}`;
const apiKeys = [SYSTEM_KEY, ...Array.from({ length: orgCount }, (_, i) => `${orgKey(i)}:${orgId(i)}`)].join(',');

const workDir = mkdtempSync(join(tmpdir(), 'aoc-enterprise-load-'));
const server = await createEnterpriseServer({
  kernelProviders: buildTestKernelProviders(),
  configuration: loadEnterpriseConfiguration({
    AOC_ENTERPRISE_HTTP_PORT: '0',
    AOC_ENTERPRISE_HTTP_HOST: '127.0.0.1',
    AOC_ENTERPRISE_LOG_LEVEL: 'error',
    AOC_ENTERPRISE_PERSISTENCE_PROVIDER: 'sqlite',
    AOC_ENTERPRISE_SQLITE_PATH: join(workDir, 'governance.sqlite'),
    AOC_ENTERPRISE_PASSPORT_SQLITE_PATH: join(workDir, 'passport.sqlite'),
    AOC_ENTERPRISE_ASSURANCE_SQLITE_PATH: join(workDir, 'assurance.sqlite'),
    AOC_ENTERPRISE_REQUIRE_AUTH: 'true',
    AOC_ENTERPRISE_API_KEYS: apiKeys,
  }),
});
const { port } = await server.listen();
const baseUrl = `http://127.0.0.1:${port}`;

const round = (v) => Math.round(v * 1000) / 1000;

function percentile(sorted, q) {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

async function fire(method, path, body, apiKey = SYSTEM_KEY) {
  const start = performance.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const parsed = await response.json();
    return { ms: performance.now() - start, status: response.status, body: parsed };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    return { ms: performance.now() - start, status: timedOut ? 'timeout' : 'error', body: undefined };
  }
}

/** Run `total` requests with a fixed concurrency window; returns latency/error stats. */
async function loadScenario(name, total, concurrency, buildRequest) {
  const latencies = [];
  const statusCounts = {};
  const loopDelay = monitorEventLoopDelay({ resolution: 10 });
  loopDelay.enable();
  const startedAt = performance.now();

  let next = 0;
  async function worker() {
    while (next < total) {
      const i = next;
      next += 1;
      const { method, path, body, expect, apiKey, onResult } = buildRequest(i);
      const result = await fire(method, path, body, apiKey);
      if (onResult !== undefined) onResult(result, i);
      latencies.push(result.ms);
      const key = String(result.status);
      statusCounts[key] = (statusCounts[key] ?? 0) + 1;
      if (expect !== undefined && result.status !== expect && typeof result.status === 'number') {
        statusCounts[`unexpected:${key}`] = (statusCounts[`unexpected:${key}`] ?? 0) + 1;
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const wallMs = performance.now() - startedAt;
  loopDelay.disable();
  const sorted = [...latencies].sort((a, b) => a - b);
  return {
    name,
    requests: total,
    concurrency,
    wallSeconds: round(wallMs / 1000),
    throughputRps: round(total / (wallMs / 1000)),
    latencyMs: {
      p50: round(percentile(sorted, 0.5)),
      p95: round(percentile(sorted, 0.95)),
      p99: round(percentile(sorted, 0.99)),
      max: round(sorted[sorted.length - 1]),
    },
    eventLoopDelayMs: { mean: round(loopDelay.mean / 1e6) || 0, max: round(loopDelay.max / 1e6) || 0 },
    statusCounts,
  };
}

const environment = {
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  cpus: cpus().length,
  cpuModel: cpus()[0]?.model ?? 'unknown',
  totalMemGiB: round(totalmem() / 1024 ** 3),
  quick: QUICK,
  requestsPerScenario: REQUESTS,
  concurrency: CONCURRENCY,
  requestTimeoutMs: REQUEST_TIMEOUT_MS,
};
const memoryBefore = process.memoryUsage();
const scenarios = [];

// 1. parallel governance evaluations (writes: Kernel + store append + WAL commit).
// Every id actually written by THIS concurrent scenario is captured (not a
// separate sequential seed) so downstream read/verify scenarios and the
// correctness phase exercise records that were genuinely written under
// contention -- a corrupted or dropped concurrent write would otherwise be
// invisible to a verification pass that only ever reads sequentially-seeded data.
const seededEvaluations = [];
scenarios.push(
  await loadScenario('parallel governance evaluate (write)', REQUESTS, CONCURRENCY, (i) => ({
    method: 'POST',
    path: '/api/governance/evaluate',
    body: buildAllowedRequestBody({ requestId: `load-eval-${i}`, correlationId: `load-corr-${i}` }),
    expect: 200,
    onResult: (result) => {
      if (result.status === 200) seededEvaluations.push(result.body.governanceRecord.evaluationId);
    },
  })),
);
if (seededEvaluations.length === 0) {
  throw new Error('parallel governance evaluate (write) produced zero successful writes; nothing to verify downstream.');
}

// 2. parallel verification (reads + digest recomputation)
scenarios.push(
  await loadScenario('parallel governance verify (read+recompute)', REQUESTS, CONCURRENCY, (i) => ({
    method: 'GET',
    path: `/api/governance/evaluations/${seededEvaluations[i % seededEvaluations.length]}/verify`,
    expect: 200,
  })),
);

// 3. parallel assurance assessment creation across tenants (org-scoped keys)
scenarios.push(
  await loadScenario('parallel assurance assessment create (write, per-tenant keys)', REQUESTS, CONCURRENCY, (i) => ({
    method: 'POST',
    path: '/api/assurance/assessments',
    body: {
      subject: { subjectId: `load-subject-${i}`, subjectType: 'organization', organizationId: orgId(i) },
      frameworkId: 'aoc.saf',
      frameworkVersion: '1.0.0',
      requestedBy: 'load',
    },
    expect: 201,
    apiKey: orgKey(i),
  })),
);

// 4. parallel signal processing (write + continuous-state derivation)
scenarios.push(
  await loadScenario('parallel assurance signals (write)', REQUESTS, CONCURRENCY, (i) => ({
    method: 'POST',
    path: '/api/assurance/signals',
    body: {
      subjectId: `load-subject-${i}`,
      subjectType: 'organization',
      organizationId: orgId(i),
      signalType: 'control_evidence_expired',
      sourceType: 'enterprise_health',
      sourceId: `load-source-${i}`,
      occurredAt: '2026-01-01T00:00:00.000Z',
    },
    expect: 201,
  })),
);

// 5. parallel continuous-state reads (report-style projection reads)
scenarios.push(
  await loadScenario('parallel assurance state reads', REQUESTS, CONCURRENCY, (i) => ({
    method: 'GET',
    path: `/api/assurance/subjects/load-subject-${i % REQUESTS}/state?frameworkId=aoc.saf&frameworkVersion=1.0.0`,
    expect: 200,
  })),
);

// 6. parallel reassessment requests (only completed/superseded can reassess -> expect governed 4xx, exercising the error path under load)
scenarios.push(
  await loadScenario('parallel reassessment requests (governed conflict path)', QUICK ? 50 : 200, CONCURRENCY, (i) => ({
    method: 'POST',
    path: `/api/assurance/subjects/load-subject-${i % orgCount}/reassess`,
    body: {
      organizationId: orgId(i),
      frameworkId: 'aoc.saf',
      frameworkVersion: '1.0.0',
      reason: 'load test reassessment',
      requestedBy: 'load',
    },
  })),
);

// 7. mixed workload: 50% evaluate writes, 30% verify reads, 20% signals
scenarios.push(
  await loadScenario('mixed workload (50w/30r/20s)', REQUESTS, CONCURRENCY, (i) => {
    const bucket = i % 10;
    if (bucket < 5) {
      return { method: 'POST', path: '/api/governance/evaluate', body: buildAllowedRequestBody({ requestId: `load-mixed-${i}` }), expect: 200 };
    }
    if (bucket < 8) {
      return { method: 'GET', path: `/api/governance/evaluations/${seededEvaluations[i % seededEvaluations.length]}/verify`, expect: 200 };
    }
    return {
      method: 'POST',
      path: '/api/assurance/signals',
      body: {
        subjectId: `load-mixed-subject-${i}`,
        subjectType: 'organization',
        organizationId: orgId(i),
        signalType: 'control_evidence_expired',
        sourceType: 'enterprise_health',
        sourceId: `load-mixed-source-${i}`,
        occurredAt: '2026-01-01T00:00:00.000Z',
      },
      expect: 201,
    };
  }),
);

// 8. parallel evidence bundle builds (writes) from seeded evaluations
const builtBundleIds = [];
scenarios.push(
  await loadScenario('parallel evidence build (write)', QUICK ? 60 : 300, CONCURRENCY, (i) => ({
    method: 'POST',
    path: '/api/evidence/build',
    body: { evaluationId: seededEvaluations[i % seededEvaluations.length], level: ['AUDITOR', 'PARTNER', 'CUSTOMER'][i % 3], createdBy: 'load' },
    expect: 201,
    onResult: (result) => {
      if (result.status === 201) builtBundleIds.push(result.body.bundle.bundleId);
    },
  })),
);

// 9. parallel passport issuance + activation across tenants (org-scoped keys)
const issuedPassports = [];
const passportCount = QUICK ? 60 : 300;
scenarios.push(
  await loadScenario('parallel passport issue (write, per-tenant keys)', passportCount, CONCURRENCY, (i) => ({
    method: 'POST',
    path: '/api/passports',
    body: {
      subject: { agentId: `load-agent-${i}`, agentType: 'service_agent' },
      organization: { organizationId: orgId(i), recognizedBy: 'load-recognizer' },
      actorId: 'load-issuer',
      activateImmediately: true,
    },
    expect: 201,
    apiKey: orgKey(i),
    onResult: (result) => {
      if (result.status === 201) issuedPassports.push({ passportId: result.body.passport.passportId, org: i % orgCount });
    },
  })),
);

// 10. write-contention race: many concurrent issuances of the SAME (org, agent)
// without an idempotency key. The partial unique index must let exactly one
// transaction commit; every loser must roll back to a governed 409 -- this is
// the append-only/rollback correctness probe, not a throughput scenario.
let contentionCreated = 0;
let contentionConflicts = 0;
scenarios.push(
  await loadScenario('passport same-agent write race (contention)', CONCURRENCY, CONCURRENCY, () => ({
    method: 'POST',
    path: '/api/passports',
    body: {
      subject: { agentId: 'load-contended-agent', agentType: 'service_agent' },
      organization: { organizationId: orgId(0), recognizedBy: 'load-recognizer' },
      actorId: 'load-issuer',
    },
    apiKey: orgKey(0),
    onResult: (result) => {
      if (result.status === 201) contentionCreated += 1;
      if (result.status === 409) contentionConflicts += 1;
    },
  })),
);

// -- CORRECTNESS PHASE --------------------------------------------------------
// Throughput means nothing if concurrency corrupted state. Everything below
// must hold exactly; any failure exits non-zero.
const correctness = [];
function check(name, passed, detail) {
  correctness.push({ name, passed, detail });
}

const sample = (array, n) => array.filter((_, index) => index % Math.max(1, Math.floor(array.length / n)) === 0).slice(0, n);

// digest consistency: governance records written under load re-verify
{
  const ids = sample(seededEvaluations, 20);
  const results = await Promise.all(ids.map((id) => fire('GET', `/api/governance/evaluations/${id}/verify`)));
  const invalid = results.filter((r) => r.status !== 200 || r.body?.valid !== true).length;
  check('governance digests re-verify after concurrent writes', invalid === 0, `${ids.length - invalid}/${ids.length} valid`);
}

// digest consistency: evidence bundles built under load re-verify
{
  const ids = sample(builtBundleIds, 20);
  const results = await Promise.all(ids.map((id) => fire('POST', '/api/evidence/verify', { bundleId: id })));
  const invalid = results.filter((r) => r.status !== 200 || r.body?.valid !== true).length;
  check('evidence bundles re-verify after concurrent builds', ids.length > 0 && invalid === 0, `${ids.length - invalid}/${ids.length} valid`);
}

// passport chains: full verification (digest chain + lifecycle) and event ordering
{
  const sampled = sample(issuedPassports, 20);
  const verifications = await Promise.all(sampled.map((p) => fire('POST', `/api/passports/${p.passportId}/verify`, {}, orgKey(p.org))));
  const invalid = verifications.filter((r) => r.status !== 200 || r.body?.valid !== true).length;
  check('passport event chains verify after concurrent issuance', sampled.length > 0 && invalid === 0, `${sampled.length - invalid}/${sampled.length} valid`);

  const eventLists = await Promise.all(sampled.map((p) => fire('GET', `/api/passports/${p.passportId}/events`, undefined, orgKey(p.org))));
  const misordered = eventLists.filter((r) => {
    if (r.status !== 200 || !Array.isArray(r.body?.events)) return true;
    return r.body.events.some((event, index) => event.sequence !== index + 1);
  }).length;
  check('passport events are contiguous and ordered (1..n)', sampled.length > 0 && misordered === 0, `${eventLists.length - misordered}/${eventLists.length} ordered`);
}

// assessment digests: assessments created under load re-verify
{
  const created = [];
  for (let i = 0; i < 10; i += 1) {
    const r = await fire('POST', '/api/assurance/assessments', {
      subject: { subjectId: `load-correctness-${i}`, subjectType: 'organization', organizationId: orgId(i) },
      frameworkId: 'aoc.saf',
      frameworkVersion: '1.0.0',
      requestedBy: 'load',
    }, orgKey(i));
    if (r.status === 201) created.push({ id: r.body.assessmentId, org: i % orgCount });
  }
  const results = await Promise.all(created.map((a) => fire('POST', `/api/assurance/assessments/${a.id}/verify`, undefined, orgKey(a.org))));
  const invalid = results.filter((r) => r.status !== 200 || r.body?.valid !== true).length;
  check('assessment integrity digests verify', created.length === 10 && invalid === 0, `${created.length - invalid}/${created.length} valid`);

  // tenant isolation under concurrency-created data: a different org's key
  // must NOT see these assessments; the owner's key MUST.
  const crossReads = await Promise.all(created.map((a) => fire('GET', `/api/assurance/assessments/${a.id}`, undefined, orgKey(a.org + 1))));
  const leaked = crossReads.filter((r) => r.status === 200).length;
  check('cross-tenant assessment reads are denied', created.length > 0 && leaked === 0, `${leaked} leaks in ${crossReads.length} probes`);
  const ownReads = await Promise.all(created.map((a) => fire('GET', `/api/assurance/assessments/${a.id}`, undefined, orgKey(a.org))));
  const ownVisible = ownReads.filter((r) => r.status === 200).length;
  check('same-tenant assessment reads succeed (isolation probe is not vacuous)', ownVisible === created.length, `${ownVisible}/${created.length} visible`);
}

// cross-tenant passport isolation
{
  const sampled = sample(issuedPassports, 10);
  const crossReads = await Promise.all(sampled.map((p) => fire('GET', `/api/passports/${p.passportId}`, undefined, orgKey(p.org + 1))));
  const leaked = crossReads.filter((r) => r.status === 200).length;
  check('cross-tenant passport reads are denied', sampled.length > 0 && leaked === 0, `${leaked} leaks in ${crossReads.length} probes`);
}

// write race: exactly one winner, every loser rolled back to a governed 409
check(
  'same-agent issuance race has exactly one winner',
  contentionCreated === 1 && contentionConflicts === CONCURRENCY - 1,
  `created=${contentionCreated} conflicts=${contentionConflicts} of ${CONCURRENCY} attempts`,
);
const correctnessFailed = correctness.filter((c) => !c.passed);

const memoryAfter = process.memoryUsage();
await server.close();
rmSync(workDir, { recursive: true, force: true });

const output = {
  environment,
  memory: {
    beforeRssMiB: round(memoryBefore.rss / 1024 ** 2),
    afterRssMiB: round(memoryAfter.rss / 1024 ** 2),
    afterHeapUsedMiB: round(memoryAfter.heapUsed / 1024 ** 2),
  },
  scenarios,
  correctness,
};

if (JSON_ONLY) {
  console.log(JSON.stringify(output, null, 2));
} else {
  console.log('AOC Enterprise v1 load test');
  console.log(JSON.stringify(environment, null, 2));
  console.log('');
  console.log('| scenario | req | conc | rps | p50 ms | p95 ms | p99 ms | max ms | loop-delay mean ms | statuses |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const s of scenarios) {
    console.log(
      `| ${s.name} | ${s.requests} | ${s.concurrency} | ${s.throughputRps} | ${s.latencyMs.p50} | ${s.latencyMs.p95} | ${s.latencyMs.p99} | ${s.latencyMs.max} | ${s.eventLoopDelayMs.mean} | ${JSON.stringify(s.statusCounts)} |`,
    );
  }
  console.log('');
  console.log('| correctness check | result | detail |');
  console.log('|---|---|---|');
  for (const c of correctness) {
    console.log(`| ${c.name} | ${c.passed ? 'PASS' : 'FAIL'} | ${c.detail} |`);
  }
  console.log('');
  console.log(`rss ${output.memory.beforeRssMiB} -> ${output.memory.afterRssMiB} MiB, heapUsed ${output.memory.afterHeapUsedMiB} MiB`);
}

if (correctnessFailed.length > 0) {
  console.error(`CORRECTNESS FAILURES: ${correctnessFailed.map((c) => c.name).join('; ')}`);
  process.exit(1);
}
