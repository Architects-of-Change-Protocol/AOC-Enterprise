import Link from 'next/link';
import { getRegistryByRegistryId, getEntitlementByRegistryId, listRegistryPassports } from '@/lib/organization-registry-repository';
import { verifyRegistryAdminAccessToken } from '@/lib/registry-access-token';
import { listRegistryExportArtifactsByRegistryId } from '@/lib/registry-export-repository';
import type { RegistryExportArtifactMeta } from '@/lib/registry-export-types';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Organization Agent Registry — AOC Agent Passport',
};

interface Props {
  searchParams: { registry_id?: string; access_token?: string };
}

export default function RegistryAdminPage({ searchParams }: Props) {
  const { registry_id, access_token } = searchParams;

  // Access gate
  if (!registry_id || !access_token) {
    return <AccessDenied />;
  }

  const registry = getRegistryByRegistryId(registry_id);
  if (!registry) {
    return <AccessDenied />;
  }

  if (!registry.adminAccessTokenHash || !verifyRegistryAdminAccessToken(access_token, registry.adminAccessTokenHash)) {
    return <AccessDenied />;
  }

  const entitlement = getEntitlementByRegistryId(registry_id);
  const passports = listRegistryPassports(registry_id);
  const exportHistory = listRegistryExportArtifactsByRegistryId(registry_id, 20);

  const activeCount = passports.filter(p => p.status === 'active').length;
  const revokedCount = passports.filter(p => p.status === 'revoked').length;
  const runtimeReadyCount = passports.filter(p => p.runtimeGuardReady).length;
  const hasCapacity = (registry.remainingPassports ?? 0) > 0;

  const enrollHref = hasCapacity
    ? `/enroll-agent?registry_id=${encodeURIComponent(registry_id)}&access_token=${encodeURIComponent(access_token)}`
    : null;

  return (
    <div className="container" style={{ paddingTop: 40, paddingBottom: 80 }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 40 }}>
        <div className="section-label">Organization Registry</div>
        <h1>Organization Agent Registry</h1>
        <p style={{ color: 'var(--text-muted)', maxWidth: 640 }}>
          Manage your governed AI agent passports, verification links, and runtime governance readiness.
        </p>
      </div>

      {/* Registry header card */}
      <div className="card" style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Registry Details</h2>
        <div className="form-grid form-grid-2" style={{ gap: 12 }}>
          <Info label="Organization" value={registry.organizationName} />
          <Info label="Registry ID" value={registry.registryId} mono />
          <Info label="Status" value={<span className={`badge badge-${registry.registryStatus === 'active' ? 'active' : 'revoked'}`}>{registry.registryStatus}</span>} />
          <Info label="Governance Level" value={registry.governanceLevel} />
          {registry.buyerEmail && <Info label="Buyer Email" value={registry.buyerEmail} />}
          <Info label="Created" value={new Date(registry.createdAt).toLocaleDateString()} />
          {registry.stripeSubscriptionId && (
            <Info label="Subscription" value={registry.stripeSubscriptionId.slice(0, 20) + '...'} mono />
          )}
        </div>
      </div>

      {/* Capacity cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16, marginBottom: 32 }}>
        <CapacityCard label="Max Passports" value={registry.maxPassports} />
        <CapacityCard label="Issued" value={registry.issuedPassports} />
        <CapacityCard label="Remaining" value={registry.remainingPassports} highlight={hasCapacity} />
        <CapacityCard label="Active Agents" value={activeCount} />
        <CapacityCard label="Runtime Guard Ready" value={runtimeReadyCount} />
        <CapacityCard label="Entitlement" value={entitlement?.status ?? '—'} />
      </div>

      {/* Governance summary */}
      <div className="card" style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Governance Summary</h2>
        <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--text-muted)', lineHeight: 2 }}>
          <li>{activeCount} agent{activeCount !== 1 ? 's' : ''} active</li>
          <li>{revokedCount} agent{revokedCount !== 1 ? 's' : ''} revoked or expired</li>
          <li>{runtimeReadyCount} agent{runtimeReadyCount !== 1 ? 's' : ''} Runtime Guard ready</li>
          <li>{registry.remainingPassports} passport slot{registry.remainingPassports !== 1 ? 's' : ''} remaining</li>
          <li>Registry standing: <strong>{registry.registryStatus === 'active' ? 'Good standing' : registry.registryStatus}</strong></li>
        </ul>
      </div>

      {/* Passport inventory */}
      <div className="card" style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Agent Passport Inventory</h2>
        {passports.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No agents enrolled yet. Use the enrollment link below to add your first agent.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Agent', 'Passport ID', 'Owner', 'Status', 'Gov Status', 'Runtime Guard', 'Issued', 'Links'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600, color: 'var(--text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {passports.map(p => (
                  <tr key={p.passportId} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{p.agentName}</td>
                    <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 11 }}>{p.passportId.slice(0, 20)}…</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{p.agentOwner ?? '—'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span className={`badge badge-${p.status === 'active' ? 'active' : 'revoked'}`}>{p.status}</span>
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{p.governanceStatus ?? '—'}</td>
                    <td style={{ padding: '10px 12px' }}>{p.runtimeGuardReady ? '✓' : '—'}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{new Date(p.createdAt).toLocaleDateString()}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Link href={`/passport/${p.passportId}`} style={{ fontSize: 12 }}>Passport</Link>
                        <Link href={`/verify/${p.passportId}`} style={{ fontSize: 12 }}>Verify</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Enroll another agent */}
      <div className="card" style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Enroll Another Agent</h2>
        {hasCapacity && enrollHref ? (
          <>
            <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
              {registry.remainingPassports} passport slot{registry.remainingPassports !== 1 ? 's' : ''} remaining in your registry.
            </p>
            <Link href={enrollHref} className="btn btn-primary">
              Enroll another governed agent →
            </Link>
          </>
        ) : (
          <>
            <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>Registry capacity exhausted. All 10 passport slots have been used.</p>
            <a href="mailto:hello@architectsofchange.ai?subject=Registry+Capacity+Expansion" className="btn btn-secondary">
              Contact AOC to expand registry capacity
            </a>
          </>
        )}
      </div>

      {/* Governance Exports */}
      <div className="card" style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Governance Exports</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
          Download registry inventory and governance evidence for internal review, procurement, compliance, and executive reporting.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
          <ExportCard
            title="Registry Inventory CSV"
            description="Spreadsheet-friendly list of all registered agent passports."
            ctaLabel="Generate CSV"
            registryId={registry_id}
            accessToken={access_token}
            exportType="registry_inventory_csv"
          />
          <ExportCard
            title="Governance JSON"
            description="Machine-readable governance summary for security and compliance systems."
            ctaLabel="Generate JSON"
            registryId={registry_id}
            accessToken={access_token}
            exportType="registry_governance_json"
          />
          <ExportCard
            title="Evidence Bundle JSON"
            description="Evidence package with issuer metadata, verification links, capacity and Runtime Guard readiness."
            ctaLabel="Generate Evidence Bundle"
            registryId={registry_id}
            accessToken={access_token}
            exportType="registry_evidence_bundle_json"
          />
          <ExportCard
            title="Governance Report"
            description="Buyer-ready markdown report for internal audit, procurement and leadership review."
            ctaLabel="Generate Report"
            registryId={registry_id}
            accessToken={access_token}
            exportType="registry_governance_report_markdown"
          />
        </div>

        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Export History</h3>
        {exportHistory.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No registry exports have been generated yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Export Type', 'Filename', 'Generated At', 'Checksum', 'Download'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600, color: 'var(--text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {exportHistory.map(exp => (
                  <ExportHistoryRow key={exp.exportId} exp={exp} registryId={registry_id} accessToken={access_token} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MVP note */}
      <div style={{ padding: '16px 20px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text-muted)' }}>
        <strong>MVP Registry View:</strong> This buyer admin view is an MVP registry surface. Full user accounts, team permissions, and billing portal are planned for future sprints. Governance exports are now available above.
      </div>
    </div>
  );
}

function AccessDenied() {
  return (
    <div className="container" style={{ maxWidth: 520, paddingTop: 80, textAlign: 'center' }}>
      <div className="section-label">Access Required</div>
      <h1 style={{ fontSize: 26, marginBottom: 16 }}>Registry Access Denied</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 32 }}>
        A valid registry ID and access token are required to view this registry. Use the admin URL from your checkout confirmation.
      </p>
      <Link href="/pricing" className="btn btn-primary">View Pricing</Link>
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontFamily: mono ? 'monospace' : undefined, fontSize: mono ? 12 : 14 }}>{value}</div>
    </div>
  );
}

function ExportCard({
  title,
  description,
  ctaLabel,
  registryId,
  accessToken,
  exportType,
}: {
  title: string;
  description: string;
  ctaLabel: string;
  registryId: string;
  accessToken: string;
  exportType: string;
}) {
  const href = `/api/organization-registry/${encodeURIComponent(registryId)}/exports?_generate=1&access_token=${encodeURIComponent(accessToken)}&export_type=${encodeURIComponent(exportType)}`;
  return (
    <div style={{ padding: '16px', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>{title}</div>
      <div style={{ color: 'var(--text-muted)', fontSize: 12, flex: 1 }}>{description}</div>
      <form method="POST" action={`/api/organization-registry/${encodeURIComponent(registryId)}/exports`} style={{ marginTop: 4 }}>
        <input type="hidden" name="access_token" value={accessToken} />
        <input type="hidden" name="export_type" value={exportType} />
        <a
          href={href}
          style={{
            display: 'inline-block',
            padding: '6px 12px',
            background: 'var(--accent, rgba(255,255,255,0.08))',
            border: '1px solid var(--border)',
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          {ctaLabel}
        </a>
      </form>
    </div>
  );
}

function ExportHistoryRow({
  exp,
  registryId,
  accessToken,
}: {
  exp: RegistryExportArtifactMeta;
  registryId: string;
  accessToken: string;
}) {
  const downloadHref = `/api/organization-registry/${encodeURIComponent(registryId)}/exports/${encodeURIComponent(exp.exportId)}?access_token=${encodeURIComponent(accessToken)}`;
  return (
    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{exp.exportType.replace(/_/g, ' ')}</td>
      <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 11 }}>{exp.filename}</td>
      <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{new Date(exp.generatedAt).toLocaleString()}</td>
      <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 10 }}>{exp.checksumSha256.slice(0, 16)}…</td>
      <td style={{ padding: '8px 10px' }}>
        <a href={downloadHref} download={exp.filename} style={{ fontSize: 12 }}>Download</a>
      </td>
    </tr>
  );
}

function CapacityCard({ label, value, highlight }: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <div style={{
      padding: '16px 20px',
      border: `1px solid ${highlight ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`,
      borderRadius: 8,
      background: highlight ? 'rgba(34,197,94,0.04)' : undefined,
    }}>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}
