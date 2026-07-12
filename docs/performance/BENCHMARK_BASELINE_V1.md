# AOC Enterprise — Performance Baseline (v1.0.0)

Reproducible single-client benchmark of the Enterprise Host against real SQLite stores (WAL, `synchronous=FULL`), using the same seeded Kernel provider fixture as the contract test suite — no mocks anywhere in the measured path.

## How to reproduce

```bash
npm ci && npm run build
node scripts/benchmark-enterprise.mjs           # full baseline (200 iterations)
node scripts/benchmark-enterprise.mjs --quick   # smoke run (25 iterations)
node scripts/benchmark-enterprise.mjs --json    # machine-readable output
```

The script prints its environment block; record it alongside results. Latencies are wall-clock per operation, sequential (single client). Stores live in a fresh OS temp directory per run and are deleted afterwards.

## Recorded baseline

Environment of this record:

| | |
|---|---|
| Date | 2026-07-12 |
| Node | v22.22.2 |
| OS / arch | linux x64 |
| CPU | Intel(R) Xeon(R) @ 2.80GHz, 4 vCPU |
| RAM | 15.7 GiB |
| Dataset | fresh stores; 200 iterations/scenario (50 for expensive scenarios); 50 tenants; SAF v1 framework (4 domains, 10 controls) |

Results (full run, `--quick` disabled):

| scenario | n | mean ms | p50 ms | p95 ms | max ms | ops/s |
|---|---|---|---|---|---|---|
| governanceEvaluate (Kernel + atomic store append) | 200 | 6.68 | 5.82 | 10.23 | 83.05 | 150 |
| governanceRead | 200 | 0.96 | 0.89 | 1.24 | 3.74 | 1045 |
| governanceVerify (full digest + chain recomputation) | 200 | 1.55 | 1.44 | 2.94 | 3.55 | 644 |
| evidenceBuild (projection + redaction + digests) | 200 | 1.34 | 1.21 | 1.95 | 4.07 | 747 |
| evidenceVerify | 200 | 0.98 | 0.92 | 1.15 | 3.49 | 1021 |
| governanceEvaluate, large evidence set (150 items) | 50 | 10.43 | 9.89 | 16.90 | 18.77 | 96 |
| assuranceCreateAssessment (across 50 tenants) | 200 | 3.12 | 2.94 | 3.95 | 24.52 | 321 |
| assuranceEvaluate (evidence resolution + 10 controls + scoring) | 50 | 7.29 | 6.62 | 9.70 | 23.71 | 137 |
| assuranceVerify (full recomputation incl. score re-derivation) | 50 | 1.70 | 1.55 | 3.17 | 3.25 | 587 |
| assuranceListFindings | 50 | 0.74 | 0.68 | 0.94 | 2.38 | 1349 |
| assuranceReportProjection (in-process, AUDITOR view) | 200 | 0.30 | 0.27 | 0.37 | 1.89 | 3288 |
| assuranceSignal (append + continuous-state derivation) | 200 | 2.06 | 1.96 | 2.62 | 7.03 | 487 |
| frameworkValidation (SAF v1 structural validation) | 200 | 0.019 | 0.016 | 0.033 | 0.21 | 52897 |

Startup and footprint:

| metric | value |
|---|---|
| cold start (fresh SQLite files → listening) | 117 ms |
| warm start (existing files, schema present → listening) | 32 ms |
| RSS after full run | 151 MiB |
| heap used after full run | 44 MiB |
| findings per completed SAF assessment (no evidence, post-review) | 4 |

## Interpretation

- **Writes are commit-bound.** `governanceEvaluate` (~6.7 ms mean) is dominated by the durable transactional append under `synchronous=FULL`; large evidence payloads add serialization + digest cost (~10.4 ms at 150 evidence items). This is the deliberate durability/latency trade — see `AOC_ENTERPRISE_CURRENT_PERSISTENCE_MODEL` docs.
- **Reads and verifications are sub-2 ms.** Independent verification (digest + chain + score recomputation) costs roughly 1.5–2× a plain read — cheap enough to run on schedules.
- **Report projection and framework validation are pure CPU** (no I/O): thousands of ops/s.
- **Max outliers** on first-touch scenarios (83 ms first evaluate) are cold-cache effects (first prepared-statement execution, first WAL growth); p95 is the operative number.

## Limitations

- Single sequential client; concurrency behavior is covered by `LOAD_TEST_V1.md`.
- Fresh stores: does not measure degradation at millions of rows (indexes exist on all hot paths; post-v1 work includes a large-corpus soak).
- Timing depends on hardware and filesystem (`synchronous=FULL` makes fsync cost dominant for writes); always compare like-for-like using the environment block.
- The benchmark exercises the seeded test Kernel fixture; a production provider set with heavier providers shifts evaluate cost accordingly.
