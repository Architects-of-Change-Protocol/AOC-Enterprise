# AOC Enterprise — Performance Baseline (v1.0.0)

Reproducible single-client benchmark of the Enterprise Host against real SQLite stores (WAL, `synchronous=FULL`), using the same seeded Kernel provider fixture as the contract test suite — no mocks anywhere in the measured path.

## How to reproduce

```bash
npm ci && npm run build
node scripts/benchmark-enterprise.mjs           # full baseline (200 recorded iterations)
node scripts/benchmark-enterprise.mjs --quick   # smoke run (25 iterations)
node scripts/benchmark-enterprise.mjs --json    # machine-readable output
```

No environment variables are read by the benchmark itself; it fully configures the Host it boots (loopback HTTP, `error` log level, SQLite files in a fresh OS temp directory deleted after the run). The only CLI flags are `--quick` and `--json`. The script prints its environment block — record it alongside results.

## Methodology

- **Warm-up:** every scenario runs 10 unrecorded iterations (3 in `--quick`) before measurement, absorbing JIT, prepared-statement, and page-cache warm-up. Scenarios that mutate one-shot state (assurance evaluation) run without warm-up and say so in the script.
- **Isolation:** one scenario at a time, sequential requests, dedicated fresh stores per run; cold/warm start are measured separately from steady-state scenarios.
- **Statistics:** per scenario the script reports n, mean, standard deviation, p50, p95, max, and the count of samples above the Tukey fence (q3 + 1.5·IQR). **Outliers are reported, never discarded** — every sample stays in every aggregate.
- **Determinism:** fixed request payloads, injected fixture data, no randomness; ids embed the iteration index. Latency numbers vary with hardware; shapes and validity are reproducible anywhere.

## Recorded baseline

Environment of this record:

| | |
|---|---|
| Date | 2026-07-13 |
| Node | v22.22.2 |
| OS / arch | linux x64 |
| CPU | Intel(R) Xeon(R) @ 2.80GHz, 4 vCPU |
| RAM | 15.7 GiB |
| Dataset | fresh stores; 200 recorded + 10 warm-up iterations/scenario (50+0 for one-shot scenarios); 50 tenants; SAF v1 (4 domains, 10 controls) |

| scenario | n | mean ms | stddev ms | p50 ms | p95 ms | max ms | outliers>Tukey | ops/s |
|---|---|---|---|---|---|---|---|---|
| governanceEvaluate (Kernel + atomic store append) | 200 | 7.12 | 1.67 | 6.55 | 11.34 | 15.03 | 14 | 141 |
| governanceRead | 200 | 1.12 | 0.29 | 1.07 | 1.33 | 3.52 | 9 | 897 |
| governanceVerify (digest + chain recomputation) | 200 | 1.80 | 0.45 | 1.69 | 3.20 | 3.95 | 14 | 557 |
| evidenceBuild (projection + redaction + digests) | 200 | 1.54 | 0.47 | 1.45 | 1.86 | 5.22 | 15 | 648 |
| evidenceVerify | 200 | 1.27 | 0.44 | 1.18 | 1.68 | 4.57 | 22 | 786 |
| governanceEvaluate, large evidence set (150 items) | 50 | 13.14 | 5.07 | 11.66 | 25.60 | 39.84 | 4 | 76 |
| assuranceCreateAssessment (across 50 tenants) | 200 | 3.13 | 2.14 | 2.58 | 5.99 | 23.96 | 26 | 319 |
| assuranceEvaluate (evidence resolution + 10 controls + scoring; no warm-up, one-shot) | 50 | 7.44 | 2.52 | 6.63 | 15.88 | 16.97 | 5 | 134 |
| assuranceVerify (full recomputation incl. score re-derivation) | 50 | 1.91 | 0.44 | 1.81 | 3.32 | 3.79 | 3 | 525 |
| assuranceListFindings | 50 | 0.84 | 0.08 | 0.82 | 0.99 | 1.10 | 1 | 1189 |
| assuranceReportProjection (in-process, AUDITOR view) | 200 | 0.84 | 6.07 | 0.38 | 0.60 | 86.50 | 4 | 1190 |
| assuranceSignal (append + continuous-state derivation) | 200 | 1.98 | 0.42 | 1.90 | 2.55 | 6.18 | 14 | 504 |
| frameworkValidation (SAF v1 structural validation) | 200 | 0.019 | 0.008 | 0.018 | 0.024 | 0.11 | 18 | 51892 |

Startup and footprint:

| metric | value |
|---|---|
| cold start (fresh SQLite files → listening) | 139 ms |
| warm start (existing files, schema present → listening) | 36 ms |
| RSS after full run | 150 MiB |
| heap used after full run | 45 MiB |
| findings per completed SAF assessment (no evidence, post-review) | 4 |

## Interpretation

- **Writes are commit-bound.** `governanceEvaluate` (~7.1 ms mean, σ 1.7 ms) is dominated by the durable transactional append under `synchronous=FULL`; the 150-item evidence payload roughly doubles it (serialization + digest cost). This is the deliberate durability/latency trade.
- **Reads and verifications are sub-2 ms** with tight distributions (σ ≤ 0.5 ms). Independent verification costs roughly 1.5–2× a plain read — cheap enough for scheduled integrity sweeps.
- **Report projection** shows the one heavy-tailed distribution (σ 6.1 ms vs p50 0.38 ms): a single 86 ms GC pause landed in-sample. The Tukey column makes exactly this visible; the p50/p95 describe steady-state.
- With warm-up in place, recorded `max` values are steady-state maxima, not first-touch artifacts (previously an 83 ms first-iteration outlier appeared in-sample).

## Limitations

- Single sequential client; concurrency behavior (and correctness under concurrency) is covered by `LOAD_TEST_V1.md`.
- Fresh stores: does not measure degradation at millions of rows (post-v1: large-corpus soak).
- `synchronous=FULL` makes fsync cost dominant for writes; compare like-for-like using the environment block.
- The benchmark exercises the seeded test Kernel fixture; heavier production provider sets shift evaluate cost accordingly.
