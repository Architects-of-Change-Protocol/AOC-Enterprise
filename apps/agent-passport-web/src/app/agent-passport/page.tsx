import Link from 'next/link';

export const metadata = {
  title: 'AOC Agent Passport — Give your AI agents a constitution',
};

export default function AgentPassportPage() {
  return (
    <div>
      {/* Hero */}
      <section className="hero">
        <div className="container">
          <div className="section-label">Agent Governance Protocol</div>
          <h1>Give your AI agents<br />a constitution.</h1>
          <p>
            AOC Agent Passport gives agents identity, authority, limits, and a public verification
            layer. Runtime Guard makes that identity enforceable inside governed runtimes.
          </p>
          <div className="hero-actions">
            <Link href="/enroll-agent" className="btn btn-primary">
              Enroll an Agent
            </Link>
            <Link href="/sample-passport" className="btn btn-secondary">
              View Sample Passport
            </Link>
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* What it is */}
      <section className="section">
        <div className="container">
          <div className="section-label">How it works</div>
          <h2>Enrollment creates a governed identity.</h2>
          <p style={{ marginBottom: 32 }}>
            Each enrolled agent receives a cryptographically signed passport, a constitution
            defining its authority, and a policy manifest governing its runtime actions.
            Verification is public and tamper-evident.
          </p>

          <div className="card-grid card-grid-3">
            <div className="card">
              <div style={{ fontSize: 24, marginBottom: 12 }}>🪪</div>
              <h3 style={{ marginBottom: 8, fontSize: 16 }}>Identity</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                A passport ID, agent name, owner, purpose, and jurisdiction. Cryptographically
                signed and publicly verifiable.
              </p>
            </div>
            <div className="card">
              <div style={{ fontSize: 24, marginBottom: 12 }}>📜</div>
              <h3 style={{ marginBottom: 8, fontSize: 16 }}>Constitution</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                A hash-anchored constitution defining allowed actions, prohibited actions,
                human oversight requirements, and data access limits.
              </p>
            </div>
            <div className="card">
              <div style={{ fontSize: 24, marginBottom: 12 }}>🔒</div>
              <h3 style={{ marginBottom: 8, fontSize: 16 }}>Runtime Enforcement</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                Runtime Guard Lite does not control the model's internal reasoning. It controls
                whether a governed action is allowed to become real-world execution.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* Verification */}
      <section className="section">
        <div className="container">
          <div className="two-col" style={{ alignItems: 'center' }}>
            <div>
              <div className="section-label">Verification</div>
              <h2>Publicly checkable governance.</h2>
              <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
                Any passport can be verified by its ID. The verification page shows
                passport status, hashes, signature validity, and runtime seal status.
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                Removing the passport does not destroy the agent, but it destroys the
                agent's AOC-governed verification status. Inside a governed runtime,
                missing or invalid passports must cause governed execution to fail.
              </p>
            </div>
            <div className="card">
              <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                Verification URL
              </div>
              <div className="mono-block">
                /verify/AGT-XXXXXXXX-XXXX-XXXX
              </div>
              <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span className="badge badge-valid">✓ Valid passport</span>
                <span className="badge badge-valid">✓ Runtime seal valid</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* CTA */}
      <section style={{ padding: '64px 0', textAlign: 'center' }}>
        <div className="container">
          <h2 style={{ marginBottom: 16, fontSize: 24 }}>Ready to govern your agent?</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 32 }}>
            Start with the sample passport to see what a governed agent looks like.
            Then enroll your own.
          </p>
          <div className="hero-actions">
            <Link href="/sample-passport" className="btn btn-primary">
              View Sample Passport
            </Link>
            <Link href="/enroll-agent" className="btn btn-secondary">
              Enroll an Agent
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
