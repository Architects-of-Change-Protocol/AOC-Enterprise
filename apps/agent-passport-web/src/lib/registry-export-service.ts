import type Database from 'better-sqlite3';
import { getDb } from './db.js';
import { verifyRegistryAccess } from './organization-registry-service.js';
import {
  getEntitlementByRegistryId,
  listRegistryPassports,
} from './organization-registry-repository.js';
import { getPublicIssuerMetadata } from './issuer-config.js';
import {
  createRegistryExportArtifact,
  getRegistryExportArtifactByExportId,
  listRegistryExportArtifactsByRegistryId,
} from './registry-export-repository.js';
import type {
  RegistryExportType,
  RegistryExportFormat,
  RegistryExportArtifactRecord,
  RegistryExportArtifactMeta,
  RegistryExportGenerationResult,
  RegistryGovernanceJsonExport,
  RegistryEvidenceBundleExport,
  RegistryStanding,
} from './registry-export-types.js';
import type {
  AgentOrganizationRegistryRecord,
  AgentRegistryEntitlementRecord,
  AgentRegistryPassportRecord,
} from './organization-registry-types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_AGENT_PASSPORT_BASE_URL;
  if (envUrl) return envUrl.replace(/\/$/, '');
  if (process.env.NODE_ENV === 'production') return '';
  return 'http://localhost:3000';
}

function passportUrl(passportId: string, base: string): string {
  return `${base}/passport/${passportId}`;
}

function verifyUrl(passportId: string, base: string): string {
  return `${base}/verify/${passportId}`;
}

function dateStamp(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, '');
}

function exportFilename(
  prefix: string,
  registryId: string,
  ext: string,
  generatedAt: string,
): string {
  return `${prefix}-${registryId}-${dateStamp(generatedAt)}.${ext}`;
}

// ---------------------------------------------------------------------------
// Standing calculation
// ---------------------------------------------------------------------------

export function computeRegistryStanding(
  registry: AgentOrganizationRegistryRecord,
  passports: AgentRegistryPassportRecord[],
): RegistryStanding {
  if (registry.registryStatus !== 'active') return 'inactive';
  if (registry.remainingPassports <= 0 && registry.issuedPassports > 0) return 'capacity_exhausted';

  const hasRevoked = passports.some(p => p.status === 'revoked' || p.status === 'expired');
  const runtimeReadyCount = passports.filter(p => p.runtimeGuardReady).length;
  const hasZeroRuntimeReady = passports.length > 0 && runtimeReadyCount === 0;

  if (hasRevoked || hasZeroRuntimeReady) return 'attention_required';
  return 'good_standing';
}

// ---------------------------------------------------------------------------
// CSV builder
// ---------------------------------------------------------------------------

function escapeCsvValue(value: string | null | undefined): string {
  const v = value == null ? '' : String(value);
  if (v.includes(',') || v.includes('"') || v.includes('\n') || v.includes('\r')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

export interface CsvBuilderInput {
  registry: AgentOrganizationRegistryRecord;
  passports: AgentRegistryPassportRecord[];
  baseUrl: string;
}

export function buildRegistryInventoryCsv(input: CsvBuilderInput): string {
  const { registry, passports, baseUrl } = input;
  const headers = [
    'Registry ID',
    'Organization Name',
    'Agent Name',
    'Agent Owner',
    'Passport ID',
    'Passport Status',
    'Governance Status',
    'Runtime Guard Ready',
    'Issued At',
    'Public Passport URL',
    'Public Verification URL',
  ];

  const rows: string[] = [headers.map(escapeCsvValue).join(',')];

  for (const p of passports) {
    const row = [
      registry.registryId,
      registry.organizationName,
      p.agentName,
      p.agentOwner ?? '',
      p.passportId,
      p.status,
      p.governanceStatus ?? '',
      p.runtimeGuardReady ? 'Yes' : 'No',
      p.createdAt,
      passportUrl(p.passportId, baseUrl),
      verifyUrl(p.passportId, baseUrl),
    ];
    rows.push(row.map(escapeCsvValue).join(','));
  }

  return rows.join('\r\n');
}

// ---------------------------------------------------------------------------
// Governance JSON builder
// ---------------------------------------------------------------------------

export interface GovernanceJsonBuilderInput {
  registry: AgentOrganizationRegistryRecord;
  passports: AgentRegistryPassportRecord[];
  baseUrl: string;
  generatedAt: string;
}

export function buildRegistryGovernanceJson(
  input: GovernanceJsonBuilderInput,
): RegistryGovernanceJsonExport {
  const { registry, passports, baseUrl, generatedAt } = input;
  const totalAgents = passports.length;
  const activeAgents = passports.filter(p => p.status === 'active').length;
  const revokedAgents = passports.filter(p => p.status === 'revoked').length;
  const expiredAgents = passports.filter(p => p.status === 'expired').length;
  const runtimeGuardReadyAgents = passports.filter(p => p.runtimeGuardReady).length;
  const capacityUtilizationPercent =
    registry.maxPassports > 0
      ? Math.round((registry.issuedPassports / registry.maxPassports) * 100)
      : 0;
  const publicVerificationCoverage =
    totalAgents > 0 ? Math.round((totalAgents / totalAgents) * 100) : 0;

  return {
    exportType: 'registry_governance_json',
    generatedAt,
    generatedBy: 'aoc_agent_passport',
    registry: {
      registryId: registry.registryId,
      organizationName: registry.organizationName,
      registryStatus: registry.registryStatus,
      governanceLevel: registry.governanceLevel,
      maxPassports: registry.maxPassports,
      issuedPassports: registry.issuedPassports,
      remainingPassports: registry.remainingPassports,
    },
    governanceSummary: {
      totalAgents,
      activeAgents,
      revokedAgents,
      expiredAgents,
      runtimeGuardReadyAgents,
      publicVerificationCoverage,
      capacityUtilizationPercent,
      registryStanding: computeRegistryStanding(registry, passports),
    },
    passports: passports.map(p => ({
      passportId: p.passportId,
      agentName: p.agentName,
      agentOwner: p.agentOwner,
      status: p.status,
      governanceStatus: p.governanceStatus,
      runtimeGuardReady: p.runtimeGuardReady,
      issuedAt: p.createdAt,
      publicPassportUrl: passportUrl(p.passportId, baseUrl),
      publicVerificationUrl: verifyUrl(p.passportId, baseUrl),
    })),
    limitations: [
      'This is an MVP governance evidence export.',
      'This export does not constitute a certified compliance attestation.',
      'Runtime Guard readiness is self-reported by the registry at enrollment time.',
      'Admin access token is not included in this export.',
    ],
  };
}

// ---------------------------------------------------------------------------
// Evidence bundle builder
// ---------------------------------------------------------------------------

export interface EvidenceBundleBuilderInput {
  registry: AgentOrganizationRegistryRecord;
  entitlement: AgentRegistryEntitlementRecord | null;
  passports: AgentRegistryPassportRecord[];
  baseUrl: string;
  generatedAt: string;
}

export function buildRegistryEvidenceBundleJson(
  input: EvidenceBundleBuilderInput,
): RegistryEvidenceBundleExport {
  const { registry, entitlement, passports, baseUrl, generatedAt } = input;
  const issuer = getPublicIssuerMetadata();
  const totalPassports = passports.length;
  const readyCount = passports.filter(p => p.runtimeGuardReady).length;
  const notReadyCount = totalPassports - readyCount;
  const readyPercent = totalPassports > 0 ? Math.round((readyCount / totalPassports) * 100) : 0;

  const govBreakdown: Record<string, number> = {};
  for (const p of passports) {
    const key = p.governanceStatus ?? 'unknown';
    govBreakdown[key] = (govBreakdown[key] ?? 0) + 1;
  }

  return {
    exportType: 'registry_evidence_bundle_json',
    generatedAt,
    generatedBy: 'aoc_agent_passport',
    registry: {
      registryId: registry.registryId,
      organizationName: registry.organizationName,
      registryStatus: registry.registryStatus,
      governanceLevel: registry.governanceLevel,
      tier: 'organization_agent_registry',
    },
    entitlement: entitlement
      ? {
          maxQuantity: entitlement.maxQuantity,
          usedQuantity: entitlement.usedQuantity,
          remainingQuantity: entitlement.remainingQuantity,
          status: entitlement.status,
        }
      : { maxQuantity: 0, usedQuantity: 0, remainingQuantity: 0, status: 'unknown' },
    issuer,
    evidence: {
      passportCount: totalPassports,
      passportVerificationLinks: passports.map(p => ({
        passportId: p.passportId,
        publicVerificationUrl: verifyUrl(p.passportId, baseUrl),
      })),
      runtimeGuardReadiness: { readyCount, notReadyCount, readyPercent },
      governanceStatusBreakdown: govBreakdown,
      publicVerificationCoverage: {
        totalPassports,
        verificationLinksAvailable: totalPassports,
        coveragePercent: totalPassports > 0 ? 100 : 0,
      },
    },
    passports: passports.map(p => ({
      passportId: p.passportId,
      agentName: p.agentName,
      agentOwner: p.agentOwner,
      status: p.status,
      governanceStatus: p.governanceStatus,
      runtimeGuardReady: p.runtimeGuardReady,
      registryId: p.registryId,
      publicPassportUrl: passportUrl(p.passportId, baseUrl),
      publicVerificationUrl: verifyUrl(p.passportId, baseUrl),
    })),
    securityNotes: [
      'Admin access token is not included in this export.',
      'Signing secret is not included in this export.',
      'Only public issuer metadata is included.',
    ],
    limitations: [
      'This is an MVP governance evidence export.',
      'This export does not constitute a certified compliance attestation.',
      'Runtime Guard readiness is self-reported by the registry at enrollment time.',
    ],
  };
}

// ---------------------------------------------------------------------------
// Markdown report builder
// ---------------------------------------------------------------------------

export interface MarkdownBuilderInput {
  registry: AgentOrganizationRegistryRecord;
  entitlement: AgentRegistryEntitlementRecord | null;
  passports: AgentRegistryPassportRecord[];
  baseUrl: string;
  generatedAt: string;
}

function buildRecommendations(
  registry: AgentOrganizationRegistryRecord,
  passports: AgentRegistryPassportRecord[],
  standing: RegistryStanding,
): string[] {
  const recs: string[] = [];

  if (passports.length === 0) {
    recs.push('Enroll the first governed AI agent into this organization registry.');
    return recs;
  }

  if (standing === 'capacity_exhausted') {
    recs.push('Contact AOC to expand organization registry passport capacity.');
  }

  const runtimeReadyCount = passports.filter(p => p.runtimeGuardReady).length;
  if (runtimeReadyCount === 0 && passports.length > 0) {
    recs.push('Review Runtime Guard readiness for registered agents.');
  }

  const hasRevoked = passports.some(p => p.status === 'revoked' || p.status === 'expired');
  if (hasRevoked) {
    recs.push('Review revoked or expired passports and update registry governance status.');
  }

  if (standing === 'good_standing' && recs.length === 0) {
    recs.push('Continue maintaining passport verification and governance evidence for registered agents.');
  }

  return recs;
}

export function buildRegistryGovernanceReportMarkdown(
  input: MarkdownBuilderInput,
): string {
  const { registry, entitlement, passports, baseUrl, generatedAt } = input;
  const issuer = getPublicIssuerMetadata();
  const standing = computeRegistryStanding(registry, passports);
  const totalPassports = passports.length;
  const activePassports = passports.filter(p => p.status === 'active').length;
  const revokedPassports = passports.filter(p => p.status === 'revoked').length;
  const expiredPassports = passports.filter(p => p.status === 'expired').length;
  const runtimeReadyCount = passports.filter(p => p.runtimeGuardReady).length;
  const runtimeReadyPercent = totalPassports > 0 ? Math.round((runtimeReadyCount / totalPassports) * 100) : 0;
  const capacityUtilizationPercent = registry.maxPassports > 0
    ? Math.round((registry.issuedPassports / registry.maxPassports) * 100)
    : 0;
  const recs = buildRecommendations(registry, passports, standing);

  const lines: string[] = [
    '# AOC Agent Registry Governance Report',
    '',
    '---',
    '',
    '## Registry Summary',
    '',
    `| Field | Value |`,
    `|---|---|`,
    `| Organization | ${registry.organizationName} |`,
    `| Registry ID | \`${registry.registryId}\` |`,
    `| Registry Status | ${registry.registryStatus} |`,
    `| Governance Level | ${registry.governanceLevel} |`,
    `| Tier | organization_agent_registry |`,
    '',
    '## Capacity Summary',
    '',
    `| Field | Value |`,
    `|---|---|`,
    `| Maximum Passports | ${registry.maxPassports} |`,
    `| Issued Passports | ${registry.issuedPassports} |`,
    `| Remaining Passports | ${registry.remainingPassports} |`,
    `| Capacity Utilization | ${capacityUtilizationPercent}% |`,
    entitlement ? `| Entitlement Status | ${entitlement.status} |` : '',
    '',
    '## Agent Passport Inventory',
    '',
  ];

  if (totalPassports === 0) {
    lines.push('No agent passports have been enrolled in this registry yet.');
  } else {
    lines.push(
      `| Passport ID | Agent Name | Owner | Status | Governance Status | Runtime Guard | Passport URL | Verify URL |`,
      `|---|---|---|---|---|---|---|---|`,
    );
    for (const p of passports) {
      lines.push(
        `| \`${p.passportId.slice(0, 20)}…\` | ${p.agentName} | ${p.agentOwner ?? '—'} | ${p.status} | ${p.governanceStatus ?? '—'} | ${p.runtimeGuardReady ? 'Yes' : 'No'} | [View](${passportUrl(p.passportId, baseUrl)}) | [Verify](${verifyUrl(p.passportId, baseUrl)}) |`,
      );
    }
  }

  lines.push(
    '',
    '## Governance Standing',
    '',
    `**Current Standing:** ${standing}`,
    '',
  );

  if (standing === 'inactive') {
    lines.push('> Registry is not currently active. Review registry status before proceeding.');
  } else if (standing === 'capacity_exhausted') {
    lines.push('> Registry capacity is exhausted. No additional passports can be issued.');
  } else if (standing === 'attention_required') {
    lines.push('> Registry requires attention. Review the items below.');
  } else {
    lines.push('> Registry is in good standing.');
  }

  lines.push(
    '',
    '## Runtime Guard Readiness',
    '',
    `| Metric | Value |`,
    `|---|---|`,
    `| Ready | ${runtimeReadyCount} |`,
    `| Not Ready | ${totalPassports - runtimeReadyCount} |`,
    `| Ready Percent | ${runtimeReadyPercent}% |`,
    '',
  );

  if (totalPassports > 0 && runtimeReadyCount === 0) {
    lines.push('> No agents are currently Runtime Guard ready. Review enrollment settings.');
    lines.push('');
  }

  lines.push(
    '## Public Verification Coverage',
    '',
    `| Metric | Value |`,
    `|---|---|`,
    `| Total Passports | ${totalPassports} |`,
    `| Verification Links Available | ${totalPassports} |`,
    `| Coverage | ${totalPassports > 0 ? 100 : 0}% |`,
    '',
    '## Leadership Attention',
    '',
  );

  const attentionItems: string[] = [];
  if (revokedPassports > 0) attentionItems.push(`${revokedPassports} passport(s) revoked.`);
  if (expiredPassports > 0) attentionItems.push(`${expiredPassports} passport(s) expired.`);
  if (registry.remainingPassports === 0 && totalPassports > 0) attentionItems.push('Registry capacity exhausted.');
  if (runtimeReadyCount === 0 && totalPassports > 0) attentionItems.push('No agents are Runtime Guard ready.');

  if (attentionItems.length === 0) {
    lines.push('No immediate leadership attention required.');
  } else {
    for (const item of attentionItems) {
      lines.push(`- ${item}`);
    }
  }

  lines.push(
    '',
    '## Evidence Links',
    '',
  );

  if (passports.length === 0) {
    lines.push('No passports enrolled yet.');
  } else {
    for (const p of passports) {
      lines.push(`- **${p.agentName}** — [Passport](${passportUrl(p.passportId, baseUrl)}) | [Verify](${verifyUrl(p.passportId, baseUrl)})`);
    }
  }

  lines.push(
    '',
    '## Current MVP Limitations',
    '',
    '- This export is an MVP governance evidence export and does not constitute a certified compliance attestation.',
    '- Runtime Guard readiness is self-reported at enrollment time.',
    '- Admin access token is not included in this export.',
    '- No automated recurring report generation.',
    '- No PDF export in this version.',
    '- Organization name defaults to "My Organization" if not collected at checkout.',
    '',
    '## Recommended Next Actions',
    '',
  );

  for (const rec of recs) {
    lines.push(`- ${rec}`);
  }

  lines.push(
    '',
    '## Report Metadata',
    '',
    `| Field | Value |`,
    `|---|---|`,
    `| Generated At | ${generatedAt} |`,
    `| Generated By | aoc_agent_passport |`,
    `| Registry ID | \`${registry.registryId}\` |`,
    `| Issuer ID | ${issuer.issuerId} |`,
    `| Issuer Name | ${issuer.issuerName} |`,
    `| Issuer Key ID | ${issuer.issuerKeyId} |`,
    `| Signing Algorithm | ${issuer.signingAlgorithm} |`,
    '',
    '---',
    '',
    '*This report was generated by AOC Agent Passport. It is provided as governance evidence for internal use only.*',
    '',
  );

  return lines.filter(l => l !== null).join('\n');
}

// ---------------------------------------------------------------------------
// HTML report builder (optional)
// ---------------------------------------------------------------------------

export function buildRegistryGovernanceReportHtml(
  input: MarkdownBuilderInput,
): string {
  const md = buildRegistryGovernanceReportMarkdown(input);
  // Simple HTML wrapper without external dependencies
  const escaped = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AOC Agent Registry Governance Report</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.6; }
  pre { background: #f5f5f5; padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 13px; }
  table { border-collapse: collapse; width: 100%; margin: 16px 0; }
  th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
  th { background: #f8f8f8; font-weight: 600; }
  h1, h2, h3 { margin-top: 32px; }
  hr { border: none; border-top: 1px solid #ddd; margin: 32px 0; }
  blockquote { margin: 0; padding: 12px 16px; background: #fffbe6; border-left: 4px solid #f5a623; }
</style>
</head>
<body>
<pre>${escaped}</pre>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Export type metadata
// ---------------------------------------------------------------------------

const EXPORT_META: Record<RegistryExportType, { format: RegistryExportFormat; contentType: string; ext: string; prefix: string }> = {
  registry_inventory_csv: {
    format: 'csv',
    contentType: 'text/csv',
    ext: 'csv',
    prefix: 'aoc-agent-registry-inventory',
  },
  registry_governance_json: {
    format: 'json',
    contentType: 'application/json',
    ext: 'json',
    prefix: 'aoc-agent-registry-governance',
  },
  registry_evidence_bundle_json: {
    format: 'json',
    contentType: 'application/json',
    ext: 'json',
    prefix: 'aoc-agent-registry-evidence-bundle',
  },
  registry_governance_report_markdown: {
    format: 'markdown',
    contentType: 'text/markdown',
    ext: 'md',
    prefix: 'aoc-agent-registry-governance-report',
  },
  registry_governance_report_html: {
    format: 'html',
    contentType: 'text/html',
    ext: 'html',
    prefix: 'aoc-agent-registry-governance-report',
  },
};

const VALID_EXPORT_TYPES = new Set<string>(Object.keys(EXPORT_META));

export function isValidExportType(v: string): v is RegistryExportType {
  return VALID_EXPORT_TYPES.has(v);
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export interface GenerateRegistryExportInput {
  registryId: string;
  accessToken: string;
  exportType: RegistryExportType;
  baseUrl?: string;
  db?: Database.Database;
}

export interface GenerateRegistryExportResult {
  ok: boolean;
  errorCode?: string;
  result?: RegistryExportGenerationResult;
}

export function generateRegistryExport(
  input: GenerateRegistryExportInput,
): GenerateRegistryExportResult {
  const database = input.db ?? getDb();
  const access = verifyRegistryAccess(input.registryId, input.accessToken, database);
  if (!access.ok || !access.registry) {
    return { ok: false, errorCode: access.errorCode ?? 'REGISTRY_EXPORT_ACCESS_DENIED' };
  }

  if (!isValidExportType(input.exportType)) {
    return { ok: false, errorCode: 'REGISTRY_EXPORT_INVALID_TYPE' };
  }

  const registry = access.registry;
  const entitlement = getEntitlementByRegistryId(input.registryId, database);
  const passports = listRegistryPassports(input.registryId, database);
  const base = input.baseUrl ?? getBaseUrl();
  const generatedAt = new Date().toISOString();

  const meta = EXPORT_META[input.exportType];

  let contentText: string;
  try {
    contentText = buildExportContent(input.exportType, {
      registry,
      entitlement,
      passports,
      baseUrl: base,
      generatedAt,
    });
  } catch (_err) {
    return { ok: false, errorCode: 'REGISTRY_EXPORT_GENERATION_FAILED' };
  }

  const filename = exportFilename(meta.prefix, registry.registryId, meta.ext, generatedAt);

  const artifact = createRegistryExportArtifact(
    {
      registryId: input.registryId,
      exportType: input.exportType,
      format: meta.format,
      filename,
      contentType: meta.contentType,
      contentText,
      generatedAt,
    },
    database,
  );

  const downloadUrl = `${base}/api/organization-registry/${input.registryId}/exports/${artifact.exportId}?access_token=${encodeURIComponent(input.accessToken)}`;

  return {
    ok: true,
    result: { artifact, downloadUrl },
  };
}

function buildExportContent(
  exportType: RegistryExportType,
  input: {
    registry: AgentOrganizationRegistryRecord;
    entitlement: AgentRegistryEntitlementRecord | null;
    passports: AgentRegistryPassportRecord[];
    baseUrl: string;
    generatedAt: string;
  },
): string {
  switch (exportType) {
    case 'registry_inventory_csv':
      return buildRegistryInventoryCsv({ registry: input.registry, passports: input.passports, baseUrl: input.baseUrl });
    case 'registry_governance_json':
      return JSON.stringify(buildRegistryGovernanceJson(input), null, 2);
    case 'registry_evidence_bundle_json':
      return JSON.stringify(buildRegistryEvidenceBundleJson(input), null, 2);
    case 'registry_governance_report_markdown':
      return buildRegistryGovernanceReportMarkdown(input);
    case 'registry_governance_report_html':
      return buildRegistryGovernanceReportHtml(input);
  }
}

export interface ListRegistryExportsInput {
  registryId: string;
  accessToken: string;
  limit?: number;
  db?: Database.Database;
}

export interface ListRegistryExportsResult {
  ok: boolean;
  errorCode?: string;
  exports?: RegistryExportArtifactMeta[];
}

export function listRegistryExports(input: ListRegistryExportsInput): ListRegistryExportsResult {
  const database = input.db ?? getDb();
  const access = verifyRegistryAccess(input.registryId, input.accessToken, database);
  if (!access.ok) {
    return { ok: false, errorCode: access.errorCode ?? 'REGISTRY_EXPORT_ACCESS_DENIED' };
  }

  const exports = listRegistryExportArtifactsByRegistryId(input.registryId, input.limit ?? 50, database);
  return { ok: true, exports };
}

export interface GetExportForDownloadInput {
  registryId: string;
  accessToken: string;
  exportId: string;
  db?: Database.Database;
}

export interface GetExportForDownloadResult {
  ok: boolean;
  errorCode?: string;
  artifact?: RegistryExportArtifactRecord;
}

export function getRegistryExportForDownload(
  input: GetExportForDownloadInput,
): GetExportForDownloadResult {
  const database = input.db ?? getDb();
  const access = verifyRegistryAccess(input.registryId, input.accessToken, database);
  if (!access.ok) {
    return { ok: false, errorCode: access.errorCode ?? 'REGISTRY_EXPORT_ACCESS_DENIED' };
  }

  const artifact = getRegistryExportArtifactByExportId(input.exportId, database);
  if (!artifact) {
    return { ok: false, errorCode: 'REGISTRY_EXPORT_NOT_FOUND' };
  }

  if (artifact.registryId !== input.registryId) {
    return { ok: false, errorCode: 'REGISTRY_EXPORT_ACCESS_DENIED' };
  }

  return { ok: true, artifact };
}

export function generateAllRegistryReportPackArtifacts(
  input: Omit<GenerateRegistryExportInput, 'exportType'>,
): RegistryExportGenerationResult[] {
  const types: RegistryExportType[] = [
    'registry_inventory_csv',
    'registry_governance_json',
    'registry_evidence_bundle_json',
    'registry_governance_report_markdown',
    'registry_governance_report_html',
  ];

  const results: RegistryExportGenerationResult[] = [];
  for (const exportType of types) {
    const result = generateRegistryExport({ ...input, exportType });
    if (result.ok && result.result) {
      results.push(result.result);
    }
  }
  return results;
}
