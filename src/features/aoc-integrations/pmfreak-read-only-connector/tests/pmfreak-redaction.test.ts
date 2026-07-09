import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { redactAocPMFreakConnectorSnapshot, redactAocPMFreakConnectorValue } from '../pmfreak-redaction.js';
import { createAocPMFreakConnectorSnapshot } from '../pmfreak-connector-snapshot.js';
import { createAocPMFreakReadOnlyConnectorConfig } from '../pmfreak-read-only-connector-config.js';

function buildSensitiveMetadata() {
  return {
    contactEmail: 'demo.owner@example.com',
    token: 'sk-abcdefgh12345678',
    secret: 'sk-abcdefgh12345678',
    authorization: 'Bearer sk-abcdefgh12345678',
    connectionString: 'postgres://user:password@db.example.com:5432/pmfreak',
    safeNote: 'This value should survive redaction.',
  };
}

describe('AOC PMFreak connector redaction', () => {
  it('mode "none" leaves values unchanged', () => {
    const input = buildSensitiveMetadata();
    const redacted = redactAocPMFreakConnectorValue(input, 'none');
    assert.deepEqual(redacted, input);
  });

  it('mode "safe_demo" removes obvious email/token/secret/authorization/connection-string values without mutating the input', () => {
    const input = buildSensitiveMetadata();
    const inputCopy = { ...input };

    const redacted = redactAocPMFreakConnectorValue(input, 'safe_demo') as Record<string, unknown>;

    assert.equal(redacted['contactEmail'], '[redacted-email]');
    assert.equal(redacted['token'], '[redacted-secret]');
    assert.equal(redacted['secret'], '[redacted-secret]');
    assert.equal(redacted['authorization'], '[redacted-secret]');
    assert.equal(redacted['connectionString'], '[redacted-secret]');
    assert.equal(redacted['safeNote'], 'This value should survive redaction.');

    assert.deepEqual(input, inputCopy);
  });

  it('mode "strict" applies safe_demo redaction and removes metadata/sourceUrl on a snapshot without mutating the input', async () => {
    const config = createAocPMFreakReadOnlyConnectorConfig();
    const project = {
      projectId: 'project.demo.network-refresh',
      workspaceId: 'workspace.demo.pmfreak',
      milestoneIds: [],
      taskIds: [],
      riskIds: [],
      evidenceReferenceIds: [],
      approvalReferenceIds: [],
      actionProposalIds: [],
      sourceUrl: 'https://pmfreak.example.com/projects/network-refresh',
      metadata: { contactEmail: 'demo.owner@example.com' },
    };

    const snapshot = createAocPMFreakConnectorSnapshot({
      config,
      projects: [project],
      agents: [],
      milestones: [],
      tasks: [],
      risks: [],
      evidenceReferences: [],
      approvalReferences: [],
      actionProposals: [],
    });

    const originalSnapshotJson = JSON.stringify(snapshot);
    const redactedSnapshot = redactAocPMFreakConnectorSnapshot(snapshot, 'strict');

    assert.equal(redactedSnapshot.projects[0]!.sourceUrl, '[redacted-url]');
    assert.deepEqual(redactedSnapshot.projects[0]!.metadata, {});
    assert.equal(JSON.stringify(snapshot), originalSnapshotJson);
  });

  it('redacting a snapshot applies to evidence/approval reference metadata as well', () => {
    const config = createAocPMFreakReadOnlyConnectorConfig();
    const snapshot = createAocPMFreakConnectorSnapshot({
      config,
      projects: [],
      agents: [],
      milestones: [],
      tasks: [],
      risks: [],
      evidenceReferences: [
        {
          evidenceReferenceId: 'evidence.demo.x',
          projectId: 'project.demo.network-refresh',
          present: true,
          redacted: false,
          metadata: { preparedBy: 'demo.owner@example.com' },
        },
      ],
      approvalReferences: [],
      actionProposals: [],
    });

    const redacted = redactAocPMFreakConnectorSnapshot(snapshot, 'safe_demo');
    assert.equal(redacted.evidenceReferences[0]!.metadata['preparedBy'], '[redacted-email]');
  });
});
