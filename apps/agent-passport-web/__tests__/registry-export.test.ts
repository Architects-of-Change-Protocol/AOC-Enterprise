import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from '../src/lib/db.js';
import {
  createOrganizationRegistry,
  createRegistryEntitlement,
  addPassportToRegistry,
} from '../src/lib/organization-registry-repository.js';
import {
  createRegistryAdminAccessToken,
  hashRegistryAdminAccessToken,
} from '../src/lib/registry-access-token.js';
import {
  createRegistryExportArtifact,
  getRegistryExportArtifactByExportId,
  listRegistryExportArtifactsByRegistryId,
  deleteRegistryExportArtifact,
  computeChecksum,
} from '../src/lib/registry-export-repository.js';
import {
  buildRegistryInventoryCsv,
  buildRegistryGovernanceJson,
  buildRegistryEvidenceBundleJson,
  buildRegistryGovernanceReportMarkdown,
  computeRegistryStanding,
  generateRegistryExport,
  listRegistryExports,
  getRegistryExportForDownload,
} from '../src/lib/registry-export-service.js';
import type {
  AgentOrganizationRegistryRecord,
  AgentRegistryPassportRecord,
} from '../src/lib/organization-registry-types.js';
import type Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let db: Database.Database;
let registry: AgentOrganizationRegistryRecord;
let passports: AgentRegistryPassportRecord[];
let adminToken: string;

function makeRegistry(opts: { maxPassports?: number; status?: string } = {}) {
  const token = createRegistryAdminAccessToken();
  const tokenHash = hashRegistryAdminAccessToken(token);
  const reg = createOrganizationRegistry(
    {
      purchaseId: `purchase_${Date.now()}_${Math.random()}`,
      organizationName: 'Acme AI Corp',
      adminAccessTokenHash: tokenHash,
      maxPassports: opts.maxPassports ?? 5,
    },
    db,
  );
  createRegistryEntitlement(reg.registryId, reg.purchaseId, opts.maxPassports ?? 5, db);
  return { reg, token };
}

function addPassport(registryId: string, name: string, runtimeGuardReady = false) {
  return addPassportToRegistry(
    {
      registryId,
      passportId: `passport_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      agentName: name,
      agentOwner: 'Test Owner',
      runtimeGuardReady,
    },
    db,
  );
}

const BASE = 'https://example.aoc.ai';
const NOW = new Date().toISOString();

// ---------------------------------------------------------------------------
// Describe: CSV builder
// ---------------------------------------------------------------------------

describe('buildRegistryInventoryCsv', () => {
  beforeEach(() => {
    db = createTestDb();
    const r = makeRegistry();
    registry = r.reg;
    adminToken = r.token;
    passports = [];
  });

  afterEach(() => db.close());

  test('includes expected headers', () => {
    const csv = buildRegistryInventoryCsv({ registry, passports: [], baseUrl: BASE });
    const firstLine = csv.split('\r\n')[0];
    assert.ok(firstLine.includes('Registry ID'));
    assert.ok(firstLine.includes('Agent Name'));
    assert.ok(firstLine.includes('Passport ID'));
    assert.ok(firstLine.includes('Passport Status'));
    assert.ok(firstLine.includes('Runtime Guard Ready'));
    assert.ok(firstLine.includes('Public Passport URL'));
    assert.ok(firstLine.includes('Public Verification URL'));
  });

  test('includes one row per passport', () => {
    const p1 = addPassport(registry.registryId, 'AgentAlpha');
    const p2 = addPassport(registry.registryId, 'AgentBeta');
    const csv = buildRegistryInventoryCsv({ registry, passports: [p1, p2], baseUrl: BASE });
    const lines = csv.split('\r\n').filter(Boolean);
    assert.equal(lines.length, 3); // header + 2 rows
    assert.ok(lines[1].includes('AgentAlpha'));
    assert.ok(lines[2].includes('AgentBeta'));
  });

  test('includes only headers when no passports', () => {
    const csv = buildRegistryInventoryCsv({ registry, passports: [], baseUrl: BASE });
    const lines = csv.split('\r\n').filter(Boolean);
    assert.equal(lines.length, 1);
  });

  test('escapes commas in values', () => {
    const p = addPassport(registry.registryId, 'Agent, With Comma');
    const csv = buildRegistryInventoryCsv({ registry, passports: [p], baseUrl: BASE });
    assert.ok(csv.includes('"Agent, With Comma"'));
  });

  test('escapes double quotes in values', () => {
    const p = addPassport(registry.registryId, 'Agent "Alpha"');
    const csv = buildRegistryInventoryCsv({ registry, passports: [p], baseUrl: BASE });
    assert.ok(csv.includes('"Agent ""Alpha"""'));
  });

  test('does not include admin token', () => {
    const csv = buildRegistryInventoryCsv({ registry, passports: [], baseUrl: BASE });
    assert.ok(!csv.includes(adminToken));
    if (registry.adminAccessTokenHash) {
      assert.ok(!csv.includes(registry.adminAccessTokenHash));
    }
  });

  test('includes public passport and verification URLs', () => {
    const p = addPassport(registry.registryId, 'LinkAgent');
    const csv = buildRegistryInventoryCsv({ registry, passports: [p], baseUrl: BASE });
    assert.ok(csv.includes(`${BASE}/passport/${p.passportId}`));
    assert.ok(csv.includes(`${BASE}/verify/${p.passportId}`));
  });
});

// ---------------------------------------------------------------------------
// Describe: Governance JSON builder
// ---------------------------------------------------------------------------

describe('buildRegistryGovernanceJson', () => {
  beforeEach(() => {
    db = createTestDb();
    const r = makeRegistry();
    registry = r.reg;
    adminToken = r.token;
    passports = [];
  });

  afterEach(() => db.close());

  test('includes registry summary', () => {
    const result = buildRegistryGovernanceJson({ registry, passports: [], baseUrl: BASE, generatedAt: NOW });
    assert.equal(result.registry.registryId, registry.registryId);
    assert.equal(result.registry.organizationName, 'Acme AI Corp');
    assert.equal(result.exportType, 'registry_governance_json');
  });

  test('includes passport links', () => {
    const p = addPassport(registry.registryId, 'LinkedAgent');
    const result = buildRegistryGovernanceJson({ registry, passports: [p], baseUrl: BASE, generatedAt: NOW });
    assert.equal(result.passports.length, 1);
    assert.ok(result.passports[0].publicPassportUrl.includes(p.passportId));
    assert.ok(result.passports[0].publicVerificationUrl.includes(p.passportId));
  });

  test('calculates capacity utilization', () => {
    const p = addPassport(registry.registryId, 'Agent1');
    // registry.maxPassports is 5, issuedPassports should be 1 after adding one
    const updatedReg = { ...registry, issuedPassports: 1, maxPassports: 5 };
    const result = buildRegistryGovernanceJson({ registry: updatedReg, passports: [p], baseUrl: BASE, generatedAt: NOW });
    assert.equal(result.governanceSummary.capacityUtilizationPercent, 20);
  });

  test('calculates public verification coverage', () => {
    const p = addPassport(registry.registryId, 'CovAgent');
    const result = buildRegistryGovernanceJson({ registry, passports: [p], baseUrl: BASE, generatedAt: NOW });
    assert.equal(result.governanceSummary.publicVerificationCoverage, 100);
  });

  test('does not include admin token or signing secret', () => {
    const json = JSON.stringify(buildRegistryGovernanceJson({ registry, passports: [], baseUrl: BASE, generatedAt: NOW }));
    assert.ok(!json.includes(adminToken));
    assert.ok(!json.includes('signingSecret'));
    assert.ok(!json.includes('admin_access_token'));
  });
});

// ---------------------------------------------------------------------------
// Describe: Evidence bundle builder
// ---------------------------------------------------------------------------

describe('buildRegistryEvidenceBundleJson', () => {
  beforeEach(() => {
    db = createTestDb();
    const r = makeRegistry();
    registry = r.reg;
    adminToken = r.token;
    passports = [];
  });

  afterEach(() => db.close());

  test('includes issuer public metadata', () => {
    const result = buildRegistryEvidenceBundleJson({ registry, entitlement: null, passports: [], baseUrl: BASE, generatedAt: NOW });
    assert.ok(result.issuer.issuerId);
    assert.ok(result.issuer.issuerName);
    assert.ok(result.issuer.issuerKeyId);
    assert.ok(result.issuer.signingAlgorithm);
  });

  test('does not include signing secret', () => {
    const json = JSON.stringify(buildRegistryEvidenceBundleJson({ registry, entitlement: null, passports: [], baseUrl: BASE, generatedAt: NOW }));
    assert.ok(!json.includes('signingSecret'));
    assert.ok(!json.includes('dev-only-agent-passport-secret'));
  });

  test('does not include admin token', () => {
    const json = JSON.stringify(buildRegistryEvidenceBundleJson({ registry, entitlement: null, passports: [], baseUrl: BASE, generatedAt: NOW }));
    assert.ok(!json.includes(adminToken));
  });

  test('includes runtime guard readiness summary', () => {
    const p1 = addPassport(registry.registryId, 'ReadyAgent', true);
    const p2 = addPassport(registry.registryId, 'NotReadyAgent', false);
    const result = buildRegistryEvidenceBundleJson({ registry, entitlement: null, passports: [p1, p2], baseUrl: BASE, generatedAt: NOW });
    assert.equal(result.evidence.runtimeGuardReadiness.readyCount, 1);
    assert.equal(result.evidence.runtimeGuardReadiness.notReadyCount, 1);
    assert.equal(result.evidence.runtimeGuardReadiness.readyPercent, 50);
  });
});

// ---------------------------------------------------------------------------
// Describe: Markdown report builder
// ---------------------------------------------------------------------------

describe('buildRegistryGovernanceReportMarkdown', () => {
  beforeEach(() => {
    db = createTestDb();
    const r = makeRegistry();
    registry = r.reg;
    adminToken = r.token;
    passports = [];
  });

  afterEach(() => db.close());

  test('includes required sections', () => {
    const md = buildRegistryGovernanceReportMarkdown({ registry, entitlement: null, passports: [], baseUrl: BASE, generatedAt: NOW });
    assert.ok(md.includes('# AOC Agent Registry Governance Report'));
    assert.ok(md.includes('## Registry Summary'));
    assert.ok(md.includes('## Capacity Summary'));
    assert.ok(md.includes('## Agent Passport Inventory'));
    assert.ok(md.includes('## Governance Standing'));
    assert.ok(md.includes('## Runtime Guard Readiness'));
    assert.ok(md.includes('## Public Verification Coverage'));
    assert.ok(md.includes('## Leadership Attention'));
    assert.ok(md.includes('## Evidence Links'));
    assert.ok(md.includes('## Current MVP Limitations'));
    assert.ok(md.includes('## Recommended Next Actions'));
    assert.ok(md.includes('## Report Metadata'));
  });

  test('includes deterministic recommendations - no passports', () => {
    const md = buildRegistryGovernanceReportMarkdown({ registry, entitlement: null, passports: [], baseUrl: BASE, generatedAt: NOW });
    assert.ok(md.includes('Enroll the first governed AI agent'));
  });

  test('includes recommendation for capacity exhausted', () => {
    const exhaustedReg = { ...registry, remainingPassports: 0, issuedPassports: 5, maxPassports: 5 };
    const md = buildRegistryGovernanceReportMarkdown({ registry: exhaustedReg, entitlement: null, passports: [addPassport(registry.registryId, 'A')], baseUrl: BASE, generatedAt: NOW });
    assert.ok(md.includes('Contact AOC to expand'));
  });

  test('does not include admin token', () => {
    const md = buildRegistryGovernanceReportMarkdown({ registry, entitlement: null, passports: [], baseUrl: BASE, generatedAt: NOW });
    assert.ok(!md.includes(adminToken));
    if (registry.adminAccessTokenHash) {
      assert.ok(!md.includes(registry.adminAccessTokenHash));
    }
  });
});

// ---------------------------------------------------------------------------
// Describe: Registry standing
// ---------------------------------------------------------------------------

describe('computeRegistryStanding', () => {
  beforeEach(() => {
    db = createTestDb();
    const r = makeRegistry();
    registry = r.reg;
    adminToken = r.token;
  });

  afterEach(() => db.close());

  test('inactive when registry is not active', () => {
    const inactiveReg = { ...registry, registryStatus: 'suspended' as const };
    const standing = computeRegistryStanding(inactiveReg, []);
    assert.equal(standing, 'inactive');
  });

  test('capacity_exhausted when remaining passports is zero', () => {
    const exhaustedReg = { ...registry, remainingPassports: 0, issuedPassports: 5, maxPassports: 5 };
    const p = addPassport(registry.registryId, 'A');
    const standing = computeRegistryStanding(exhaustedReg, [p]);
    assert.equal(standing, 'capacity_exhausted');
  });

  test('attention_required when runtime guard readiness is zero with issued passports', () => {
    const p = addPassport(registry.registryId, 'NotReady', false);
    const standing = computeRegistryStanding(registry, [p]);
    assert.equal(standing, 'attention_required');
  });

  test('good_standing when registry is active with healthy state', () => {
    const p = addPassport(registry.registryId, 'ReadyAgent', true);
    const standing = computeRegistryStanding(registry, [p]);
    assert.equal(standing, 'good_standing');
  });

  test('good_standing with no passports', () => {
    const standing = computeRegistryStanding(registry, []);
    assert.equal(standing, 'good_standing');
  });
});

// ---------------------------------------------------------------------------
// Describe: Repository
// ---------------------------------------------------------------------------

describe('registry-export-repository', () => {
  beforeEach(() => {
    db = createTestDb();
    const r = makeRegistry();
    registry = r.reg;
    adminToken = r.token;
  });

  afterEach(() => db.close());

  test('createRegistryExportArtifact persists artifact', () => {
    const artifact = createRegistryExportArtifact(
      {
        registryId: registry.registryId,
        exportType: 'registry_inventory_csv',
        format: 'csv',
        filename: 'test.csv',
        contentType: 'text/csv',
        contentText: 'header1,header2\nval1,val2',
      },
      db,
    );
    assert.ok(artifact.exportId);
    assert.equal(artifact.registryId, registry.registryId);
    assert.ok(artifact.checksumSha256);
  });

  test('getRegistryExportArtifactByExportId retrieves artifact', () => {
    const artifact = createRegistryExportArtifact(
      {
        registryId: registry.registryId,
        exportType: 'registry_governance_json',
        format: 'json',
        filename: 'gov.json',
        contentType: 'application/json',
        contentText: '{}',
      },
      db,
    );
    const retrieved = getRegistryExportArtifactByExportId(artifact.exportId, db);
    assert.ok(retrieved);
    assert.equal(retrieved.exportId, artifact.exportId);
    assert.equal(retrieved.contentText, '{}');
  });

  test('checksum_sha256 is stored and correct', () => {
    const content = 'test content for checksum';
    const artifact = createRegistryExportArtifact(
      {
        registryId: registry.registryId,
        exportType: 'registry_inventory_csv',
        format: 'csv',
        filename: 'ck.csv',
        contentType: 'text/csv',
        contentText: content,
      },
      db,
    );
    const expected = computeChecksum(content);
    assert.equal(artifact.checksumSha256, expected);
  });

  test('listRegistryExportArtifactsByRegistryId returns metadata', () => {
    createRegistryExportArtifact(
      { registryId: registry.registryId, exportType: 'registry_inventory_csv', format: 'csv', filename: 'a.csv', contentType: 'text/csv', contentText: 'a' },
      db,
    );
    createRegistryExportArtifact(
      { registryId: registry.registryId, exportType: 'registry_governance_json', format: 'json', filename: 'b.json', contentType: 'application/json', contentText: '{}' },
      db,
    );
    const list = listRegistryExportArtifactsByRegistryId(registry.registryId, 50, db);
    assert.equal(list.length, 2);
    // Metadata should NOT contain contentText
    for (const item of list) {
      assert.ok(!('contentText' in item));
    }
  });

  test('export artifact cannot be confused across registries', () => {
    const r2 = makeRegistry();
    const artifact = createRegistryExportArtifact(
      { registryId: registry.registryId, exportType: 'registry_inventory_csv', format: 'csv', filename: 'x.csv', contentType: 'text/csv', contentText: 'x' },
      db,
    );
    const list2 = listRegistryExportArtifactsByRegistryId(r2.reg.registryId, 50, db);
    assert.equal(list2.length, 0);
    assert.equal(artifact.registryId, registry.registryId);
  });
});

// ---------------------------------------------------------------------------
// Describe: Service
// ---------------------------------------------------------------------------

describe('generateRegistryExport', () => {
  beforeEach(() => {
    db = createTestDb();
    const r = makeRegistry();
    registry = r.reg;
    adminToken = r.token;
  });

  afterEach(() => db.close());

  test('rejects invalid access token', () => {
    const result = generateRegistryExport({ registryId: registry.registryId, accessToken: 'bad-token', exportType: 'registry_inventory_csv', db });
    assert.equal(result.ok, false);
    assert.ok(result.errorCode);
  });

  test('rejects invalid export type', () => {
    const result = generateRegistryExport({ registryId: registry.registryId, accessToken: adminToken, exportType: 'bad_type' as never, db });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'REGISTRY_EXPORT_INVALID_TYPE');
  });

  test('creates CSV artifact', () => {
    const result = generateRegistryExport({ registryId: registry.registryId, accessToken: adminToken, exportType: 'registry_inventory_csv', baseUrl: BASE, db });
    assert.equal(result.ok, true);
    assert.ok(result.result?.artifact.contentText.includes('Registry ID'));
  });

  test('creates governance JSON artifact', () => {
    const result = generateRegistryExport({ registryId: registry.registryId, accessToken: adminToken, exportType: 'registry_governance_json', baseUrl: BASE, db });
    assert.equal(result.ok, true);
    const parsed = JSON.parse(result.result!.artifact.contentText);
    assert.equal(parsed.exportType, 'registry_governance_json');
  });

  test('creates evidence bundle artifact', () => {
    const result = generateRegistryExport({ registryId: registry.registryId, accessToken: adminToken, exportType: 'registry_evidence_bundle_json', baseUrl: BASE, db });
    assert.equal(result.ok, true);
    const parsed = JSON.parse(result.result!.artifact.contentText);
    assert.equal(parsed.exportType, 'registry_evidence_bundle_json');
  });

  test('creates markdown report artifact', () => {
    const result = generateRegistryExport({ registryId: registry.registryId, accessToken: adminToken, exportType: 'registry_governance_report_markdown', baseUrl: BASE, db });
    assert.equal(result.ok, true);
    assert.ok(result.result?.artifact.contentText.includes('# AOC Agent Registry Governance Report'));
  });
});

describe('listRegistryExports', () => {
  beforeEach(() => {
    db = createTestDb();
    const r = makeRegistry();
    registry = r.reg;
    adminToken = r.token;
  });

  afterEach(() => db.close());

  test('rejects invalid access token', () => {
    const result = listRegistryExports({ registryId: registry.registryId, accessToken: 'wrong', db });
    assert.equal(result.ok, false);
  });

  test('returns exports for valid token', () => {
    generateRegistryExport({ registryId: registry.registryId, accessToken: adminToken, exportType: 'registry_inventory_csv', db });
    const result = listRegistryExports({ registryId: registry.registryId, accessToken: adminToken, db });
    assert.equal(result.ok, true);
    assert.equal(result.exports?.length, 1);
  });
});

describe('getRegistryExportForDownload', () => {
  beforeEach(() => {
    db = createTestDb();
    const r = makeRegistry();
    registry = r.reg;
    adminToken = r.token;
  });

  afterEach(() => db.close());

  test('rejects invalid access token', () => {
    const gen = generateRegistryExport({ registryId: registry.registryId, accessToken: adminToken, exportType: 'registry_inventory_csv', db });
    const result = getRegistryExportForDownload({ registryId: registry.registryId, accessToken: 'bad', exportId: gen.result!.artifact.exportId, db });
    assert.equal(result.ok, false);
  });

  test('rejects export from another registry', () => {
    const r2 = makeRegistry();
    const gen = generateRegistryExport({ registryId: registry.registryId, accessToken: adminToken, exportType: 'registry_inventory_csv', db });
    const result = getRegistryExportForDownload({ registryId: r2.reg.registryId, accessToken: r2.token, exportId: gen.result!.artifact.exportId, db });
    assert.equal(result.ok, false);
  });

  test('returns artifact with filename/contentType/content/checksum', () => {
    const gen = generateRegistryExport({ registryId: registry.registryId, accessToken: adminToken, exportType: 'registry_inventory_csv', db });
    const result = getRegistryExportForDownload({ registryId: registry.registryId, accessToken: adminToken, exportId: gen.result!.artifact.exportId, db });
    assert.equal(result.ok, true);
    assert.ok(result.artifact?.filename);
    assert.ok(result.artifact?.contentType);
    assert.ok(result.artifact?.contentText);
    assert.ok(result.artifact?.checksumSha256);
  });

  test('returns 404 for missing export', () => {
    const result = getRegistryExportForDownload({ registryId: registry.registryId, accessToken: adminToken, exportId: 'exp_nonexistent', db });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'REGISTRY_EXPORT_NOT_FOUND');
  });
});
