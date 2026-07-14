# Security Policy

> STATUS: DRAFT — PENDING PROFESSIONAL LEGAL REVIEW.
> **BLOCKER before external distribution:** the vulnerability reporting
> channel below is a placeholder and must be replaced with a real,
> monitored contact before this repository or its releases are shared
> outside Onchainfest LLC.

## Scope

This policy covers vulnerability reporting for AOC Enterprise, the
proprietary software in this repository. It does not cover AOC Protocol,
which is a separate repository with its own security policy (see
`docs/legal/PROTOCOL_ENTERPRISE_BOUNDARY.md` for the boundary between
the two projects). If a vulnerability spans both, report it to AOC
Enterprise's channel below and it will be routed appropriately.

## Reporting a vulnerability

**Security reporting channel: pending formal designation.**

`TODO (BLOCKER before external/public distribution): designate a
monitored security contact (e.g. a dedicated email alias) and replace
this placeholder before this repository, a release, or a security
advisory referencing this file is shared outside Onchainfest LLC.`

Until a formal channel is designated, do not open a public GitHub issue
for a suspected vulnerability. Contact the Onchainfest LLC engineering
or security lead directly through an existing internal channel.

## Do not open public vulnerability issues

Do not file suspected security vulnerabilities as public GitHub issues
or in any other public forum. Publicly disclosing an unpatched
vulnerability before it has been triaged and addressed puts users and
deployments at risk. Use the reporting channel above (once designated)
or an existing internal escalation path.

## Supported versions

| Version | Supported |
|---|---|
| 1.0.x | Yes — current release line (`v1.0.0`, see `CHANGELOG.md` and `release/RELEASE_MANIFEST.json`) |
| 0.1.x (pre-release) | No — superseded by 1.0.0 |

This table reflects the versions actually tagged/released in this
repository as of this document's authoring. It will need to be updated
as new release lines are cut.

## Responsible disclosure expectations

- Report suspected vulnerabilities privately through the designated
  channel before any public disclosure.
- Provide enough detail to reproduce the issue (affected component,
  version/commit, steps, and impact) so it can be triaged efficiently.
- Allow a reasonable period for triage and remediation before any public
  disclosure. A specific disclosure timeline has not yet been formally
  adopted; until one is published here, coordinate timing directly with
  the Onchainfest LLC contact who acknowledges your report.
- Onchainfest LLC will make reasonable efforts to acknowledge reports
  and communicate remediation status, once a formal reporting channel is
  in place.

## Existing security documentation

This repository already maintains detailed, engineering-level security
documentation, which this policy references rather than duplicates:

- `docs/security/THREAT_MODEL_V1.md` — threat model for the Enterprise
  Host runtime and its trust boundaries.
- `docs/security/THREAT_MODEL_V1_ADDENDUM.md` — supplemental coverage of
  digest/canonicalization/versioning attack classes.
- `docs/security/SECURITY_HARDENING_V1.md` — v1.0.0 hardening report
  (what was audited, changed, and left as-is).
- `docs/operations/RUNBOOKS_V1.md` §6 ("Incident response (triage)") —
  the current operational incident-response guidance.

Vulnerability reports and remediation work should be evaluated against
these existing documents where relevant, and the threat model should be
updated when a report reveals a gap in its coverage.

## No warranty

This Software is provided subject to the disclaimer in `LICENSE` §7. The
existence of this security policy does not create a warranty or
service-level commitment beyond what is stated in a separate Commercial
Agreement, where one exists.
