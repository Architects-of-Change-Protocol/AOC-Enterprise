# AOC Enterprise

Sovereign infrastructure for enterprise AI agents, programmable consent, scoped machine access, policy enforcement, and audit trails.

---

## Overview

AOC Enterprise is the enterprise orchestration layer built on top of AOC Protocol.

It enables organizations to:

- Govern AI agents
- Enforce programmable consent
- Control scoped machine access
- Apply policy runtime enforcement
- Maintain enterprise auditability
- Integrate sovereign trust infrastructure into existing systems

---

## Architecture Layers

```txt
Applications
    ↓
AOC Enterprise
    ↓
AOC Protocol
    ↓
Storage / Identity / Blockchain / AI Systems
```

---

## v1.0.0 Release Documentation

| Topic | Document |
|---|---|
| Frozen HTTP API surface & versioning policy | `docs/enterprise/API_STABILITY_V1.md` |
| Threat model | `docs/security/THREAT_MODEL_V1.md` |
| Security hardening report | `docs/security/SECURITY_HARDENING_V1.md` |
| Deployment guide | `docs/operations/DEPLOYMENT_GUIDE_V1.md` |
| Operational runbooks | `docs/operations/RUNBOOKS_V1.md` |
| Backup & recovery (RPO/RTO) | `docs/operations/BACKUP_RECOVERY_V1.md` |
| Store schema & migration review | `docs/enterprise/MIGRATION_REVIEW_V1.md` |
| Test strategy | `docs/testing/TEST_STRATEGY_V1.md` |
| Performance baseline | `docs/performance/BENCHMARK_BASELINE_V1.md` |
| Load test report | `docs/performance/LOAD_TEST_V1.md` |
| Dependency audit | `docs/release/DEPENDENCY_AUDIT_V1.md` |
| Release candidate summary | `docs/release/RELEASE_CANDIDATE_V1.md` |
| Changelog | `CHANGELOG.md` |
| Release manifest | `release/RELEASE_MANIFEST.json` (regenerate via `node scripts/generate-release-manifest.mjs`) |

## Quick start

```bash
npm ci
npm run build
npm test                  # full suite: compiled root tests + contract suites + workspaces
npm run start:enterprise  # boots the Enterprise Host (see the deployment guide for configuration)
```

Client SDK: `packages/enterprise-host-sdk` (`@aoc-enterprise/enterprise-host-sdk`).
