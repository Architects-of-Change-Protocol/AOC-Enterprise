import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { buildControlPlaneDemoFixture } from '../fixtures/control-plane-demo.fixture.js';
import { buildControlPlaneReadModel } from '../services/control-plane-read-model-service.js';
import { queryPolicyPackViewModel } from '../services/control-plane-policy-pack-query-service.js';
import type { PolicyPackControlPlaneViewModel } from '../domain/policy-pack-view-model.js';

describe('ControlPlanePolicyPackQueryService', () => {
  let policyPacks: PolicyPackControlPlaneViewModel;

  before(async () => {
    const model = buildControlPlaneReadModel(await buildControlPlaneDemoFixture());
    policyPacks = model.policyPacks;
  });

  it('1. filters by policy pack ID', () => {
    const packId = policyPacks.packs[0]!.id;
    const result = queryPolicyPackViewModel(policyPacks, { packId });
    assert.ok(result.packs.length > 0);
    assert.ok(result.packs.every((pack) => pack.id === packId));
  });

  it('2. filters by version ID', () => {
    const versionId = policyPacks.versions[0]!.id;
    const result = queryPolicyPackViewModel(policyPacks, { versionId });
    assert.ok(result.versions.length > 0);
    assert.ok(result.versions.every((version) => version.id === versionId));
  });

  it('3. filters by rule ID', () => {
    const ruleId = policyPacks.rules[0]!.id;
    const result = queryPolicyPackViewModel(policyPacks, { ruleId });
    assert.ok(result.rules.length > 0);
    assert.ok(result.rules.every((rule) => rule.id === ruleId));
  });

  it('4. filters by decision type', () => {
    const result = queryPolicyPackViewModel(policyPacks, { decisionType: 'denied' });
    assert.ok(result.decisions.length > 0);
    assert.ok(result.decisions.every((decision) => decision.type === 'denied'));
  });

  it('5. filters by action', () => {
    const result = queryPolicyPackViewModel(policyPacks, { action: 'change_bank_account' });
    assert.ok(result.decisions.length > 0);
    assert.ok(result.decisions.every((decision) => decision.action === 'change_bank_account'));
  });

  it('6. filters by actorId', () => {
    const actorId = policyPacks.decisions[0]!.actorId;
    const result = queryPolicyPackViewModel(policyPacks, { actorId });
    assert.ok(result.decisions.every((decision) => decision.actorId === actorId));
  });

  it('7. filters by resourceScope', () => {
    const resourceScope = policyPacks.decisions[0]!.resourceScope;
    const result = queryPolicyPackViewModel(policyPacks, { resourceScope });
    assert.ok(result.decisions.every((decision) => decision.resourceScope === resourceScope));
  });

  it('8. filters by jurisdiction', () => {
    const withJurisdiction = policyPacks.evaluations.find((evaluation) => evaluation.jurisdiction !== undefined);
    if (withJurisdiction?.jurisdiction === undefined) return;
    const jurisdiction = withJurisdiction.jurisdiction;
    const result = queryPolicyPackViewModel(policyPacks, { jurisdiction });
    assert.ok(result.evaluations.every((evaluation) => evaluation.jurisdiction === jurisdiction));
  });

  it('9. filters by country', () => {
    const withCountry = policyPacks.versions.find((version) => version.countries.length > 0);
    const country = withCountry?.countries[0];
    if (country === undefined) return;
    const result = queryPolicyPackViewModel(policyPacks, { country });
    assert.ok(result.versions.every((version) => version.countries.includes(country)));
  });

  it('10. filters by domain', () => {
    const result = queryPolicyPackViewModel(policyPacks, { domain: 'payments' });
    assert.ok(result.packs.length > 0);
    assert.ok(result.packs.every((pack) => pack.domain === 'payments'));
  });

  it('11. filters by demoOnly', () => {
    const result = queryPolicyPackViewModel(policyPacks, { demoOnly: true });
    assert.ok(result.packs.length > 0);
    assert.ok(result.packs.every((pack) => pack.demoOnly === true));
  });

  it('12. filters by legalCompleteness', () => {
    const result = queryPolicyPackViewModel(policyPacks, { legalCompleteness: 'not_legal_advice' });
    assert.ok(result.packs.length > 0);
    assert.ok(result.packs.every((pack) => pack.legalCompleteness === 'not_legal_advice'));
  });

  it('13. filters allowed decisions', () => {
    const result = queryPolicyPackViewModel(policyPacks, { allowed: true });
    assert.ok(result.decisions.every((decision) => decision.allowed === true));
  });

  it('14. filters blocked decisions', () => {
    const result = queryPolicyPackViewModel(policyPacks, { allowed: false });
    assert.ok(result.decisions.length > 0);
    assert.ok(result.decisions.every((decision) => decision.allowed === false));
  });

  it('15. text search finds pack name', () => {
    const packName = policyPacks.packs[0]!.name;
    const needle = packName.split(' ')[0]!;
    const result = queryPolicyPackViewModel(policyPacks, { search: needle });
    assert.ok(result.packs.some((pack) => pack.name === packName));
  });

  it('16. text search finds rule name', () => {
    const ruleName = policyPacks.rules[0]!.name;
    const needle = ruleName.split(' ')[0]!;
    const result = queryPolicyPackViewModel(policyPacks, { search: needle });
    assert.ok(result.rules.some((rule) => rule.name === ruleName));
  });

  it('17. text search finds reasonCode', () => {
    const decision = policyPacks.decisions[0]!;
    const result = queryPolicyPackViewModel(policyPacks, { search: decision.reasonCode });
    assert.ok(result.decisions.some((d) => d.id === decision.id));
  });

  it('18. text search finds proofHash', () => {
    const proof = policyPacks.proofs[0]!;
    const result = queryPolicyPackViewModel(policyPacks, { search: proof.proofHash });
    assert.ok(result.proofs.some((p) => p.id === proof.id));
  });

  it('19. text search finds eventHash', () => {
    const event = policyPacks.events[0]!;
    const result = queryPolicyPackViewModel(policyPacks, { search: event.eventHash });
    assert.ok(result.events.some((e) => e.id === event.id));
  });

  it('20. deterministic sorting', () => {
    const first = queryPolicyPackViewModel(policyPacks, {});
    const second = queryPolicyPackViewModel(policyPacks, {});
    assert.deepEqual(first.packs.map((p) => p.id), second.packs.map((p) => p.id));
    assert.deepEqual(first.decisions.map((d) => d.id), second.decisions.map((d) => d.id));
    const sortedPackIds = [...first.packs.map((p) => p.id)].sort();
    assert.deepEqual(first.packs.map((p) => p.id), sortedPackIds);
  });
});
