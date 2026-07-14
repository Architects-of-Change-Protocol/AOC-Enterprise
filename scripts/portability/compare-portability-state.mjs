#!/usr/bin/env node
// Pre/post logical-equivalence comparison (Phase 14).
//
// Deliberately does NOT compare raw SQLite file bytes -- a restored file can
// have a different physical page layout than its source and still be
// logically identical (or vice versa: identical bytes but a corrupted
// logical read). Instead this opens both store sets through the real
// runtime store constructors and compares canonical, digest-bearing
// projections: decision ids/status, aggregate digests, bundle digests
// (Evidence Bundles are rebuilt deterministically -- see
// AOC_ENTERPRISE_V1_PORTABILITY_CURRENT_STATE.md for why), Passport
// state/digests, and Assurance scores/findings/eligibility/digests.
//
// Usage:
//   node scripts/portability/compare-portability-state.mjs \
//     --pre <dir> --post <dir> --fixture <fixture-manifest.json> --output <comparison.json>

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { loadEnterpriseModule, stableJsonStringify } from './lib-portability.mjs';

const SYSTEM_CONTEXT = { system: true };

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--pre') args.pre = argv[++i];
    else if (arg === '--post') args.post = argv[++i];
    else if (arg === '--fixture') args.fixture = argv[++i];
    else if (arg === '--output') args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.pre || !args.post || !args.fixture) throw new Error('Usage: compare-portability-state.mjs --pre <dir> --post <dir> --fixture <path> [--output <path>]');
  return args;
}

function storePaths(dir) {
  return {
    governance: join(dir, 'enterprise-host.sqlite'),
    passport: join(dir, 'agent-passport.sqlite'),
    assurance: join(dir, 'assurance.sqlite'),
  };
}

async function openStores(enterprise, dir) {
  const paths = storePaths(dir);
  return {
    governance: await enterprise.createSqliteGovernanceStore(paths.governance),
    passport: await enterprise.createSqlitePassportStore(paths.passport),
    assurance: await enterprise.createSqliteAssuranceStore(paths.assurance),
  };
}

async function closeStores(stores) {
  await Promise.all([stores.governance.close(), stores.passport.close(), stores.assurance.close()]);
}

async function compareGovernance(enterprise, preStores, postStores, fixture) {
  const results = [];
  for (const key of ['allowed', 'denied', 'approvalRequired']) {
    const expected = fixture.record.governance[key];
    const [preRecord, postRecord] = await Promise.all([
      preStores.governance.getByEvaluationId(SYSTEM_CONTEXT, expected.evaluationId),
      postStores.governance.getByEvaluationId(SYSTEM_CONTEXT, expected.evaluationId),
    ]);
    const [preVerify, postVerify] = await Promise.all([
      preStores.governance.verify(SYSTEM_CONTEXT, expected.evaluationId),
      postStores.governance.verify(SYSTEM_CONTEXT, expected.evaluationId),
    ]);
    results.push({
      case: key,
      evaluationId: expected.evaluationId,
      statusMatches: preRecord?.evaluation.status === postRecord?.evaluation.status && postRecord?.evaluation.status === expected.status,
      aggregateDigestMatches: preRecord?.integrity.aggregateDigest === postRecord?.integrity.aggregateDigest && postRecord?.integrity.aggregateDigest === expected.aggregateDigest,
      preValid: preVerify.valid,
      postValid: postVerify.valid,
      traceStepCountMatches: preRecord?.trace.length === postRecord?.trace.length,
      reasonCodeCountMatches: preRecord?.reasons.length === postRecord?.reasons.length,
    });
  }
  const total = await postStores.governance.query(SYSTEM_CONTEXT, {});
  return { cases: results, equivalent: results.every((r) => r.statusMatches && r.aggregateDigestMatches && r.preValid && r.postValid && r.traceStepCountMatches && r.reasonCodeCountMatches), postRecordCount: total.records.length };
}

async function compareEvidence(enterprise, preStores, postStores, fixture) {
  const evidence = fixture.record.evidence;
  const results = [];
  for (const level of ['auditor', 'customer']) {
    const expected = evidence[level];
    const policy = enterprise.getDisclosurePolicy(expected.level);
    // Deterministic, injected now/nextId so the *rebuild* is byte-reproducible
    // across both the pre and post store -- Evidence Bundles are in-memory
    // only in v1 (see the current-state doc), so this is what "the Evidence
    // Bundle survives restore" means here: the same source Governance
    // Record, re-projected under the same policy, digests identically.
    const deterministicNow = () => '2026-01-01T00:00:00.000Z';
    const deterministicNextId = (prefix) => `${prefix}-comparison-fixed`;

    const [preRecord, postRecord] = await Promise.all([
      preStores.governance.getByEvaluationId(SYSTEM_CONTEXT, evidence.sourceEvaluationId),
      postStores.governance.getByEvaluationId(SYSTEM_CONTEXT, evidence.sourceEvaluationId),
    ]);
    const preBundle = enterprise.buildEvidenceBundle(preRecord, policy, { now: deterministicNow, nextId: deterministicNextId });
    const postBundle = enterprise.buildEvidenceBundle(postRecord, policy, { now: deterministicNow, nextId: deterministicNextId });

    results.push({
      level,
      disclosurePolicy: expected.disclosurePolicy,
      rebuiltDigestMatches: preBundle.integrity.bundleDigest === postBundle.integrity.bundleDigest,
      sourceRecordDigestUnchanged: preRecord?.integrity.aggregateDigest === postRecord?.integrity.aggregateDigest,
    });
  }
  return {
    cases: results,
    equivalent: results.every((r) => r.rebuiltDigestMatches && r.sourceRecordDigestUnchanged),
    distinctBundleDigestsAcrossLevels: new Set(results.map((r) => r.disclosurePolicy)).size === results.length,
  };
}

async function comparePassport(enterprise, preStores, postStores, fixture) {
  const results = [];
  for (const key of ['active', 'suspended']) {
    const expected = fixture.record.passport[key];
    const [preLoad, postLoad] = await Promise.all([
      preStores.passport.reconstruct(SYSTEM_CONTEXT, expected.passportId),
      postStores.passport.reconstruct(SYSTEM_CONTEXT, expected.passportId),
    ]);
    const [preVerify, postVerify] = await Promise.all([
      preStores.passport.verify(SYSTEM_CONTEXT, expected.passportId),
      postStores.passport.verify(SYSTEM_CONTEXT, expected.passportId),
    ]);
    const [preEvents, postEvents] = await Promise.all([
      preStores.passport.listEvents(SYSTEM_CONTEXT, expected.passportId),
      postStores.passport.listEvents(SYSTEM_CONTEXT, expected.passportId),
    ]);
    results.push({
      case: key,
      passportId: expected.passportId,
      statusMatches: preLoad.passport?.status === postLoad.passport?.status,
      eventSequenceLengthMatches: preEvents.length === postEvents.length,
      integrityDigestMatches: preLoad.passport?.integrity.chainDigest === postLoad.passport?.integrity.chainDigest,
      preValid: preVerify.valid,
      postValid: postVerify.valid,
    });
  }
  return { cases: results, equivalent: results.every((r) => r.statusMatches && r.eventSequenceLengthMatches && r.integrityDigestMatches && r.preValid && r.postValid) };
}

async function compareAssurance(enterprise, preStores, postStores, fixture) {
  const expected = fixture.record.assurance;
  const [preAssessment, postAssessment] = await Promise.all([
    preStores.assurance.getAssessment(SYSTEM_CONTEXT, expected.assessmentId),
    postStores.assurance.getAssessment(SYSTEM_CONTEXT, expected.assessmentId),
  ]);
  const [preFindings, postFindings] = await Promise.all([
    preStores.assurance.listFindings(SYSTEM_CONTEXT, expected.assessmentId),
    postStores.assurance.listFindings(SYSTEM_CONTEXT, expected.assessmentId),
  ]);
  const [preVerify, postVerify] = await Promise.all([
    preStores.assurance.verifyAssessment(SYSTEM_CONTEXT, expected.assessmentId),
    postStores.assurance.verifyAssessment(SYSTEM_CONTEXT, expected.assessmentId),
  ]);

  const preFindingIds = preFindings.map((f) => f.findingId).sort();
  const postFindingIds = postFindings.map((f) => f.findingId).sort();
  const preEligibility = (preAssessment?.eligibility ?? []).map((e) => `${e.profileId}:${e.eligible}`).sort();
  const postEligibility = (postAssessment?.eligibility ?? []).map((e) => `${e.profileId}:${e.eligible}`).sort();

  const result = {
    assessmentId: expected.assessmentId,
    scoreMatches: preAssessment?.score.normalizedScore === postAssessment?.score.normalizedScore && postAssessment?.score.normalizedScore === expected.normalizedScore,
    findingIdsMatch: JSON.stringify(preFindingIds) === JSON.stringify(postFindingIds) && postFindingIds.length === expected.findingCount,
    eligibilityMatches: JSON.stringify(preEligibility) === JSON.stringify(postEligibility),
    assessmentDigestMatches: preAssessment?.integrity.assessmentDigest === postAssessment?.integrity.assessmentDigest && postAssessment?.integrity.assessmentDigest === expected.assessmentDigest,
    preValid: preVerify.valid,
    postValid: postVerify.valid,
  };
  return { case: result, equivalent: result.scoreMatches && result.findingIdsMatch && result.eligibilityMatches && result.assessmentDigestMatches && result.preValid && result.postValid };
}

export async function comparePortabilityState({ pre, post, fixture }) {
  const enterprise = await loadEnterpriseModule();
  const fixtureData = JSON.parse(readFileSync(resolve(fixture), 'utf8'));

  const preStores = await openStores(enterprise, resolve(pre));
  const postStores = await openStores(enterprise, resolve(post));

  try {
    const governance = await compareGovernance(enterprise, preStores, postStores, fixtureData);
    const evidence = await compareEvidence(enterprise, preStores, postStores, fixtureData);
    const passport = await comparePassport(enterprise, preStores, postStores, fixtureData);
    const assurance = await compareAssurance(enterprise, preStores, postStores, fixtureData);

    const comparison = {
      comparedAt: fixtureData.generatedAt,
      fixtureVersion: fixtureData.fixtureVersion,
      governance,
      evidence,
      passport,
      assurance,
      overallEquivalent: governance.equivalent && evidence.equivalent && passport.equivalent && assurance.equivalent,
    };
    return comparison;
  } finally {
    await closeStores(preStores);
    await closeStores(postStores);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const comparison = await comparePortabilityState(args);
  if (args.output) writeFileSync(resolve(args.output), stableJsonStringify(comparison));
  console.log(JSON.stringify(comparison, null, 2));
  if (!comparison.overallEquivalent) {
    console.error('[compare:portability:v1] Pre/post state is NOT logically equivalent.');
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);
if (isMain) {
  main().catch((error) => {
    console.error(`[compare:portability:v1] ${error.message}`);
    process.exitCode = 1;
  });
}
