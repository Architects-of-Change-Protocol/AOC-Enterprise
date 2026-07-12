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
  }),
});
const { port } = await server.listen();
const baseUrl = `http://127.0.0.1:${port}`;

const round = (v) => Math.round(v * 1000) / 1000;

function percentile(sorted, q) {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

async function fire(method, path, body) {
  const start = performance.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
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
      const { method, path, body, expect } = buildRequest(i);
      const result = await fire(method, path, body);
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
    eventLoopDelayMs: { mean: round(loopDelay.mean / 1e6), max: round(loopDelay.max / 1e6) },
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

// 1. parallel governance evaluations (writes: Kernel + store append + WAL commit)
scenarios.push(
  await loadScenario('parallel governance evaluate (write)', REQUESTS, CONCURRENCY, (i) => ({
    method: 'POST',
    path: '/api/governance/evaluate',
    body: buildAllowedRequestBody({ requestId: `load-eval-${i}`, correlationId: `load-corr-${i}` }),
    expect: 200,
  })),
);

// capture some evaluation ids for read/verify scenarios
const seededEvaluations = [];
for (let i = 0; i < 20; i += 1) {
  const result = await fire('POST', '/api/governance/evaluate', buildAllowedRequestBody({ requestId: `load-seed-${i}` }));
  seededEvaluations.push(result.body.governanceRecord.evaluationId);
}

// 2. parallel verification (reads + digest recomputation)
scenarios.push(
  await loadScenario('parallel governance verify (read+recompute)', REQUESTS, CONCURRENCY, (i) => ({
    method: 'GET',
    path: `/api/governance/evaluations/${seededEvaluations[i % seededEvaluations.length]}/verify`,
    expect: 200,
  })),
);

// 3. parallel assurance assessment creation across tenants
const orgCount = QUICK ? 8 : 32;
scenarios.push(
  await loadScenario('parallel assurance assessment create (write)', REQUESTS, CONCURRENCY, (i) => ({
    method: 'POST',
    path: '/api/assurance/assessments',
    body: {
      subject: { subjectId: `load-subject-${i}`, subjectType: 'organization', organizationId: `load-org-${i % orgCount}` },
      frameworkId: 'aoc.saf',
      frameworkVersion: '1.0.0',
      requestedBy: 'load',
    },
    expect: 201,
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
      organizationId: `load-org-${i % orgCount}`,
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
      organizationId: `load-org-${i % orgCount}`,
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
        organizationId: `load-org-${i % orgCount}`,
        signalType: 'control_evidence_expired',
        sourceType: 'enterprise_health',
        sourceId: `load-mixed-source-${i}`,
        occurredAt: '2026-01-01T00:00:00.000Z',
      },
      expect: 201,
    };
  }),
);

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
  console.log(`rss ${output.memory.beforeRssMiB} -> ${output.memory.afterRssMiB} MiB, heapUsed ${output.memory.afterHeapUsedMiB} MiB`);
}
