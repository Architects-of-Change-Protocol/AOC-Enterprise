# AOC Enterprise — Load Test Report (v1.0.0)

Concurrent-load characterization **and correctness validation** of the Enterprise Host over real HTTP against real SQLite stores (WAL). Complements `BENCHMARK_BASELINE_V1.md` (single-client latencies).

Throughput without correctness is meaningless for a governance runtime, so the run ends with a mandatory correctness phase; any failure exits non-zero.

## How to reproduce

```bash
npm ci && npm run build
node scripts/load-test-enterprise.mjs           # full run (1000 req/scenario, 32-way concurrency)
node scripts/load-test-enterprise.mjs --quick   # smoke run (100 req, 8-way)
node scripts/load-test-enterprise.mjs --json    # machine-readable output
```

The script reads no environment variables; it fully configures the Host it boots. **Authentication is enabled for the entire run**: one unscoped system key plus one org-scoped API key per tenant (32 tenants full / 8 quick), so auth and tenant scoping are exercised under load, not bypassed. Per-request timeout is 10 s; timeouts and network errors are counted separately from HTTP statuses.

## Recorded run

Environment: 2026-07-13 · Node v22.22.2 · linux x64 · Intel Xeon @ 2.80GHz (4 vCPU) · 15.7 GiB RAM · 1000 requests/scenario (smaller where noted) · concurrency 32 · auth ON, 32 org keys.

| scenario | req | conc | rps | p50 ms | p95 ms | p99 ms | max ms | loop-delay mean ms | statuses |
|---|---|---|---|---|---|---|---|---|---|
| parallel governance evaluate (write) | 1000 | 32 | 129 | 229.5 | 300.8 | 1409.8 | 1657.6 | 89.1 | 200×1000 |
| parallel governance verify (read + digest recompute) | 1000 | 32 | 489 | 60.3 | 100.8 | 192.4 | 441.7 | 30.2 | 200×1000 |
| parallel assurance assessment create (write, per-tenant keys) | 1000 | 32 | 354 | 85.3 | 120.0 | 212.7 | 213.5 | 43.8 | 201×1000 |
| parallel assurance signals (write) | 1000 | 32 | 350 | 88.5 | 110.4 | 125.3 | 125.8 | 45.6 | 201×1000 |
| parallel assurance state reads | 1000 | 32 | 701 | 43.3 | 58.7 | 63.3 | 63.6 | 26.1 | 200×1000 |
| parallel reassessment requests (governed conflict path) | 200 | 32 | 756 | 40.4 | 54.6 | 54.9 | 54.9 | 20.9 | 404×200 |
| mixed workload (50% evaluate / 30% verify / 20% signals) | 1000 | 32 | 188 | 165.5 | 196.2 | 247.0 | 253.5 | 84.2 | 200×800, 201×200 |
| parallel evidence build (write) | 300 | 32 | 774 | 40.8 | 47.4 | 51.5 | 52.1 | 19.4 | 201×300 |
| parallel passport issue + activate (write, per-tenant keys) | 300 | 32 | 247 | 120.0 | 149.7 | 152.4 | 153.0 | 63.2 | 201×300 |
| passport same-agent write race (contention probe) | 32 | 32 | — | 21.5 | 22.4 | 22.4 | 22.4 | — | 201×1, 409×31 |

Memory: RSS 77 → 243 MiB across the whole run (~6,900 requests); heap used 53 MiB at the end. No timeouts, no connection errors, no 5xx anywhere.

## Correctness phase (all must pass; run exits non-zero otherwise)

| check | result | detail |
|---|---|---|
| governance digests re-verify after concurrent writes | PASS | 20/20 valid |
| evidence bundles re-verify after concurrent builds | PASS | 20/20 valid |
| passport event chains verify after concurrent issuance | PASS | 20/20 valid |
| passport events contiguous and ordered (1..n) | PASS | 20/20 ordered |
| assessment integrity digests verify | PASS | 10/10 valid |
| cross-tenant assessment reads denied (org-A key → org-B data) | PASS | 0 leaks / 10 probes |
| same-tenant reads succeed (proves the isolation probe isn't vacuous) | PASS | 10/10 visible |
| cross-tenant passport reads denied | PASS | 0 leaks / 10 probes |
| same-agent issuance race has exactly one winner | PASS | created=1, conflicts=31 of 32 attempts |

What these prove under concurrency:

- **Digest consistency:** artifacts written under full contention re-verify by recomputation (governance records, evidence bundles, passports, assessments).
- **Event ordering / append-only:** passport event chains are gap-free, ordered, and chain-verified after concurrent issuance + activation.
- **Tenant isolation:** org-scoped keys cannot read another tenant's assessments or passports created during the same loaded run, while their own reads succeed.
- **Transaction rollback / locking:** 32 simultaneous issuances of the *same* (organization, agent) — no idempotency key — produced exactly one committed passport; the other 31 rolled back cleanly to a governed `409 PASSPORT_ALREADY_EXISTS`, and the winner's chain verifies. SQLite's partial unique index + single-writer transactions held under the race.

## Findings

1. **Correctness holds at saturation.** ~6,900 concurrent requests, zero unexpected statuses, zero integrity failures, one race winner exactly.
2. **SQLite contention shapes write latency, not error rate.** At concurrency 32, evaluate p50 is ~230 ms (queueing on the serialized commit path) at ~129 rps; degradation is graceful, nothing times out at a 10 s budget. Auth (constant-time key matching) adds a small fixed cost per request versus the PR-008 unauthenticated run.
3. **Reads scale far better than writes** (verify 489 rps, state reads 701 rps), consistent with WAL readers not blocking on the writer.
4. **Event-loop delay remains the leading saturation signal** (84–89 ms mean under full write load) — alert on it before latency SLOs break.
5. **Memory is bounded:** RSS plateaus (page-cache warm-up), heap stays modest.

## Guidance derived

- Keep request-level concurrency ≤ 32 per instance for write-heavy traffic; scale by instance-per-tenant-group, never by sharing one SQLite file across processes.
- Reverse-proxy request timeout ≥ 2× the client write budget (see deployment guide).
- Alert on sustained event-loop delay > 100 ms and `/health` p95 > 250 ms.

## Limitations

- Single host, loopback network (no TLS/proxy overhead).
- 4 vCPU container; fsync-heavy writes scale with storage hardware.
- Seeded test Kernel fixture; heavier provider sets shift evaluate cost.
- No multi-hour soak in this run (post-v1: long-duration and million-row profiles).
