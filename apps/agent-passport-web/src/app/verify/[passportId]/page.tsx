import Link from 'next/link';
import { verifyAgentPassportBundle } from '@/lib/passport-adapter';

export const metadata = {
  title: 'Passport Verification — AOC Agent Passport',
};

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ passportId: string }>;
}) {
  const { passportId } = await params;
  const verifiedAt = new Date().toISOString();

  const result = await verifyAgentPassportBundle(passportId);

  if (!result) {
    return (
      <div className="container" style={{ paddingTop: 64, paddingBottom: 80 }}>
        <div className="page-header">
          <div className="section-label">Verification</div>
          <h1>Passport Not Found</h1>
        </div>
        <div className="verify-result invalid">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 24 }}>✗</span>
            <strong>Invalid passport</strong>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            No passport exists for ID: <span className="mono">{passportId}</span>
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 8 }}>
            Removing the passport does not destroy the agent, but it destroys the agent's
            AOC-governed verification status. Inside a governed runtime, missing or invalid
            passports must cause governed execution to fail.
          </p>
        </div>
        <div style={{ marginTop: 24 }}>
          <Link href="/enroll-agent" className="btn btn-primary">Enroll an Agent</Link>
        </div>
      </div>
    );
  }

  const { passportResult, runtimeSealResult, publicPayload } = result;
  const overallValid = passportResult.valid && (runtimeSealResult === null || runtimeSealResult.valid);

  return (
    <div className="container" style={{ paddingTop: 40, paddingBottom: 80 }}>
      <div className="page-header">
        <div className="section-label">Verification</div>
        <h1>{publicPayload.agentName}</h1>
        <p style={{ color: 'var(--text-muted)' }}>
          Passport verification result for <span className="mono">{passportId}</span>
        </p>
      </div>

      {/* Overall result */}
      <div className={`verify-result ${overallValid ? 'valid' : 'invalid'}`} style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 28 }}>{overallValid ? '✓' : '✗'}</span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {overallValid ? 'Passport valid' : 'Passport invalid'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
              Verified at {new Date(verifiedAt).toLocaleString()}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className={`badge ${passportResult.valid ? 'badge-valid' : 'badge-invalid'}`}>
            {passportResult.valid ? '✓ Signature valid' : '✗ Signature invalid'}
          </span>
          {runtimeSealResult !== null ? (
            <span className={`badge ${runtimeSealResult.valid ? 'badge-valid' : 'badge-invalid'}`}>
              {runtimeSealResult.valid ? '✓ Runtime seal valid' : '✗ Runtime seal invalid'}
            </span>
          ) : (
            <span className="badge badge-invalid">No runtime seal</span>
          )}
          <span className={`badge ${publicPayload.status === 'active' || publicPayload.status === 'issued' ? 'badge-active' : 'badge-revoked'}`}>
            Status: {publicPayload.status}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 24 }}>

        {/* Public payload */}
        <div className="two-col">
          <div className="card">
            <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Identity
            </h2>
            <div style={{ display: 'grid', gap: 10 }}>
              <VRow label="Agent" value={publicPayload.agentName} />
              <VRow label="Owner" value={publicPayload.ownerName} />
              <VRow label="Jurisdiction" value={publicPayload.jurisdiction} />
              <VRow label="Issuer" value={publicPayload.issuer} />
              <VRow label="Issued At" value={new Date(publicPayload.issuedAt).toLocaleString()} />
            </div>
          </div>
          <div className="card">
            <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Governance
            </h2>
            <div style={{ display: 'grid', gap: 10 }}>
              <VRow label="Governance Level" value={publicPayload.governanceLevel} />
              <VRow label="Risk Tier" value={publicPayload.riskTier} />
              <VRow label="Autonomy Level" value={publicPayload.autonomyLevel} />
            </div>
          </div>
        </div>

        {/* Reason codes */}
        {(passportResult.reasonCodes.length > 0 || (runtimeSealResult?.reasonCodes?.length ?? 0) > 0) && (
          <div className="card">
            <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Reason Codes
            </h2>
            {passportResult.reasonCodes.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Passport</div>
                <div className="tag-list">
                  {passportResult.reasonCodes.map((code) => (
                    <span key={code} className="tag">{code}</span>
                  ))}
                </div>
              </div>
            )}
            {runtimeSealResult && runtimeSealResult.reasonCodes.length > 0 && (
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Runtime Seal</div>
                <div className="tag-list">
                  {runtimeSealResult.reasonCodes.map((code) => (
                    <span key={code} className="tag">{code}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Hashes */}
        <div className="card">
          <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Cryptographic Hashes
          </h2>
          <div style={{ display: 'grid', gap: 14 }}>
            <VHashRow label="Constitution Hash" hash={publicPayload.constitutionHash} />
            <VHashRow label="Policy Manifest Hash" hash={publicPayload.policyManifestHash} />
            <VHashRow label="Passport Hash" hash={publicPayload.passportHash} />
          </div>
        </div>

        {/* Links */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href={`/passport/${passportId}`} className="btn btn-secondary">
            View Full Passport
          </Link>
          <Link href="/enroll-agent" className="btn btn-secondary">
            Enroll Another Agent
          </Link>
        </div>

      </div>
    </div>
  );
}

function VRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
      <span style={{ color: 'var(--text-dim)' }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function VHashRow({ label, hash }: { label: string; hash: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div className="mono-block">{hash}</div>
    </div>
  );
}
