import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getAgentPassportBundle, runRuntimeGuardDemo } from '@/lib/passport-adapter';
import { CopyButton } from '@/components/CopyButton';
import type { AgentPassportStatus } from '@aoc-enterprise/agent-governance';

function statusBadge(status: AgentPassportStatus | string) {
  const map: Record<string, { cls: string; label: string }> = {
    active: { cls: 'badge-active', label: 'Active passport' },
    issued: { cls: 'badge-issued', label: 'Issued passport' },
    suspended: { cls: 'badge-suspended', label: 'Suspended passport' },
    revoked: { cls: 'badge-revoked', label: 'Revoked passport' },
    expired: { cls: 'badge-expired', label: 'Expired passport' },
  };
  const s = map[status] ?? { cls: 'badge-invalid', label: 'Invalid passport' };
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

export default async function PassportPage({
  params,
}: {
  params: Promise<{ passportId: string }>;
}) {
  const { passportId } = await params;
  const bundle = getAgentPassportBundle(passportId);

  if (!bundle) {
    return (
      <div className="container" style={{ paddingTop: 64, paddingBottom: 80, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <h1 style={{ marginBottom: 12 }}>Passport Not Found</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: 32 }}>
          No passport exists with ID: <span className="mono">{passportId}</span>
        </p>
        <span className="badge badge-invalid">Invalid passport</span>
        <div style={{ marginTop: 32 }}>
          <Link href="/enroll-agent" className="btn btn-primary">
            Enroll an Agent
          </Link>
        </div>
      </div>
    );
  }

  const { passport, runtimeSeal } = bundle;

  // Runtime Guard demo — allowed action
  const allowDecision = await runRuntimeGuardDemo(
    passportId,
    'create_lead',
    'create_record',
    'create_lead',
    ['crm_lead_notes'],
  );

  // Runtime Guard demo — prohibited action
  const denyDecision = await runRuntimeGuardDemo(
    passportId,
    'offer_unapproved_discounts',
    'execute_tool',
    'offer_unapproved_discounts',
    [],
  );

  const badgeSnippet = `<a href="${passport.verificationUrl}" rel="noopener">Soberanía Governed Agent: ${passport.passportId}</a>`;

  return (
    <div className="container" style={{ paddingTop: 40, paddingBottom: 80 }}>

      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div className="section-label">Agent Passport</div>
          <h1 style={{ marginBottom: 8 }}>{passport.agentName}</h1>
          <p style={{ color: 'var(--text-muted)' }}>{passport.purpose}</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          {statusBadge(passport.status)}
          <Link href={`/verify/${passport.passportId}`} className="btn btn-secondary btn-sm">
            Verify →
          </Link>
          <Link href="/governance-proof" className="btn btn-primary btn-sm">
            Proof of Governance →
          </Link>
        </div>
      </div>

      {/* Passport ID */}
      <div className="passport-id-block" style={{ marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Passport ID
          </div>
          <span className="mono" style={{ fontSize: 14, color: 'var(--text)' }}>{passport.passportId}</span>
        </div>
        <CopyButton text={passport.passportId} label="Copy ID" />
      </div>

      <div style={{ display: 'grid', gap: 24 }}>

        {/* Identity & Governance */}
        <div className="two-col">
          <div className="card">
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Identity
            </h2>
            <div style={{ display: 'grid', gap: 12 }}>
              <Row label="Agent Name" value={passport.agentName} />
              <Row label="Owner" value={passport.ownerName} />
              <Row label="Issuer" value={passport.issuer} />
              <Row label="Jurisdiction" value={passport.jurisdiction} />
              <Row label="Issued At" value={new Date(passport.issuedAt).toLocaleString()} />
              {passport.lastVerifiedAt && (
                <Row label="Last Verified" value={new Date(passport.lastVerifiedAt).toLocaleString()} />
              )}
            </div>
          </div>

          <div className="card">
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Governance
            </h2>
            <div style={{ display: 'grid', gap: 12 }}>
              <Row label="Status" value={statusBadge(passport.status)} />
              <Row label="Governance Level" value={<span className="tag">{passport.governanceLevel}</span>} />
              <Row label="Risk Tier" value={<span className="tag">{passport.riskTier}</span>} />
              <Row label="Autonomy Level" value={<span className="tag">{passport.autonomyLevel}</span>} />
              {runtimeSeal && (
                <Row label="Runtime Seal" value={<span className="badge badge-valid">Runtime seal valid</span>} />
              )}
            </div>
          </div>
        </div>

        {/* Cryptographic Hashes */}
        <div className="card">
          <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Cryptographic Hashes
          </h2>
          <div style={{ display: 'grid', gap: 16 }}>
            <HashRow label="Constitution Hash" hash={passport.constitutionHash} />
            <HashRow label="Policy Manifest Hash" hash={passport.policyManifestHash} />
            <HashRow label="Passport Hash" hash={passport.passportHash} />
          </div>
        </div>

        {/* Verification */}
        <div className="card">
          <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Verification &amp; Badge
          </h2>
          <div style={{ display: 'grid', gap: 20 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Verification URL</div>
              <div className="copy-row">
                <div className="mono-block">{passport.verificationUrl}</div>
                <CopyButton text={passport.verificationUrl} label="Copy URL" />
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>QR Payload</div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div className="qr-placeholder">
                  <div style={{ fontSize: 20 }}>⬛</div>
                  <span>QR Payload</span>
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div className="copy-row">
                    <div className="mono-block">{passport.qrPayload}</div>
                    <CopyButton text={passport.qrPayload} label="Copy" />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Badge Snippet</div>
              <div className="copy-row">
                <div className="mono-block">{badgeSnippet}</div>
                <CopyButton text={badgeSnippet} label="Copy HTML" />
              </div>
            </div>
          </div>
        </div>

        {/* Runtime Guard Demo */}
        <div className="guard-section">
          <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Runtime Guard Demo
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
            Simulated governed actions against this passport's policy manifest.
            Runtime Guard Lite controls whether a governed action is allowed to become real-world execution.
          </p>
          <div className="two-col">
            {allowDecision && (
              <div className="card" style={{ background: 'var(--bg-card-2)' }}>
                <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>create_lead</span>
                  <span className={`badge badge-${allowDecision.outcome === 'allow' ? 'allow' : allowDecision.outcome === 'deny' ? 'deny' : 'human'}`}>
                    {allowDecision.outcome === 'allow' ? '✓ Allow' : allowDecision.outcome === 'deny' ? '✗ Deny' : '⚠ Human Approval'}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Tool: <span className="mono">create_lead</span> · Category: create_record
                </div>
                <div className="mono-block" style={{ marginTop: 10, fontSize: 11 }}>
                  {allowDecision.reasonCodes.join('\n')}
                </div>
              </div>
            )}
            {denyDecision && (
              <div className="card" style={{ background: 'var(--bg-card-2)' }}>
                <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>offer_unapproved_discounts</span>
                  <span className={`badge badge-${denyDecision.outcome === 'allow' ? 'allow' : denyDecision.outcome === 'deny' ? 'deny' : 'human'}`}>
                    {denyDecision.outcome === 'allow' ? '✓ Allow' : denyDecision.outcome === 'deny' ? '✗ Deny' : '⚠ Human Approval'}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Tool: <span className="mono">offer_unapproved_discounts</span> · Category: execute_tool
                </div>
                <div className="mono-block" style={{ marginTop: 10, fontSize: 11 }}>
                  {denyDecision.reasonCodes.join('\n')}
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <span style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ fontSize: 13, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function HashRow({ label, hash }: { label: string; hash: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{label}</div>
      <div className="hash-row">
        <div className="mono-block" style={{ flex: 1 }}>{hash}</div>
        <CopyButton text={hash} />
      </div>
    </div>
  );
}
