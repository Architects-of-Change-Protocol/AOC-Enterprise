import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createDigest } from '../domain/export-package.js';
import { createExportRuntimeContext } from '../domain/export-runtime-context.js';
import type { ExportPackageItem, ExportPackageItemSourceModule, ExportPackageItemType } from '../domain/export-package-item.js';
import { ExportPackageHashService } from '../services/export-package-hash-service.js';
import {
  applyMissingReferences,
  buildApprovalSection,
  buildAuthoritySection,
  buildCitationsSection,
  buildControlPlaneSection,
  buildEnforcementSection,
  buildEnterpriseDemoSection,
  buildEventsSection,
  buildEvidenceSection,
  buildExecutionSection,
  buildExternalStandingSection,
  buildPolicySection,
  buildRecognitionSection,
  buildSummarySection,
} from '../services/export-package-section-builder.js';

const NOW = '2026-01-01T00:00:00.000Z';

function setup() {
  return { ctx: createExportRuntimeContext(NOW), hashService: new ExportPackageHashService() };
}

function makeItem(
  id: string,
  type: ExportPackageItemType,
  sourceModule: ExportPackageItemSourceModule,
  sourceId: string,
  payload: Record<string, unknown> = {},
): ExportPackageItem {
  return {
    id,
    type,
    sourceModule,
    sourceId,
    title: `Item ${id}`,
    summary: `Summary for ${id}`,
    payload,
    payloadHash: createDigest(payload),
    references: [],
    createdAt: NOW,
  };
}

describe('export-package-section-builder', () => {
  it('1. buildSummarySection produces a section of type summary', () => {
    const { ctx, hashService } = setup();
    const section = buildSummarySection(ctx, hashService, [], true);
    assert.equal(section.type, 'summary');
  });

  it('2. buildRecognitionSection produces a section of type recognition', () => {
    const { ctx, hashService } = setup();
    const section = buildRecognitionSection(ctx, hashService, [], true);
    assert.equal(section.type, 'recognition');
  });

  it('3. buildAuthoritySection produces a section of type authority', () => {
    const { ctx, hashService } = setup();
    const section = buildAuthoritySection(ctx, hashService, [], true);
    assert.equal(section.type, 'authority');
  });

  it('4. buildApprovalSection produces a section of type approval', () => {
    const { ctx, hashService } = setup();
    const section = buildApprovalSection(ctx, hashService, [], true);
    assert.equal(section.type, 'approval');
  });

  it('5. buildExternalStandingSection produces a section of type external_standing', () => {
    const { ctx, hashService } = setup();
    const section = buildExternalStandingSection(ctx, hashService, [], true);
    assert.equal(section.type, 'external_standing');
  });

  it('6. buildPolicySection produces a section of type policy', () => {
    const { ctx, hashService } = setup();
    const section = buildPolicySection(ctx, hashService, [], true);
    assert.equal(section.type, 'policy');
  });

  it('7. buildEvidenceSection produces a section of type evidence', () => {
    const { ctx, hashService } = setup();
    const section = buildEvidenceSection(ctx, hashService, [], true);
    assert.equal(section.type, 'evidence');
  });

  it('8. buildCitationsSection produces a section of type citations', () => {
    const { ctx, hashService } = setup();
    const section = buildCitationsSection(ctx, hashService, [], true);
    assert.equal(section.type, 'citations');
  });

  it('9. buildEnforcementSection produces a section of type enforcement', () => {
    const { ctx, hashService } = setup();
    const section = buildEnforcementSection(ctx, hashService, [], true);
    assert.equal(section.type, 'enforcement');
  });

  it('10. buildExecutionSection produces a section of type execution', () => {
    const { ctx, hashService } = setup();
    const section = buildExecutionSection(ctx, hashService, [], true);
    assert.equal(section.type, 'execution');
  });

  it('11. buildEventsSection produces a section of type events', () => {
    const { ctx, hashService } = setup();
    const section = buildEventsSection(ctx, hashService, [], true);
    assert.equal(section.type, 'events');
  });

  it('12. buildControlPlaneSection produces a section of type control_plane', () => {
    const { ctx, hashService } = setup();
    const section = buildControlPlaneSection(ctx, hashService, [], true);
    assert.equal(section.type, 'control_plane');
  });

  it('13. buildEnterpriseDemoSection produces a section of type enterprise_demo', () => {
    const { ctx, hashService } = setup();
    const section = buildEnterpriseDemoSection(ctx, hashService, [], true);
    assert.equal(section.type, 'enterprise_demo');
  });

  it('14. a section built with zero items has status not_available', () => {
    const { ctx, hashService } = setup();
    const section = buildPolicySection(ctx, hashService, [], true);
    assert.equal(section.status, 'not_available');
    assert.equal(section.itemCount, 0);
  });

  it('15. a section built with items has status included', () => {
    const { ctx, hashService } = setup();
    const item = makeItem('item-1', 'policy_decision', 'domain_policy_pack_runtime', 'source-1');
    const section = buildPolicySection(ctx, hashService, [item], true);
    assert.equal(section.status, 'included');
    assert.equal(section.itemCount, 1);
  });

  it('16. sectionHash is deterministic across calls with the same items', () => {
    const { ctx, hashService } = setup();
    const item = makeItem('item-1', 'policy_decision', 'domain_policy_pack_runtime', 'source-1');
    const first = buildPolicySection(ctx, hashService, [item], true);
    const second = buildPolicySection(ctx, hashService, [item], true);
    assert.equal(first.sectionHash, second.sectionHash);
  });

  it('17. applyMissingReferences promotes an included section to incomplete when given missing reference ids', () => {
    const { ctx, hashService } = setup();
    const item = makeItem('item-1', 'policy_decision', 'domain_policy_pack_runtime', 'source-1');
    const section = buildPolicySection(ctx, hashService, [item], true);
    assert.equal(section.status, 'included');
    const updated = applyMissingReferences(section, ['reference-1']);
    assert.equal(updated.status, 'incomplete');
    assert.deepEqual(updated.missingReferenceIds, ['reference-1']);
  });

  it('18. applyMissingReferences leaves a section unchanged when given an empty array', () => {
    const { ctx, hashService } = setup();
    const item = makeItem('item-1', 'policy_decision', 'domain_policy_pack_runtime', 'source-1');
    const section = buildPolicySection(ctx, hashService, [item], true);
    const updated = applyMissingReferences(section, []);
    assert.equal(updated, section);
    assert.equal(updated.status, 'included');
  });
});
